package handlers

import (
	"net/http"
	"time"

	"sibk-hrms/backend/internal/audit"
	"sibk-hrms/backend/internal/auth"
	"sibk-hrms/backend/internal/httpx"
	"sibk-hrms/backend/internal/models"
	"sibk-hrms/backend/internal/policy"
	"sibk-hrms/backend/internal/storage"
)

// ---- announcements ----

func announcementViews(rows []models.Announcement) []map[string]interface{} {
	out := make([]map[string]interface{}, len(rows))
	for i, x := range rows {
		out[i] = map[string]interface{}{"id": x.ID, "title": x.Title, "body": x.Body, "createdByName": x.CreatedByName,
			"createdAt": x.CreatedAt, "pinned": x.Pinned}
	}
	return out
}

func (a *App) listAnnouncements(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var rows []models.Announcement
	if err := a.DB.Order("pinned DESC, created_at DESC").Limit(100).Find(&rows).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, announcementViews(rows))
	return nil
}

func (a *App) createAnnouncement(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var in struct {
		Title  string `json:"title"`
		Body   string `json:"body"`
		Pinned bool   `json:"pinned"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	f := fieldErrs{}
	title, body := trim(in.Title), trim(in.Body)
	if title == "" || len(title) > 255 {
		f["title"] = "is required (up to 255 characters)"
	}
	if body == "" || len(body) > 5000 {
		f["body"] = "is required (up to 5000 characters)"
	}
	if err := f.err(); err != nil {
		return err
	}
	x := models.Announcement{Title: title, Body: body, Pinned: in.Pinned, CreatedByName: act.Name}
	if err := a.DB.Create(&x).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "announcement_create", "announcement", x.ID, title)
	httpx.JSON(w, http.StatusCreated, announcementViews([]models.Announcement{x})[0])
	return nil
}

func (a *App) deleteAnnouncement(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	res := a.DB.Delete(&models.Announcement{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return httpx.NotFound("announcement")
	}
	audit.Log(a.DB, act, clientIP(r), "announcement_delete", "announcement", id, "deleted")
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ---- policies ----

func policyMap(p models.Policy) map[string]interface{} {
	return map[string]interface{}{"id": p.ID, "title": p.Title, "version": p.Version, "effectiveDate": dstr(p.EffectiveDate),
		"fileName": p.FileName, "uploadedAt": p.UploadedAt}
}

func (a *App) listPolicies(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var rows []models.Policy
	if err := a.DB.Order("uploaded_at DESC").Find(&rows).Error; err != nil {
		return err
	}
	out := make([]map[string]interface{}, len(rows))
	for i, p := range rows {
		out[i] = policyMap(p)
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (a *App) createPolicy(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxDocBytes+(64<<10))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		return httpx.BadRequest("the upload is invalid or larger than 10 MB")
	}
	f := fieldErrs{}
	title := trim(r.FormValue("title"))
	if title == "" {
		f["title"] = "is required"
	}
	eff, derr := parseDate(r.FormValue("effectiveDate"))
	if derr != nil {
		f["effectiveDate"] = derr.Error()
	}
	file, hdr, ferr := r.FormFile("file")
	if ferr != nil {
		f["file"] = "attach the policy document"
	}
	if err := f.err(); err != nil {
		return err
	}
	defer file.Close()
	saved, err := a.Store.Save(file, hdr.Filename, maxDocBytes, storage.Any)
	if err != nil {
		return uploadError(err, "files must be PDF, JPG, PNG or DOCX up to 10 MB")
	}
	p := models.Policy{Title: title, Version: limitStr(r.FormValue("version"), 40), EffectiveDate: eff,
		FileName: limitStr(hdr.Filename, 200), ContentType: saved.ContentType, StorageKey: saved.Key, UploadedAt: time.Now().UTC()}
	if err := a.DB.Create(&p).Error; err != nil {
		a.Store.Delete(saved.Key)
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "policy_upload", "policy", p.ID, title)
	httpx.JSON(w, http.StatusCreated, policyMap(p))
	return nil
}

func (a *App) downloadPolicy(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var p models.Policy
	if err := a.DB.First(&p, id).Error; err != nil {
		return notFound(err, "policy")
	}
	f, err := a.Store.Open(p.StorageKey)
	if err != nil {
		return httpx.NotFound("file")
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", p.ContentType)
	w.Header().Set("Content-Disposition", dispositionFor(r, p.FileName))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, "", st.ModTime(), f)
	return nil
}

var _ = policy.Today
