package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"sibk-hrms/backend/internal/audit"
	"sibk-hrms/backend/internal/auth"
	"sibk-hrms/backend/internal/httpx"
	"sibk-hrms/backend/internal/models"
	"sibk-hrms/backend/internal/storage"
)

const maxSignOffBytes = 15 << 20

// StepView is one signatory as the client sees it.
type StepView struct {
	ID         uint       `json:"id"`
	Position   int        `json:"position"`
	EmployeeID uint       `json:"employeeId"`
	Name       string     `json:"name"`
	Email      string     `json:"email"`
	Label      string     `json:"label"`
	Status     string     `json:"status"` // pending | signed
	SignedAt   *time.Time `json:"signedAt"`
	Page       int        `json:"page"`
	X          float64    `json:"x"`
	Y          float64    `json:"y"`
}

// SignOffView is a sign-off with its signatories.
type SignOffView struct {
	ID                uint       `json:"id"`
	Title             string     `json:"title"`
	ProcessName       string     `json:"processName"`
	ProcessID         string     `json:"processId"`
	ProcessDepartment string     `json:"processDepartment"`
	ProcessOwner      string     `json:"processOwner"`
	ProcessManager    string     `json:"processManager"`
	Version           string     `json:"version"`
	EffectiveDate     *string    `json:"effectiveDate"`
	ReviewDate        *string    `json:"reviewDate"`
	DocumentStatus    string     `json:"documentStatus"`
	Classification    string     `json:"classification"`
	CategoryDeptID    *uint      `json:"categoryDepartmentId"`
	CategoryName      string     `json:"categoryName"`
	PreparerID        uint       `json:"preparerId"`
	PreparerName      string     `json:"preparerName"`
	FileName          string     `json:"fileName"`
	ContentType       string     `json:"contentType"`
	Status            string     `json:"status"`
	ReturnNote        string     `json:"returnNote"`
	Cycle             int        `json:"cycle"`
	CreatedAt         time.Time  `json:"createdAt"`
	CompletedAt       *time.Time `json:"completedAt"`
	Steps             []StepView `json:"steps"`
	WaitingForID      *uint      `json:"waitingForId"`
	WaitingForName    string     `json:"waitingForName"`
	MyTurn            bool       `json:"myTurn"`
	MyStepID          *uint      `json:"myStepId"`
	IsPreparer        bool       `json:"isPreparer"`
}

func (a *App) signOffViews(rows []models.SignOff, act *auth.Actor) ([]SignOffView, error) {
	ids := make([]uint, 0, len(rows))
	for _, s := range rows {
		ids = append(ids, s.ID)
	}
	steps := map[uint][]models.SignOffStep{}
	if len(ids) > 0 {
		var all []models.SignOffStep
		if err := a.DB.Where("sign_off_id IN ?", ids).Order("step_no").Find(&all).Error; err != nil {
			return nil, err
		}
		for _, st := range all {
			steps[st.SignOffID] = append(steps[st.SignOffID], st)
		}
	}
	out := make([]SignOffView, 0, len(rows))
	for _, s := range rows {
		v := SignOffView{
			ID: s.ID, Title: s.Title, ProcessName: s.ProcessName, ProcessID: s.ProcessID,
			ProcessDepartment: s.ProcessDepartment, ProcessOwner: s.ProcessOwner, ProcessManager: s.ProcessManager,
			Version: s.Version, EffectiveDate: dstr(s.EffectiveDate), ReviewDate: dstr(s.ReviewDate),
			DocumentStatus: s.DocumentStatus, Classification: s.Classification,
			CategoryDeptID: s.CategoryDeptID, CategoryName: s.CategoryName,
			PreparerID: s.PreparerID, PreparerName: s.PreparerName,
			FileName: s.FileName, ContentType: s.ContentType, Status: s.Status, ReturnNote: s.ReturnNote,
			Cycle: s.Cycle, CreatedAt: s.CreatedAt, CompletedAt: s.CompletedAt, Steps: []StepView{},
			IsPreparer: act.EmployeeID != nil && *act.EmployeeID == s.PreparerID,
		}
		for _, st := range steps[s.ID] {
			v.Steps = append(v.Steps, StepView{ID: st.ID, Position: st.Position, EmployeeID: st.EmployeeID, Name: st.Name, Email: st.Email, Label: st.Label, Status: st.Status, SignedAt: st.SignedAt, Page: st.Page, X: st.X, Y: st.Y})
			if s.Status == models.SignOffInProgress && st.Status == models.StepPending && v.WaitingForID == nil {
				id := st.EmployeeID
				v.WaitingForID, v.WaitingForName = &id, st.Name
				if act.EmployeeID != nil && *act.EmployeeID == st.EmployeeID {
					sid := st.ID
					v.MyTurn, v.MyStepID = true, &sid
				}
			}
		}
		out = append(out, v)
	}
	return out, nil
}

// canViewSignOff: HR, the preparer and every signatory.
func (a *App) canViewSignOff(act *auth.Actor, s *models.SignOff) (bool, error) {
	if act.IsHR() {
		return true, nil
	}
	if act.EmployeeID == nil {
		return false, nil
	}
	if s.PreparerID == *act.EmployeeID {
		return true, nil
	}
	var n int64
	err := a.DB.Model(&models.SignOffStep{}).Where("sign_off_id = ? AND employee_id = ?", s.ID, *act.EmployeeID).Count(&n).Error
	return n > 0, err
}

func (a *App) loadSignOff(r *http.Request, act *auth.Actor) (*models.SignOff, error) {
	id, err := pathID(r)
	if err != nil {
		return nil, err
	}
	var s models.SignOff
	if err := a.DB.First(&s, id).Error; err != nil {
		return nil, notFound(err, "sign-off")
	}
	ok, err := a.canViewSignOff(act, &s)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, httpx.Forbidden()
	}
	return &s, nil
}

func (a *App) notify(db *gorm.DB, employeeID uint, kind, title, body string, signOffID uint) {
	db.Create(&models.Notification{EmployeeID: employeeID, Kind: kind, Title: title, Body: body, Link: "/signoffs?open=" + itoa(signOffID), CreatedAt: time.Now()})
}

func itoa(n uint) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// listSignOffs: box = inbox (waiting for me) | sent (I prepared, not finished) | archive (finished, mine) | all (HR).
func (a *App) listSignOffs(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	box := r.URL.Query().Get("box")
	if box == "" {
		box = "inbox"
	}
	q := a.DB.Model(&models.SignOff{})
	var me uint
	if act.EmployeeID != nil {
		me = *act.EmployeeID
	}
	switch box {
	case "inbox":
		// first pending step of an in-progress sign-off belongs to me
		var ids []uint
		a.DB.Raw(`SELECT s.id FROM signoffs s WHERE s.status = ? AND (
			SELECT st.employee_id FROM signoff_steps st WHERE st.sign_off_id = s.id AND st.status = ? ORDER BY st.step_no LIMIT 1) = ?`,
			models.SignOffInProgress, models.StepPending, me).Scan(&ids)
		q = q.Where("id IN ?", append(ids, 0))
	case "sent":
		q = q.Where("preparer_id = ? AND status <> ?", me, models.SignOffCompleted)
	case "archive":
		q = q.Where("status = ?", models.SignOffCompleted)
		if !act.IsHR() {
			q = q.Where("(preparer_id = ? OR id IN (?))", me, a.DB.Model(&models.SignOffStep{}).Select("sign_off_id").Where("employee_id = ? AND status = ?", me, models.StepSigned))
		}
	case "all":
		if !act.IsHR() {
			return httpx.Forbidden()
		}
		if e := r.URL.Query().Get("employeeId"); e != "" {
			eid, perr := strconv.Atoi(e)
			if perr != nil {
				return httpx.BadRequest("bad employeeId")
			}
			q = q.Where("(preparer_id = ? OR id IN (?))", eid, a.DB.Model(&models.SignOffStep{}).Select("sign_off_id").Where("employee_id = ?", eid))
		}
	default:
		return httpx.BadRequest("unknown box")
	}
	if d := r.URL.Query().Get("category"); d != "" {
		q = q.Where("category_name = ?", d)
	}
	if s := strings.TrimSpace(r.URL.Query().Get("q")); s != "" {
		like := "%" + strings.ToLower(s) + "%"
		q = q.Where("(LOWER(title) LIKE ? OR LOWER(process_name) LIKE ? OR LOWER(process_id) LIKE ?)", like, like, like)
	}
	var rows []models.SignOff
	if err := q.Order("updated_at DESC").Limit(300).Find(&rows).Error; err != nil {
		return err
	}
	views, err := a.signOffViews(rows, act)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, views)
	return nil
}

func (a *App) signOffSummary(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var me uint
	if act.EmployeeID != nil {
		me = *act.EmployeeID
	}
	var n int64
	a.DB.Raw(`SELECT COUNT(*) FROM signoffs s WHERE s.status = ? AND (
		SELECT st.employee_id FROM signoff_steps st WHERE st.sign_off_id = s.id AND st.status = ? ORDER BY st.step_no LIMIT 1) = ?`,
		models.SignOffInProgress, models.StepPending, me).Scan(&n)
	httpx.JSON(w, http.StatusOK, map[string]int64{"awaiting": n})
	return nil
}

func (a *App) getSignOff(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	s, err := a.loadSignOff(r, act)
	if err != nil {
		return err
	}
	v, err := a.signOffViews([]models.SignOff{*s}, act)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, v[0])
	return nil
}

type signerIn struct {
	Email string `json:"email"`
	Label string `json:"label"`
}

// fillSignOff reads the multipart form into s. It returns the parsed signers (nil when none were sent).
func (a *App) fillSignOff(r *http.Request, s *models.SignOff, requireSigners bool) ([]models.SignOffStep, fieldErrs) {
	f := fieldErrs{}
	set := func(dst *string, key string, max int) {
		if v, ok := r.MultipartForm.Value[key]; ok && len(v) > 0 {
			*dst = strings.TrimSpace(v[0])
			if len(*dst) > max {
				f[key] = "too long"
			}
		}
	}
	set(&s.Title, "title", 200)
	set(&s.ProcessName, "processName", 200)
	set(&s.ProcessID, "processId", 80)
	set(&s.ProcessDepartment, "processDepartment", 150)
	set(&s.ProcessOwner, "processOwner", 150)
	set(&s.ProcessManager, "processManager", 150)
	set(&s.Version, "version", 30)
	set(&s.DocumentStatus, "documentStatus", 30)
	set(&s.Classification, "classification", 40)
	for key, dst := range map[string]**time.Time{"effectiveDate": &s.EffectiveDate, "reviewDate": &s.ReviewDate} {
		if v, ok := r.MultipartForm.Value[key]; ok && len(v) > 0 {
			t, err := parseDate(v[0])
			if err != nil {
				f[key] = err.Error()
			} else {
				*dst = t
			}
		}
	}
	if v, ok := r.MultipartForm.Value["categoryDepartmentId"]; ok && len(v) > 0 && strings.TrimSpace(v[0]) != "" {
		var d models.Department
		did, perr := strconv.Atoi(strings.TrimSpace(v[0]))
		if perr != nil || a.DB.First(&d, did).Error != nil {
			f["categoryDepartmentId"] = "choose a department"
		} else {
			id := d.ID
			s.CategoryDeptID, s.CategoryName = &id, d.Name
		}
	} else if _, ok := r.MultipartForm.Value["categoryDepartmentId"]; ok {
		s.CategoryDeptID, s.CategoryName = nil, ""
	}
	if s.Title == "" {
		f["title"] = "give the document a name"
	}
	if s.CategoryName == "" {
		f["categoryDepartmentId"] = "choose the department this document belongs to"
	}
	var steps []models.SignOffStep
	raw := ""
	if v, ok := r.MultipartForm.Value["signers"]; ok && len(v) > 0 {
		raw = v[0]
	}
	if raw != "" || requireSigners {
		var in []signerIn
		if err := json.Unmarshal([]byte(raw), &in); err != nil || len(in) == 0 {
			f["signers"] = "choose at least one person to sign, in order"
			return nil, f
		}
		if len(in) > 12 {
			f["signers"] = "at most 12 signatories"
			return nil, f
		}
		seen := map[uint]bool{}
		for i, sg := range in {
			email := strings.ToLower(strings.TrimSpace(sg.Email))
			var u models.User
			if err := a.DB.Where("LOWER(email) = ? AND active = ? AND employee_id IS NOT NULL", email, true).First(&u).Error; err != nil {
				f["signers"] = "no active system user with the email " + sg.Email
				return nil, f
			}
			if seen[*u.EmployeeID] {
				f["signers"] = u.Name + " is listed twice"
				return nil, f
			}
			seen[*u.EmployeeID] = true
			label := strings.TrimSpace(sg.Label)
			if len(label) > 80 {
				label = label[:80]
			}
			steps = append(steps, models.SignOffStep{Position: i + 1, EmployeeID: *u.EmployeeID, Name: u.Name, Email: u.Email, Label: label, Status: models.StepPending})
		}
	}
	return steps, f
}

func (a *App) createSignOff(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	me, err := a.actorEmployee(act)
	if err != nil {
		return err
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxSignOffBytes+(64<<10))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		return httpx.BadRequest("the upload is invalid or larger than 15 MB")
	}
	s := models.SignOff{PreparerID: me.ID, PreparerName: me.FullName(), Status: models.SignOffInProgress, Cycle: 1}
	steps, f := a.fillSignOff(r, &s, true)
	file, hdr, ferr := r.FormFile("file")
	if ferr != nil {
		f["file"] = "attach the document to be signed"
	}
	if err := f.err(); err != nil {
		return err
	}
	defer file.Close()
	saved, err := a.Store.Save(file, hdr.Filename, maxSignOffBytes, storage.Viewable)
	if err != nil {
		return uploadError(err, "the document must be a PDF, JPG or PNG up to 15 MB")
	}
	name := hdr.Filename
	if i := strings.LastIndexAny(name, `/\`); i >= 0 {
		name = name[i+1:]
	}
	if len(name) > 200 {
		name = name[len(name)-200:]
	}
	s.FileName, s.ContentType, s.Size, s.StorageKey = name, saved.ContentType, saved.Size, saved.Key
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&s).Error; err != nil {
			return err
		}
		for i := range steps {
			steps[i].SignOffID = s.ID
		}
		if err := tx.Create(&steps).Error; err != nil {
			return err
		}
		a.notify(tx, steps[0].EmployeeID, "signoff_turn", "Please sign: "+s.Title, "From "+s.PreparerName+". You are number 1 in the sign-off order.", s.ID)
		return nil
	})
	if err != nil {
		_ = a.Store.Delete(saved.Key)
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "signoff_create", "signoff", s.ID, "started sign-off "+s.Title)
	v, err := a.signOffViews([]models.SignOff{s}, act)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, v[0])
	return nil
}

func (a *App) signOffFile(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	s, err := a.loadSignOff(r, act)
	if err != nil {
		return err
	}
	f, err := a.Store.Open(s.StorageKey)
	if err != nil {
		return httpx.NotFound("file")
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", s.ContentType)
	w.Header().Set("Content-Disposition", dispositionFor(r, s.FileName))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, "", st.ModTime(), f)
	return nil
}

// currentStep returns the step awaiting a signature, or nil.
func currentStep(tx *gorm.DB, signOffID uint) (*models.SignOffStep, error) {
	var st models.SignOffStep
	err := tx.Where("sign_off_id = ? AND status = ?", signOffID, models.StepPending).Order("step_no").First(&st).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &st, err
}

func (a *App) requireMyTurn(tx *gorm.DB, s *models.SignOff, act *auth.Actor) (*models.SignOffStep, error) {
	if s.Status != models.SignOffInProgress {
		return nil, httpx.Conflict("this document is no longer waiting for signatures")
	}
	st, err := currentStep(tx, s.ID)
	if err != nil {
		return nil, err
	}
	if st == nil || act.EmployeeID == nil || st.EmployeeID != *act.EmployeeID {
		return nil, httpx.Conflict("it is not your turn to sign this document")
	}
	return st, nil
}

func (a *App) signSignOff(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	s, err := a.loadSignOff(r, act)
	if err != nil {
		return err
	}
	var in struct {
		Page int     `json:"page"`
		X    float64 `json:"x"`
		Y    float64 `json:"y"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	if in.Page < 1 || in.X < 0 || in.X > 1 || in.Y < 0 || in.Y > 1 {
		return httpx.Invalid(map[string]string{"signature": "click on the document where you want to sign"})
	}
	var final bool
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		st, err := a.requireMyTurn(tx, s, act)
		if err != nil {
			return err
		}
		now := time.Now()
		st.Status, st.SignedAt, st.Page, st.X, st.Y = models.StepSigned, &now, in.Page, in.X, in.Y
		if err := tx.Save(st).Error; err != nil {
			return err
		}
		next, err := currentStep(tx, s.ID)
		if err != nil {
			return err
		}
		if next == nil {
			final = true
			s.Status, s.CompletedAt = models.SignOffCompleted, &now
			if err := tx.Save(s).Error; err != nil {
				return err
			}
			a.notify(tx, s.PreparerID, "signoff_done", "Everyone has signed: "+s.Title, "The document has been archived.", s.ID)
			return nil
		}
		s.UpdatedAt = now
		if err := tx.Save(s).Error; err != nil {
			return err
		}
		a.notify(tx, next.EmployeeID, "signoff_turn", "Please sign: "+s.Title, "From "+s.PreparerName+". "+st.Name+" has signed; you are number "+itoa(uint(next.Position))+".", s.ID)
		return nil
	})
	if err != nil {
		return err
	}
	msg := "signed " + s.Title
	if final {
		msg += " (last signature, archived)"
	}
	audit.Log(a.DB, act, clientIP(r), "signoff_sign", "signoff", s.ID, msg)
	return a.respondSignOff(w, s, act)
}

func (a *App) respondSignOff(w http.ResponseWriter, s *models.SignOff, act *auth.Actor) error {
	if err := a.DB.First(s, s.ID).Error; err != nil {
		return err
	}
	v, err := a.signOffViews([]models.SignOff{*s}, act)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, v[0])
	return nil
}

// stopSignOff handles reject and return: both need a written reason and notify the preparer.
func (a *App) stopSignOff(status, kind, verb string) handlerFunc {
	return func(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
		s, err := a.loadSignOff(r, act)
		if err != nil {
			return err
		}
		var in struct {
			Reason string `json:"reason"`
		}
		if err := httpx.Decode(w, r, &in); err != nil {
			return err
		}
		in.Reason = strings.TrimSpace(in.Reason)
		if in.Reason == "" {
			return httpx.Invalid(map[string]string{"reason": "write the reason"})
		}
		if len(in.Reason) > 1000 {
			return httpx.Invalid(map[string]string{"reason": "too long"})
		}
		err = a.DB.Transaction(func(tx *gorm.DB) error {
			st, err := a.requireMyTurn(tx, s, act)
			if err != nil {
				return err
			}
			s.Status, s.ReturnNote = status, st.Name+": "+in.Reason
			if err := tx.Save(s).Error; err != nil {
				return err
			}
			a.notify(tx, s.PreparerID, kind, st.Name+" "+verb+": "+s.Title, in.Reason, s.ID)
			return nil
		})
		if err != nil {
			return err
		}
		audit.Log(a.DB, act, clientIP(r), "signoff_"+status, "signoff", s.ID, verb+" "+s.Title)
		return a.respondSignOff(w, s, act)
	}
}

// resubmitSignOff: the preparer fixes the document or details and sends it round again from number 1.
func (a *App) resubmitSignOff(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	s, err := a.loadSignOff(r, act)
	if err != nil {
		return err
	}
	if act.EmployeeID == nil || s.PreparerID != *act.EmployeeID {
		return httpx.Forbidden()
	}
	if s.Status != models.SignOffReturned && s.Status != models.SignOffRejected {
		return httpx.Conflict("only a returned or rejected document can be sent again")
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxSignOffBytes+(64<<10))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		return httpx.BadRequest("the upload is invalid or larger than 15 MB")
	}
	steps, f := a.fillSignOff(r, s, false)
	if err := f.err(); err != nil {
		return err
	}
	oldKey := ""
	if file, hdr, ferr := r.FormFile("file"); ferr == nil {
		defer file.Close()
		saved, err := a.Store.Save(file, hdr.Filename, maxSignOffBytes, storage.Viewable)
		if err != nil {
			return uploadError(err, "the document must be a PDF, JPG or PNG up to 15 MB")
		}
		name := hdr.Filename
		if i := strings.LastIndexAny(name, `/\`); i >= 0 {
			name = name[i+1:]
		}
		if len(name) > 200 {
			name = name[len(name)-200:]
		}
		oldKey = s.StorageKey
		s.FileName, s.ContentType, s.Size, s.StorageKey = name, saved.ContentType, saved.Size, saved.Key
	}
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		if steps != nil {
			if err := tx.Where("sign_off_id = ?", s.ID).Delete(&models.SignOffStep{}).Error; err != nil {
				return err
			}
			for i := range steps {
				steps[i].SignOffID = s.ID
			}
			if err := tx.Create(&steps).Error; err != nil {
				return err
			}
		} else if err := tx.Model(&models.SignOffStep{}).Where("sign_off_id = ?", s.ID).Updates(map[string]interface{}{"status": models.StepPending, "signed_at": nil, "page": 0, "x": 0, "y": 0}).Error; err != nil {
			return err
		}
		s.Status, s.ReturnNote, s.Cycle = models.SignOffInProgress, "", s.Cycle+1
		if err := tx.Save(s).Error; err != nil {
			return err
		}
		first, err := currentStep(tx, s.ID)
		if err != nil || first == nil {
			return err
		}
		a.notify(tx, first.EmployeeID, "signoff_turn", "Please sign (corrected): "+s.Title, "From "+s.PreparerName+". The document was corrected and sent again.", s.ID)
		return nil
	})
	if err != nil {
		return err
	}
	if oldKey != "" {
		_ = a.Store.Delete(oldKey)
	}
	audit.Log(a.DB, act, clientIP(r), "signoff_resubmit", "signoff", s.ID, "sent again "+s.Title)
	return a.respondSignOff(w, s, act)
}

// deleteSignOff: HR at any time; the preparer only before it is completed.
func (a *App) deleteSignOff(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	s, err := a.loadSignOff(r, act)
	if err != nil {
		return err
	}
	mine := act.EmployeeID != nil && s.PreparerID == *act.EmployeeID && s.Status != models.SignOffCompleted
	if !act.IsHR() && !mine {
		return httpx.Forbidden()
	}
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("sign_off_id = ?", s.ID).Delete(&models.SignOffStep{}).Error; err != nil {
			return err
		}
		return tx.Delete(s).Error
	})
	if err != nil {
		return err
	}
	_ = a.Store.Delete(s.StorageKey)
	audit.Log(a.DB, act, clientIP(r), "signoff_delete", "signoff", s.ID, "deleted "+s.Title)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// Notifications -------------------------------------------------------------

func (a *App) listNotifications(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	out := map[string]interface{}{"unread": 0, "items": []models.Notification{}}
	if act.EmployeeID == nil {
		httpx.JSON(w, http.StatusOK, out)
		return nil
	}
	var items []models.Notification
	if err := a.DB.Where("employee_id = ?", *act.EmployeeID).Order("created_at DESC").Limit(30).Find(&items).Error; err != nil {
		return err
	}
	var unread int64
	a.DB.Model(&models.Notification{}).Where("employee_id = ? AND read_at IS NULL", *act.EmployeeID).Count(&unread)
	type nv struct {
		ID        uint       `json:"id"`
		Kind      string     `json:"kind"`
		Title     string     `json:"title"`
		Body      string     `json:"body"`
		Link      string     `json:"link"`
		ReadAt    *time.Time `json:"readAt"`
		CreatedAt time.Time  `json:"createdAt"`
	}
	views := make([]nv, 0, len(items))
	for _, n := range items {
		views = append(views, nv{n.ID, n.Kind, n.Title, n.Body, n.Link, n.ReadAt, n.CreatedAt})
	}
	httpx.JSON(w, http.StatusOK, map[string]interface{}{"unread": unread, "items": views})
	return nil
}

func (a *App) readNotification(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	if act.EmployeeID == nil {
		w.WriteHeader(http.StatusNoContent)
		return nil
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	now := time.Now()
	a.DB.Model(&models.Notification{}).Where("id = ? AND employee_id = ? AND read_at IS NULL", id, *act.EmployeeID).Update("read_at", now)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (a *App) readAllNotifications(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	if act.EmployeeID != nil {
		a.DB.Model(&models.Notification{}).Where("employee_id = ? AND read_at IS NULL", *act.EmployeeID).Update("read_at", time.Now())
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// signOffSigners lists the people who can be chosen as signatories (active users with an employee record).
func (a *App) signOffSigners(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var users []models.User
	if err := a.DB.Where("active = ? AND employee_id IS NOT NULL", true).Order("name").Find(&users).Error; err != nil {
		return err
	}
	type sv struct {
		EmployeeID uint   `json:"employeeId"`
		Name       string `json:"name"`
		Email      string `json:"email"`
	}
	out := make([]sv, 0, len(users))
	for _, u := range users {
		out = append(out, sv{*u.EmployeeID, u.Name, u.Email})
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}
