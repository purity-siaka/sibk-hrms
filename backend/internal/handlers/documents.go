package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/gorm"

	"sibk-hrms/backend/internal/audit"
	"sibk-hrms/backend/internal/auth"
	"sibk-hrms/backend/internal/httpx"
	"sibk-hrms/backend/internal/models"
	"sibk-hrms/backend/internal/policy"
	"sibk-hrms/backend/internal/storage"
)

func jsonMap(v interface{}) (map[string]interface{}, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var m map[string]interface{}
	err = json.Unmarshal(b, &m)
	return m, err
}

// DocumentView is the JSON shape of a document.
type DocumentView struct {
	ID              uint       `json:"id"`
	EmployeeID      uint       `json:"employeeId"`
	EmployeeName    string     `json:"employeeName"`
	Type            string     `json:"type"`
	TypeLabel       string     `json:"typeLabel"`
	FileName        string     `json:"fileName"`
	ContentType     string     `json:"contentType"`
	Size            int64      `json:"size"`
	Status          string     `json:"status"`
	ExpiryDate      *string    `json:"expiryDate"`
	UploadedAt      time.Time  `json:"uploadedAt"`
	VerifiedByName  string     `json:"verifiedByName,omitempty"`
	VerifiedAt      *time.Time `json:"verifiedAt"`
	RejectionReason string     `json:"rejectionReason,omitempty"`
}

func (a *App) documentViews(docs []models.Document) []DocumentView {
	var ids []uint
	for _, d := range docs {
		ids = append(ids, d.EmployeeID)
	}
	names := a.employeeNames(ids)
	out := make([]DocumentView, len(docs))
	for i, d := range docs {
		label := d.Type
		if t, ok := models.DocTypeByKey(d.Type); ok {
			label = t.Label
		}
		out[i] = DocumentView{
			ID: d.ID, EmployeeID: d.EmployeeID, EmployeeName: names[d.EmployeeID], Type: d.Type, TypeLabel: label,
			FileName: d.FileName, ContentType: d.ContentType, Size: d.Size, Status: d.Status, ExpiryDate: dstr(d.ExpiryDate),
			UploadedAt: d.UploadedAt, VerifiedByName: d.VerifiedByName, VerifiedAt: d.VerifiedAt, RejectionReason: d.RejectionReason,
		}
	}
	return out
}

type checklistItem struct {
	Type     string        `json:"type"`
	Label    string        `json:"label"`
	Required bool          `json:"required"`
	Document *DocumentView `json:"document"`
}

// checklist returns every document type with the latest upload for it (if any).
func (a *App) checklist(empID uint) ([]checklistItem, error) {
	var docs []models.Document
	if err := a.DB.Where("employee_id = ?", empID).Order("uploaded_at DESC, id DESC").Find(&docs).Error; err != nil {
		return nil, err
	}
	views := a.documentViews(docs)
	latest := map[string]*DocumentView{}
	for i := range views {
		if _, ok := latest[views[i].Type]; !ok {
			latest[views[i].Type] = &views[i]
		}
	}
	out := make([]checklistItem, 0, len(models.DocumentTypes))
	for _, t := range models.DocumentTypes {
		out = append(out, checklistItem{Type: t.Key, Label: t.Label, Required: t.Required, Document: latest[t.Key]})
	}
	return out, nil
}

func (a *App) employeeChecklist(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.loadDocViewable(r, act)
	if err != nil {
		return err
	}
	items, err := a.checklist(e.ID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, items)
	return nil
}

// loadDocViewable: documents are visible to HR and the employee only (not managers).
func (a *App) loadDocViewable(r *http.Request, act *auth.Actor) (*models.Employee, error) {
	e, err := a.loadViewable(r, act)
	if err != nil {
		return nil, err
	}
	if !act.IsHR() && !act.IsEmployee(e.ID) {
		return nil, httpx.Forbidden()
	}
	return e, nil
}

func (a *App) employeeDocuments(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.loadDocViewable(r, act)
	if err != nil {
		return err
	}
	var docs []models.Document
	if err := a.DB.Where("employee_id = ?", e.ID).Order("uploaded_at DESC, id DESC").Find(&docs).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a.documentViews(docs))
	return nil
}

func (a *App) uploadEmployeeDocument(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.loadDocViewable(r, act)
	if err != nil {
		return err
	}
	return a.saveDocument(w, r, act, e)
}

func (a *App) uploadMeDocument(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.actorEmployee(act)
	if err != nil {
		return err
	}
	return a.saveDocument(w, r, act, e)
}

func (a *App) saveDocument(w http.ResponseWriter, r *http.Request, act *auth.Actor, e *models.Employee) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxDocBytes+(64<<10))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		return httpx.BadRequest("the upload is invalid or larger than 10 MB")
	}
	typ := r.FormValue("type")
	f := fieldErrs{}
	if _, ok := models.DocTypeByKey(typ); !ok {
		f["type"] = "choose a document type"
	}
	expiry, derr := parseDate(r.FormValue("expiryDate"))
	if derr != nil {
		f["expiryDate"] = derr.Error()
	}
	file, hdr, ferr := r.FormFile("file")
	if ferr != nil {
		f["file"] = "attach a file"
	}
	if err := f.err(); err != nil {
		return err
	}
	defer file.Close()
	saved, err := a.Store.Save(file, hdr.Filename, maxDocBytes, storage.Any)
	if err != nil {
		return uploadError(err, "files must be PDF, JPG, PNG or DOCX up to 10 MB")
	}
	name := hdr.Filename
	if i := strings.LastIndexAny(name, `/\`); i >= 0 {
		name = name[i+1:]
	}
	if len(name) > 200 {
		name = name[len(name)-200:]
	}
	uid := act.UserID
	d := models.Document{
		EmployeeID: e.ID, Type: typ, FileName: name, ContentType: saved.ContentType, Size: saved.Size,
		StorageKey: saved.Key, Status: models.DocPending, ExpiryDate: expiry, UploadedByID: &uid, UploadedAt: time.Now().UTC(),
	}
	if err := a.DB.Create(&d).Error; err != nil {
		a.Store.Delete(saved.Key)
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "document_upload", "document", d.ID, fmt.Sprintf("%s uploaded for %s", typ, e.FullName()))
	httpx.JSON(w, http.StatusCreated, a.documentViews([]models.Document{d})[0])
	return nil
}

func (a *App) listDocuments(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	q := a.DB.Model(&models.Document{})
	qs := r.URL.Query()
	if v := qs.Get("status"); v != "" {
		q = q.Where("status = ?", v)
	}
	if v := qs.Get("type"); v != "" {
		q = q.Where("type = ?", v)
	}
	if v := qs.Get("employeeId"); v != "" {
		q = q.Where("employee_id = ?", v)
	}
	if qs.Get("expiring") == "1" {
		limit := policy.Today().AddDate(0, 0, policy.ExpiryWindowDays)
		q = q.Where("expiry_date IS NOT NULL AND expiry_date <= ?", limit)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return err
	}
	_, size, off := httpx.Page(r)
	var docs []models.Document
	if err := q.Order("uploaded_at DESC, id DESC").Limit(size).Offset(off).Find(&docs).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]interface{}{"items": a.documentViews(docs), "total": total})
	return nil
}

func (a *App) loadDocument(r *http.Request) (*models.Document, error) {
	id, err := pathID(r)
	if err != nil {
		return nil, err
	}
	var d models.Document
	if err := a.DB.First(&d, id).Error; err != nil {
		return nil, notFound(err, "document")
	}
	return &d, nil
}

func (a *App) verifyDocument(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	d, err := a.loadDocument(r)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	uid := act.UserID
	if err := a.DB.Model(d).Updates(map[string]interface{}{"status": models.DocVerified, "verified_by_id": uid,
		"verified_by_name": act.Name, "verified_at": now, "rejection_reason": ""}).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "document_verify", "document", d.ID, d.Type+" verified")
	return a.respondDocument(w, d.ID)
}

func (a *App) rejectDocument(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	d, err := a.loadDocument(r)
	if err != nil {
		return err
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	reason := trim(in.Reason)
	if reason == "" {
		return httpx.Invalid(map[string]string{"reason": "tell the employee what to fix"})
	}
	if len(reason) > 500 {
		reason = reason[:500]
	}
	now := time.Now().UTC()
	if err := a.DB.Model(d).Updates(map[string]interface{}{"status": models.DocRejected, "verified_by_id": act.UserID,
		"verified_by_name": act.Name, "verified_at": now, "rejection_reason": reason}).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "document_reject", "document", d.ID, d.Type+" rejected")
	return a.respondDocument(w, d.ID)
}

func (a *App) respondDocument(w http.ResponseWriter, id uint) error {
	var d models.Document
	if err := a.DB.First(&d, id).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a.documentViews([]models.Document{d})[0])
	return nil
}

func (a *App) downloadDocument(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	d, err := a.loadDocument(r)
	if err != nil {
		return err
	}
	if !act.IsHR() && !act.IsEmployee(d.EmployeeID) {
		return httpx.Forbidden()
	}
	f, err := a.Store.Open(d.StorageKey)
	if err != nil {
		return httpx.NotFound("file")
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "document_download", "document", d.ID, "downloaded "+d.Type)
	w.Header().Set("Content-Type", d.ContentType)
	w.Header().Set("Content-Disposition", dispositionFor(r, d.FileName))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, "", st.ModTime(), f)
	return nil
}

func safeFilename(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r < 32 || r == '"' || r == '\\' || r > 126 {
			b.WriteByte('_')
			continue
		}
		b.WriteRune(r)
	}
	if b.Len() == 0 {
		return "document"
	}
	return b.String()
}

func (a *App) deleteDocument(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	d, err := a.loadDocument(r)
	if err != nil {
		return err
	}
	if !act.IsHR() && !(act.IsEmployee(d.EmployeeID) && d.Status == models.DocPending) {
		return httpx.Forbidden()
	}
	if err := a.DB.Delete(d).Error; err != nil {
		return err
	}
	_ = a.Store.Delete(d.StorageKey)
	audit.Log(a.DB, act, clientIP(r), "document_delete", "document", d.ID, d.Type+" deleted")
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ---- me ----

func (a *App) meProfile(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.actorEmployee(act)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a.detailView(act, e))
	return nil
}

func (a *App) updateMeProfile(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.actorEmployee(act)
	if err != nil {
		return err
	}
	var in struct {
		Phone                    *string `json:"phone"`
		Address                  *string `json:"address"`
		EmergencyContactName     *string `json:"emergencyContactName"`
		EmergencyContactPhone    *string `json:"emergencyContactPhone"`
		EmergencyContactRelation *string `json:"emergencyContactRelation"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	setStr(&e.Phone, in.Phone)
	setStr(&e.Address, in.Address)
	setStr(&e.EmergencyContactName, in.EmergencyContactName)
	setStr(&e.EmergencyContactPhone, in.EmergencyContactPhone)
	setStr(&e.EmergencyContactRelation, in.EmergencyContactRelation)
	if err := a.DB.Save(e).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "profile_update", "employee", e.ID, "updated own contact details")
	httpx.JSON(w, http.StatusOK, a.detailView(act, e))
	return nil
}

func (a *App) meChecklist(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.actorEmployee(act)
	if err != nil {
		return err
	}
	items, err := a.checklist(e.ID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, items)
	return nil
}

func (a *App) meDashboard(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.actorEmployee(act)
	if err != nil {
		return err
	}
	items, err := a.checklist(e.ID)
	if err != nil {
		return err
	}
	required, uploaded, pending := 0, 0, 0
	for _, it := range items {
		if it.Document != nil && it.Document.Status == models.DocPending {
			pending++
		}
		if it.Required {
			required++
			if it.Document != nil && it.Document.Status != models.DocRejected {
				uploaded++
			}
		}
	}
	var openTasks int64
	a.DB.Model(&models.Task{}).Where("employee_id = ? AND status IN ?", e.ID, []string{models.TaskPending, models.TaskInProgress}).Count(&openTasks)
	var anns []models.Announcement
	a.DB.Order("pinned DESC, created_at DESC").Limit(5).Find(&anns)
	httpx.JSON(w, http.StatusOK, map[string]interface{}{
		"employee": a.detailView(act, e), "documentsUploaded": uploaded, "documentsRequired": required,
		"documentsPending": pending, "openTasks": openTasks,
		"announcements": announcementViews(anns),
	})
	return nil
}

// ---- change requests ----

// ChangeRequestView is the JSON shape of a profile change request.
type ChangeRequestView struct {
	ID            uint       `json:"id"`
	EmployeeID    uint       `json:"employeeId"`
	EmployeeName  string     `json:"employeeName"`
	Field         string     `json:"field"`
	OldValue      string     `json:"oldValue"`
	NewValue      string     `json:"newValue"`
	Reason        string     `json:"reason"`
	Status        string     `json:"status"`
	IsBankChange  bool       `json:"isBankChange"`
	DecidedByName string     `json:"decidedByName,omitempty"`
	DecidedAt     *time.Time `json:"decidedAt"`
	DecisionNote  string     `json:"decisionNote,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
}

func (a *App) changeRequestViews(rows []models.ChangeRequest) []ChangeRequestView {
	var ids []uint
	for _, c := range rows {
		ids = append(ids, c.EmployeeID)
	}
	names := a.employeeNames(ids)
	out := make([]ChangeRequestView, len(rows))
	for i, c := range rows {
		out[i] = ChangeRequestView{c.ID, c.EmployeeID, names[c.EmployeeID], c.Field, c.OldValue, c.NewValue, c.Reason, c.Status,
			c.Field == "bankName" || c.Field == "bankAccount", c.DecidedByName, c.DecidedAt, c.DecisionNote, c.CreatedAt}
	}
	return out
}

func currentValue(e *models.Employee, field string) string {
	switch field {
	case "bankName":
		return e.BankName
	case "bankAccount":
		return e.BankAccount
	case "nssfNo":
		return e.NSSFNo
	case "shaNo":
		return e.SHANo
	case "kraPin":
		return e.KRAPin
	case "nationalIdNo":
		return e.NationalIDNo
	}
	return ""
}

func (a *App) createChangeRequest(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.actorEmployee(act)
	if err != nil {
		return err
	}
	var in struct {
		Field    string `json:"field"`
		NewValue string `json:"newValue"`
		Reason   string `json:"reason"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	f := fieldErrs{}
	if _, ok := models.ChangeRequestFields[in.Field]; !ok {
		f["field"] = "this field cannot be changed through a request"
	}
	nv := trim(in.NewValue)
	if nv == "" {
		f["newValue"] = "is required"
	} else if len(nv) > 100 {
		f["newValue"] = "is too long"
	}
	if err := f.err(); err != nil {
		return err
	}
	var open int64
	a.DB.Model(&models.ChangeRequest{}).Where("employee_id = ? AND field = ? AND status = ?", e.ID, in.Field, models.ReqPending).Count(&open)
	if open > 0 {
		return httpx.Conflict("you already have a pending request for this field")
	}
	reason := trim(in.Reason)
	if len(reason) > 500 {
		reason = reason[:500]
	}
	c := models.ChangeRequest{EmployeeID: e.ID, Field: in.Field, OldValue: currentValue(e, in.Field), NewValue: nv, Reason: reason, Status: models.ReqPending}
	if err := a.DB.Create(&c).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "change_request", "change_request", c.ID, "requested change of "+in.Field)
	httpx.JSON(w, http.StatusCreated, a.changeRequestViews([]models.ChangeRequest{c})[0])
	return nil
}

func (a *App) myChangeRequests(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.actorEmployee(act)
	if err != nil {
		return err
	}
	var rows []models.ChangeRequest
	if err := a.DB.Where("employee_id = ?", e.ID).Order("created_at DESC").Find(&rows).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a.changeRequestViews(rows))
	return nil
}

func (a *App) listChangeRequests(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	q := a.DB.Model(&models.ChangeRequest{})
	if v := r.URL.Query().Get("status"); v != "" {
		q = q.Where("status = ?", v)
	}
	var rows []models.ChangeRequest
	if err := q.Order("created_at DESC").Limit(500).Find(&rows).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a.changeRequestViews(rows))
	return nil
}

func (a *App) decideChangeRequest(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var c models.ChangeRequest
	if err := a.DB.First(&c, id).Error; err != nil {
		return notFound(err, "request")
	}
	var in decision
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	if c.Status != models.ReqPending {
		return httpx.Conflict("this request has already been decided")
	}
	if act.IsEmployee(c.EmployeeID) {
		return httpx.NewError(http.StatusForbidden, "you cannot decide your own request")
	}
	if !in.Approve && trim(in.Note) == "" {
		return httpx.Invalid(map[string]string{"note": "give a reason for rejecting"})
	}
	status := models.ReqRejected
	if in.Approve {
		status = models.ReqApproved
	}
	now := time.Now().UTC()
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		if in.Approve {
			col, ok := models.ChangeRequestFields[c.Field]
			if !ok {
				return httpx.BadRequest("unknown field")
			}
			if err := tx.Model(&models.Employee{}).Where("id = ?", c.EmployeeID).Update(col, c.NewValue).Error; err != nil {
				return err
			}
		}
		return tx.Model(&c).Updates(map[string]interface{}{"status": status, "decided_by_id": act.UserID,
			"decided_by_name": act.Name, "decided_at": now, "decision_note": limitStr(in.Note, 500)}).Error
	})
	if err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "change_request_"+status, "change_request", c.ID, c.Field+" for employee "+fmt.Sprint(c.EmployeeID))
	a.DB.First(&c, c.ID)
	httpx.JSON(w, http.StatusOK, a.changeRequestViews([]models.ChangeRequest{c})[0])
	return nil
}

type decision struct {
	Approve bool   `json:"approve"`
	Note    string `json:"note"`
}

func limitStr(s string, n int) string {
	s = trim(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

// dispositionFor returns "inline" when the caller asks to preview (?inline=1) and the file is a
// type the browser can show safely (PDF or image); everything else is always a download.
func dispositionFor(r *http.Request, name string) string {
	kind := "attachment"
	if r.URL.Query().Get("inline") == "1" {
		switch strings.ToLower(filepath.Ext(name)) {
		case ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp":
			kind = "inline"
		}
	}
	return fmt.Sprintf("%s; filename=%q", kind, safeFilename(name))
}
