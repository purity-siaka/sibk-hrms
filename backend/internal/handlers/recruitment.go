package handlers

import (
	"net/http"
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

// ---- jobs ----

type jobView struct {
	ID             uint      `json:"id"`
	Title          string    `json:"title"`
	DepartmentID   *uint     `json:"departmentId"`
	DepartmentName string    `json:"departmentName"`
	Headcount      int       `json:"headcount"`
	Status         string    `json:"status"`
	Location       string    `json:"location"`
	Description    string    `json:"description"`
	ClosingDate    *string   `json:"closingDate"`
	ApplicantCount int64     `json:"applicantCount"`
	CreatedAt      time.Time `json:"createdAt"`
}

func (a *App) jobViews(jobs []models.Job) []jobView {
	deps := map[uint]string{}
	var ds []models.Department
	a.DB.Find(&ds)
	for _, d := range ds {
		deps[d.ID] = d.Name
	}
	type cnt struct {
		JobID uint
		N     int64
	}
	var cs []cnt
	a.DB.Model(&models.Applicant{}).Select("job_id, count(*) AS n").Group("job_id").Scan(&cs)
	cm := map[uint]int64{}
	for _, c := range cs {
		cm[c.JobID] = c.N
	}
	out := make([]jobView, len(jobs))
	for i, j := range jobs {
		v := jobView{ID: j.ID, Title: j.Title, DepartmentID: j.DepartmentID, Headcount: j.Headcount, Status: j.Status,
			Location: j.Location, Description: j.Description, ClosingDate: dstr(j.ClosingDate), ApplicantCount: cm[j.ID], CreatedAt: j.CreatedAt}
		if j.DepartmentID != nil {
			v.DepartmentName = deps[*j.DepartmentID]
		}
		out[i] = v
	}
	return out
}

func (a *App) listJobs(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	q := a.DB.Model(&models.Job{})
	if v := r.URL.Query().Get("status"); v != "" {
		q = q.Where("status = ?", v)
	}
	var jobs []models.Job
	if err := q.Order("created_at DESC").Find(&jobs).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a.jobViews(jobs))
	return nil
}

type jobInput struct {
	Title        *string `json:"title"`
	DepartmentID *uint   `json:"departmentId"`
	Headcount    *int    `json:"headcount"`
	Status       *string `json:"status"`
	Location     *string `json:"location"`
	Description  *string `json:"description"`
	ClosingDate  *string `json:"closingDate"`
}

func (a *App) saveJob(w http.ResponseWriter, r *http.Request, act *auth.Actor, j *models.Job, status int) error {
	var in jobInput
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	f := fieldErrs{}
	setStr(&j.Title, in.Title)
	setStr(&j.Location, in.Location)
	setStr(&j.Description, in.Description)
	if in.DepartmentID != nil {
		if *in.DepartmentID == 0 {
			j.DepartmentID = nil
		} else {
			var n int64
			a.DB.Model(&models.Department{}).Where("id = ?", *in.DepartmentID).Count(&n)
			if n == 0 {
				f["departmentId"] = "department not found"
			}
			j.DepartmentID = in.DepartmentID
		}
	}
	if in.Headcount != nil {
		if *in.Headcount < 1 || *in.Headcount > 500 {
			f["headcount"] = "must be between 1 and 500"
		}
		j.Headcount = *in.Headcount
	}
	if in.Status != nil {
		if !models.Contains(models.JobStatuses, *in.Status) {
			f["status"] = "is not a valid status"
		}
		j.Status = *in.Status
	}
	setDate(f, "closingDate", &j.ClosingDate, in.ClosingDate)
	if j.Title == "" {
		f["title"] = "is required"
	}
	if err := f.err(); err != nil {
		return err
	}
	if err := a.DB.Save(j).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "job_save", "job", j.ID, j.Title)
	httpx.JSON(w, status, a.jobViews([]models.Job{*j})[0])
	return nil
}

func (a *App) createJob(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	return a.saveJob(w, r, act, &models.Job{Headcount: 1, Status: models.JobDraft}, http.StatusCreated)
}

func (a *App) updateJob(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var j models.Job
	if err := a.DB.First(&j, id).Error; err != nil {
		return notFound(err, "job")
	}
	return a.saveJob(w, r, act, &j, http.StatusOK)
}

// ---- applicants ----

type applicantView struct {
	ID             uint      `json:"id"`
	JobID          uint      `json:"jobId"`
	JobTitle       string    `json:"jobTitle"`
	FullName       string    `json:"fullName"`
	Email          string    `json:"email"`
	Phone          string    `json:"phone"`
	Stage          string    `json:"stage"`
	Source         string    `json:"source"`
	Rating         int       `json:"rating"`
	Notes          string    `json:"notes"`
	HasCV          bool      `json:"hasCv"`
	CreatedAt      time.Time `json:"createdAt"`
	StageChangedAt time.Time `json:"stageChangedAt"`
	EmployeeID     *uint     `json:"employeeId"`
}

func (a *App) applicantViews(rows []models.Applicant) []applicantView {
	titles := map[uint]string{}
	var jobs []models.Job
	a.DB.Select("id", "title").Find(&jobs)
	for _, j := range jobs {
		titles[j.ID] = j.Title
	}
	out := make([]applicantView, len(rows))
	for i, x := range rows {
		out[i] = applicantView{x.ID, x.JobID, titles[x.JobID], x.FullName, x.Email, x.Phone, x.Stage, x.Source, x.Rating,
			x.Notes, x.CVKey != "", x.CreatedAt, x.StageChangedAt, x.EmployeeID}
	}
	return out
}

func (a *App) listApplicants(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	q := a.DB.Model(&models.Applicant{})
	qs := r.URL.Query()
	if v := qs.Get("jobId"); v != "" {
		q = q.Where("job_id = ?", v)
	}
	if v := qs.Get("stage"); v != "" {
		q = q.Where("stage = ?", v)
	}
	if s := trim(qs.Get("q")); s != "" {
		like := "%" + escapeLike(s) + "%"
		q = q.Where("full_name ILIKE ? OR email ILIKE ?", like, like)
	}
	var rows []models.Applicant
	if err := q.Order("stage_changed_at DESC").Limit(1000).Find(&rows).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a.applicantViews(rows))
	return nil
}

type applicantInput struct {
	JobID    *uint   `json:"jobId"`
	FullName *string `json:"fullName"`
	Email    *string `json:"email"`
	Phone    *string `json:"phone"`
	Source   *string `json:"source"`
	Rating   *int    `json:"rating"`
	Notes    *string `json:"notes"`
}

func (a *App) createApplicant(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var in applicantInput
	var cvFile *struct {
		name string
		key  string
		ct   string
	}
	ctype := r.Header.Get("Content-Type")
	if strings.HasPrefix(ctype, "multipart/form-data") {
		r.Body = http.MaxBytesReader(w, r.Body, maxDocBytes+(64<<10))
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			return httpx.BadRequest("the upload is invalid or larger than 10 MB")
		}
		get := func(k string) *string {
			if _, ok := r.MultipartForm.Value[k]; !ok {
				return nil
			}
			v := r.FormValue(k)
			return &v
		}
		in.FullName, in.Email, in.Phone, in.Source, in.Notes = get("fullName"), get("email"), get("phone"), get("source"), get("notes")
		if v := r.FormValue("jobId"); v != "" {
			var id uint
			for _, c := range v {
				if c < '0' || c > '9' {
					id = 0
					break
				}
				id = id*10 + uint(c-'0')
			}
			if id > 0 {
				in.JobID = &id
			}
		}
		if file, hdr, err := r.FormFile("cv"); err == nil {
			defer file.Close()
			saved, err := a.Store.Save(file, hdr.Filename, maxDocBytes, storage.Any)
			if err != nil {
				return uploadError(err, "the CV must be PDF, JPG, PNG or DOCX up to 10 MB")
			}
			cvFile = &struct {
				name string
				key  string
				ct   string
			}{limitStr(hdr.Filename, 200), saved.Key, saved.ContentType}
		}
	} else if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	ap := models.Applicant{Stage: models.StageApplied, Source: "Direct"}
	f := fieldErrs{}
	if in.JobID == nil {
		f["jobId"] = "choose a job"
	} else {
		var n int64
		a.DB.Model(&models.Job{}).Where("id = ?", *in.JobID).Count(&n)
		if n == 0 {
			f["jobId"] = "job not found"
		}
		ap.JobID = *in.JobID
	}
	setStr(&ap.FullName, in.FullName)
	if in.Email != nil {
		ap.Email = strings.ToLower(trim(*in.Email))
	}
	setStr(&ap.Phone, in.Phone)
	if in.Source != nil && trim(*in.Source) != "" {
		ap.Source = trim(*in.Source)
	}
	setStr(&ap.Notes, in.Notes)
	if in.Rating != nil {
		if *in.Rating < 0 || *in.Rating > 5 {
			f["rating"] = "must be between 0 and 5"
		}
		ap.Rating = *in.Rating
	}
	if ap.FullName == "" {
		f["fullName"] = "is required"
	}
	if ap.Email != "" && !validEmail(ap.Email) {
		f["email"] = "must be a valid email address"
	}
	if err := f.err(); err != nil {
		if cvFile != nil {
			a.Store.Delete(cvFile.key)
		}
		return err
	}
	if cvFile != nil {
		ap.CVKey, ap.CVFileName, ap.CVContentType = cvFile.key, cvFile.name, cvFile.ct
	}
	ap.StageChangedAt = time.Now().UTC()
	if err := a.DB.Create(&ap).Error; err != nil {
		if cvFile != nil {
			a.Store.Delete(cvFile.key)
		}
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "applicant_create", "applicant", ap.ID, ap.FullName)
	httpx.JSON(w, http.StatusCreated, a.applicantViews([]models.Applicant{ap})[0])
	return nil
}

func (a *App) loadApplicant(r *http.Request) (*models.Applicant, error) {
	id, err := pathID(r)
	if err != nil {
		return nil, err
	}
	var ap models.Applicant
	if err := a.DB.First(&ap, id).Error; err != nil {
		return nil, notFound(err, "applicant")
	}
	return &ap, nil
}

func (a *App) updateApplicant(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	ap, err := a.loadApplicant(r)
	if err != nil {
		return err
	}
	var in applicantInput
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	f := fieldErrs{}
	setStr(&ap.FullName, in.FullName)
	if in.Email != nil {
		ap.Email = strings.ToLower(trim(*in.Email))
	}
	setStr(&ap.Phone, in.Phone)
	setStr(&ap.Source, in.Source)
	setStr(&ap.Notes, in.Notes)
	if in.Rating != nil {
		if *in.Rating < 0 || *in.Rating > 5 {
			f["rating"] = "must be between 0 and 5"
		}
		ap.Rating = *in.Rating
	}
	if ap.FullName == "" {
		f["fullName"] = "is required"
	}
	if ap.Email != "" && !validEmail(ap.Email) {
		f["email"] = "must be a valid email address"
	}
	if err := f.err(); err != nil {
		return err
	}
	if err := a.DB.Save(ap).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "applicant_update", "applicant", ap.ID, ap.FullName)
	httpx.JSON(w, http.StatusOK, a.applicantViews([]models.Applicant{*ap})[0])
	return nil
}

func (a *App) applicantStage(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	ap, err := a.loadApplicant(r)
	if err != nil {
		return err
	}
	var in struct {
		Stage string `json:"stage"`
		Note  string `json:"note"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	if !models.Contains(models.ApplicantStages, in.Stage) {
		return httpx.Invalid(map[string]string{"stage": "is not a valid stage"})
	}
	if in.Stage == models.StageHired {
		return httpx.Invalid(map[string]string{"stage": "use the hire action to convert an applicant into an employee"})
	}
	if ap.Stage == models.StageHired {
		return httpx.Conflict("this applicant has already been hired")
	}
	notes := ap.Notes
	if n := trim(in.Note); n != "" {
		line := time.Now().UTC().Format("2006-01-02") + " [" + ap.Stage + " to " + in.Stage + "] " + n
		if notes != "" {
			notes += "\n"
		}
		notes += line
	}
	if err := a.DB.Model(ap).Updates(map[string]interface{}{"stage": in.Stage, "stage_changed_at": time.Now().UTC(), "notes": notes}).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "applicant_stage", "applicant", ap.ID, ap.FullName+": "+ap.Stage+" to "+in.Stage)
	a.DB.First(ap, ap.ID)
	httpx.JSON(w, http.StatusOK, a.applicantViews([]models.Applicant{*ap})[0])
	return nil
}

func (a *App) hireApplicant(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	ap, err := a.loadApplicant(r)
	if err != nil {
		return err
	}
	var in struct {
		StartDate      string `json:"startDate"`
		JobTitle       string `json:"jobTitle"`
		DepartmentID   *uint  `json:"departmentId"`
		ManagerID      *uint  `json:"managerId"`
		EmploymentType string `json:"employmentType"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	if ap.Stage == models.StageHired || ap.EmployeeID != nil {
		return httpx.Conflict("this applicant has already been hired")
	}
	f := fieldErrs{}
	start, derr := parseDate(in.StartDate)
	if derr != nil || start == nil {
		f["startDate"] = "is required (YYYY-MM-DD)"
	}
	empType := in.EmploymentType
	if empType == "" {
		empType = "permanent"
	}
	if !models.Contains(models.EmploymentTypes, empType) {
		f["employmentType"] = "is not a valid employment type"
	}
	var job models.Job
	if err := a.DB.First(&job, ap.JobID).Error; err != nil {
		return notFound(err, "job")
	}
	if err := f.err(); err != nil {
		return err
	}
	first, last := splitName(ap.FullName)
	e := models.Employee{FirstName: first, LastName: last, Email: ap.Email, Phone: ap.Phone, JobTitle: trim(in.JobTitle),
		Status: models.StatusProbation, EmploymentType: empType, StartDate: start, DepartmentID: in.DepartmentID, ManagerID: in.ManagerID}
	if e.JobTitle == "" {
		e.JobTitle = job.Title
	}
	if e.DepartmentID == nil {
		e.DepartmentID = job.DepartmentID
	}
	if policy.IsProbationary(empType) {
		pe := policy.ProbationEnd(*start)
		e.ProbationEndDate = &pe
	}
	v := fieldErrs{}
	a.validateEmployee(&e, v)
	if err := v.err(); err != nil {
		return err
	}
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		no, err := nextEmployeeNo(tx)
		if err != nil {
			return err
		}
		e.EmployeeNo = no
		if err := tx.Create(&e).Error; err != nil {
			return err
		}
		if err := tx.Model(ap).Updates(map[string]interface{}{"stage": models.StageHired, "employee_id": e.ID, "stage_changed_at": time.Now().UTC()}).Error; err != nil {
			return err
		}
		_, err = createTasks(tx, &e, models.KindOnboarding, *start)
		return err
	})
	if err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "applicant_hire", "employee", e.ID, "hired "+e.FullName()+" from applicant "+ap.FullName)
	httpx.JSON(w, http.StatusCreated, a.detailView(act, &e))
	return nil
}

func splitName(full string) (string, string) {
	parts := strings.Fields(full)
	switch len(parts) {
	case 0:
		return "", ""
	case 1:
		return parts[0], ""
	}
	return parts[0], strings.Join(parts[1:], " ")
}

func (a *App) applicantCV(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	ap, err := a.loadApplicant(r)
	if err != nil {
		return err
	}
	if ap.CVKey == "" {
		return httpx.NotFound("CV")
	}
	f, err := a.Store.Open(ap.CVKey)
	if err != nil {
		return httpx.NotFound("CV")
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "cv_download", "applicant", ap.ID, "downloaded CV of "+ap.FullName)
	w.Header().Set("Content-Type", ap.CVContentType)
	w.Header().Set("Content-Disposition", "attachment; filename=\""+safeFilename(ap.CVFileName)+"\"")
	http.ServeContent(w, r, "", st.ModTime(), f)
	return nil
}

// ---- interviews ----

func (a *App) listInterviews(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	ap, err := a.loadApplicant(r)
	if err != nil {
		return err
	}
	var rows []models.Interview
	if err := a.DB.Where("applicant_id = ?", ap.ID).Order("scheduled_at DESC").Find(&rows).Error; err != nil {
		return err
	}
	out := make([]map[string]interface{}, len(rows))
	for i, x := range rows {
		out[i] = interviewMap(x)
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func interviewMap(x models.Interview) map[string]interface{} {
	return map[string]interface{}{"id": x.ID, "applicantId": x.ApplicantID, "scheduledAt": x.ScheduledAt, "mode": x.Mode,
		"panel": x.Panel, "notes": x.Notes, "score": x.Score, "createdAt": x.CreatedAt}
}

func (a *App) createInterview(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	ap, err := a.loadApplicant(r)
	if err != nil {
		return err
	}
	var in struct {
		ScheduledAt string `json:"scheduledAt"`
		Mode        string `json:"mode"`
		Panel       string `json:"panel"`
		Notes       string `json:"notes"`
		Score       int    `json:"score"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	f := fieldErrs{}
	when, perr := time.Parse(time.RFC3339, in.ScheduledAt)
	if perr != nil {
		f["scheduledAt"] = "must be a date and time (RFC 3339)"
	}
	if in.Score < 0 || in.Score > 10 {
		f["score"] = "must be between 0 and 10"
	}
	if err := f.err(); err != nil {
		return err
	}
	iv := models.Interview{ApplicantID: ap.ID, ScheduledAt: when.UTC(), Mode: limitStr(in.Mode, 40), Panel: limitStr(in.Panel, 500), Notes: trim(in.Notes), Score: in.Score}
	if err := a.DB.Create(&iv).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "interview_create", "applicant", ap.ID, "interview for "+ap.FullName)
	httpx.JSON(w, http.StatusCreated, interviewMap(iv))
	return nil
}
