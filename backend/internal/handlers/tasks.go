package handlers

import (
	"net/http"
	"time"

	"gorm.io/gorm"

	"sibk-hrms/backend/internal/audit"
	"sibk-hrms/backend/internal/auth"
	"sibk-hrms/backend/internal/httpx"
	"sibk-hrms/backend/internal/models"
	"sibk-hrms/backend/internal/policy"
)

// createTasks creates the tasks of kind for e from the templates, skipping templates already applied.
// Due dates are base + offsetDays. It returns the number of tasks created.
func createTasks(tx *gorm.DB, e *models.Employee, kind string, base time.Time) (int, error) {
	var tpls []models.TaskTemplate
	if err := tx.Where("kind = ?", kind).Order("offset_days, id").Find(&tpls).Error; err != nil {
		return 0, err
	}
	var existing []uint
	if err := tx.Model(&models.Task{}).Where("employee_id = ? AND kind = ? AND template_id IS NOT NULL", e.ID, kind).Pluck("template_id", &existing).Error; err != nil {
		return 0, err
	}
	have := map[uint]bool{}
	for _, id := range existing {
		have[id] = true
	}
	n := 0
	for _, t := range tpls {
		if have[t.ID] {
			continue
		}
		due := base.AddDate(0, 0, t.OffsetDays)
		tid := t.ID
		task := models.Task{EmployeeID: e.ID, TemplateID: &tid, Kind: kind, Title: t.Title, OwnerRole: t.OwnerRole,
			Mandatory: t.Mandatory, DueDate: &due, Status: models.TaskPending}
		if err := tx.Create(&task).Error; err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

// ---- templates ----

type templateView struct {
	ID         uint   `json:"id"`
	Kind       string `json:"kind"`
	Title      string `json:"title"`
	OwnerRole  string `json:"ownerRole"`
	OffsetDays int    `json:"offsetDays"`
	Mandatory  bool   `json:"mandatory"`
}

func toTemplateView(t models.TaskTemplate) templateView {
	return templateView{t.ID, t.Kind, t.Title, t.OwnerRole, t.OffsetDays, t.Mandatory}
}

func (a *App) listTemplates(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	q := a.DB.Model(&models.TaskTemplate{})
	if v := r.URL.Query().Get("kind"); v != "" {
		q = q.Where("kind = ?", v)
	}
	var rows []models.TaskTemplate
	if err := q.Order("kind, offset_days, id").Find(&rows).Error; err != nil {
		return err
	}
	out := make([]templateView, len(rows))
	for i, t := range rows {
		out[i] = toTemplateView(t)
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (a *App) saveTemplate(w http.ResponseWriter, r *http.Request, act *auth.Actor, t *models.TaskTemplate, status int) error {
	var in struct {
		Kind       *string `json:"kind"`
		Title      *string `json:"title"`
		OwnerRole  *string `json:"ownerRole"`
		OffsetDays *int    `json:"offsetDays"`
		Mandatory  *bool   `json:"mandatory"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	f := fieldErrs{}
	if in.Kind != nil {
		if *in.Kind != models.KindOnboarding && *in.Kind != models.KindOffboarding {
			f["kind"] = "must be onboarding or offboarding"
		}
		t.Kind = *in.Kind
	}
	setStr(&t.Title, in.Title)
	if in.OwnerRole != nil {
		if !models.Contains(models.OwnerRoles, *in.OwnerRole) {
			f["ownerRole"] = "is not a valid owner"
		}
		t.OwnerRole = *in.OwnerRole
	}
	if in.OffsetDays != nil {
		if *in.OffsetDays < -365 || *in.OffsetDays > 365 {
			f["offsetDays"] = "must be within a year"
		}
		t.OffsetDays = *in.OffsetDays
	}
	if in.Mandatory != nil {
		t.Mandatory = *in.Mandatory
	}
	if t.Title == "" {
		f["title"] = "is required"
	}
	if t.Kind == "" {
		f["kind"] = "is required"
	}
	if t.OwnerRole == "" {
		f["ownerRole"] = "is required"
	}
	if err := f.err(); err != nil {
		return err
	}
	if err := a.DB.Save(t).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "template_save", "task_template", t.ID, t.Title)
	httpx.JSON(w, status, toTemplateView(*t))
	return nil
}

func (a *App) createTemplate(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	return a.saveTemplate(w, r, act, &models.TaskTemplate{}, http.StatusCreated)
}

func (a *App) updateTemplate(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var t models.TaskTemplate
	if err := a.DB.First(&t, id).Error; err != nil {
		return notFound(err, "template")
	}
	return a.saveTemplate(w, r, act, &t, http.StatusOK)
}

func (a *App) deleteTemplate(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var t models.TaskTemplate
	if err := a.DB.First(&t, id).Error; err != nil {
		return notFound(err, "template")
	}
	if err := a.DB.Delete(&t).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "template_delete", "task_template", id, t.Title)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ---- tasks ----

type taskView struct {
	ID              uint       `json:"id"`
	EmployeeID      uint       `json:"employeeId"`
	EmployeeName    string     `json:"employeeName"`
	Kind            string     `json:"kind"`
	Title           string     `json:"title"`
	OwnerRole       string     `json:"ownerRole"`
	Mandatory       bool       `json:"mandatory"`
	DueDate         *string    `json:"dueDate"`
	Status          string     `json:"status"`
	CompletedAt     *time.Time `json:"completedAt"`
	CompletedByName string     `json:"completedByName,omitempty"`
	Notes           string     `json:"notes"`
	Overdue         bool       `json:"overdue"`
}

func (a *App) taskViews(rows []models.Task) []taskView {
	var ids []uint
	for _, t := range rows {
		ids = append(ids, t.EmployeeID)
	}
	names := a.employeeNames(ids)
	today := policy.Today()
	out := make([]taskView, len(rows))
	for i, t := range rows {
		open := t.Status == models.TaskPending || t.Status == models.TaskInProgress
		out[i] = taskView{t.ID, t.EmployeeID, names[t.EmployeeID], t.Kind, t.Title, t.OwnerRole, t.Mandatory, dstr(t.DueDate),
			t.Status, t.CompletedAt, t.CompletedByName, t.Notes, open && t.DueDate != nil && t.DueDate.Before(today)}
	}
	return out
}

func (a *App) employeeTasks(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.loadViewable(r, act)
	if err != nil {
		return err
	}
	var rows []models.Task
	if err := a.DB.Where("employee_id = ?", e.ID).Order("kind, due_date, id").Find(&rows).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a.taskViews(rows))
	return nil
}

func (a *App) listTasks(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	q := a.DB.Model(&models.Task{})
	qs := r.URL.Query()
	if !act.IsHR() {
		ids, err := a.teamIDs(act)
		if err != nil {
			return err
		}
		if len(ids) == 0 {
			httpx.JSON(w, http.StatusOK, []taskView{})
			return nil
		}
		q = q.Where("employee_id IN ?", ids)
	}
	if v := qs.Get("employeeId"); v != "" {
		q = q.Where("employee_id = ?", v)
	}
	if v := qs.Get("kind"); v != "" {
		q = q.Where("kind = ?", v)
	}
	if v := qs.Get("status"); v != "" {
		q = q.Where("status = ?", v)
	}
	if v := qs.Get("ownerRole"); v != "" {
		q = q.Where("owner_role = ?", v)
	}
	if qs.Get("mine") == "1" {
		if act.IsHR() {
			q = q.Where("owner_role = ?", "hr")
		} else {
			q = q.Where("owner_role = ?", "line_manager")
		}
	}
	var rows []models.Task
	if err := q.Order("due_date, id").Limit(1000).Find(&rows).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a.taskViews(rows))
	return nil
}

func (a *App) updateTask(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var t models.Task
	if err := a.DB.First(&t, id).Error; err != nil {
		return notFound(err, "task")
	}
	if !act.IsHR() {
		var emp models.Employee
		if err := a.DB.First(&emp, t.EmployeeID).Error; err != nil {
			return notFound(err, "employee")
		}
		if !a.canView(act, &emp) || t.OwnerRole != "line_manager" {
			return httpx.Forbidden()
		}
	}
	var in struct {
		Status string  `json:"status"`
		Notes  *string `json:"notes"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	if !models.Contains(models.TaskStatuses, in.Status) {
		return httpx.Invalid(map[string]string{"status": "is not a valid status"})
	}
	if in.Status == models.TaskNotApplicable && t.Mandatory {
		return httpx.Invalid(map[string]string{"status": "mandatory tasks cannot be marked not applicable"})
	}
	updates := map[string]interface{}{"status": in.Status}
	if in.Notes != nil {
		updates["notes"] = trim(*in.Notes)
	}
	if in.Status == models.TaskDone {
		updates["completed_at"] = time.Now().UTC()
		updates["completed_by_name"] = act.Name
	} else {
		updates["completed_at"] = nil
		updates["completed_by_name"] = ""
	}
	if err := a.DB.Model(&t).Updates(updates).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "task_update", "task", t.ID, t.Title+" set to "+in.Status)
	a.DB.First(&t, t.ID)
	httpx.JSON(w, http.StatusOK, a.taskViews([]models.Task{t})[0])
	return nil
}

func (a *App) startOnboarding(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var e models.Employee
	if err := a.DB.First(&e, id).Error; err != nil {
		return notFound(err, "employee")
	}
	if e.StartDate == nil {
		return httpx.Invalid(map[string]string{"startDate": "set the employee's start date first"})
	}
	var created int
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		n, err := createTasks(tx, &e, models.KindOnboarding, *e.StartDate)
		created = n
		return err
	})
	if err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "onboarding_start", "employee", e.ID, "onboarding tasks for "+e.FullName())
	httpx.JSON(w, http.StatusOK, map[string]int{"created": created})
	return nil
}

func (a *App) startOffboarding(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var e models.Employee
	if err := a.DB.First(&e, id).Error; err != nil {
		return notFound(err, "employee")
	}
	var in struct {
		ExitDate string `json:"exitDate"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	exit, derr := parseDate(in.ExitDate)
	if derr != nil || exit == nil {
		return httpx.Invalid(map[string]string{"exitDate": "is required (YYYY-MM-DD)"})
	}
	if e.StartDate != nil && exit.Before(*e.StartDate) {
		return httpx.Invalid(map[string]string{"exitDate": "cannot be before the start date"})
	}
	if e.Status == models.StatusExited {
		return httpx.Conflict("this employee has already exited")
	}
	var created int
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&e).Updates(map[string]interface{}{"status": models.StatusOnNotice, "exit_date": *exit}).Error; err != nil {
			return err
		}
		n, err := createTasks(tx, &e, models.KindOffboarding, *exit)
		created = n
		return err
	})
	if err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "offboarding_start", "employee", e.ID, e.FullName()+" exit on "+policy.FormatDate(*exit))
	httpx.JSON(w, http.StatusOK, map[string]int{"created": created})
	return nil
}
