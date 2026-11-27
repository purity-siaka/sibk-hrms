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

type taskInput struct {
	EmployeeID *uint   `json:"employeeId"`
	Kind       *string `json:"kind"`
	Title      *string `json:"title"`
	OwnerRole  *string `json:"ownerRole"`
	DueDate    *string `json:"dueDate"`
	Status     *string `json:"status"`
	Notes      *string `json:"notes"`
}

// applyTask validates the input onto t. HR may change everything; a line manager only the status and notes.
func (a *App) applyTask(t *models.Task, in *taskInput, hr bool) (fieldErrs, error) {
	f := fieldErrs{}
	if hr {
		if in.EmployeeID != nil {
			var n int64
			a.DB.Model(&models.Employee{}).Where("id = ?", *in.EmployeeID).Count(&n)
			if n == 0 {
				f["employeeId"] = "choose who the task is for"
			}
			t.EmployeeID = *in.EmployeeID
		}
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
		setDate(f, "dueDate", &t.DueDate, in.DueDate)
		if t.Title == "" {
			f["title"] = "is required"
		}
		if t.EmployeeID == 0 {
			f["employeeId"] = "choose who the task is for"
		}
	}
	if in.Notes != nil {
		t.Notes = trim(*in.Notes)
	}
	if in.Status != nil {
		if !models.Contains(models.TaskStatuses, *in.Status) {
			f["status"] = "is not a valid status"
		} else if t.Status != *in.Status {
			t.Status = *in.Status
			if t.Status == models.TaskDone {
				now := time.Now().UTC()
				t.CompletedAt = &now
			} else {
				t.CompletedAt, t.CompletedByName = nil, ""
			}
		}
	}
	return f, nil
}

func (a *App) createTask(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var in taskInput
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	t := models.Task{OwnerRole: "hr", Status: models.TaskPending}
	f, err := a.applyTask(&t, &in, true)
	if err != nil {
		return err
	}
	if t.Kind == "" {
		f["kind"] = "is required"
	}
	if err := f.err(); err != nil {
		return err
	}
	if t.Status == models.TaskDone {
		t.CompletedByName = act.Name
	}
	if err := a.DB.Create(&t).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "task_create", "task", t.ID, t.Kind+": "+t.Title)
	httpx.JSON(w, http.StatusCreated, a.taskViews([]models.Task{t})[0])
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
	var in taskInput
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	wasDone := t.Status == models.TaskDone
	f, err := a.applyTask(&t, &in, act.IsHR())
	if err != nil {
		return err
	}
	if err := f.err(); err != nil {
		return err
	}
	if t.Status == models.TaskDone && !wasDone {
		t.CompletedByName = act.Name
	}
	if err := a.DB.Save(&t).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "task_update", "task", t.ID, t.Title+" ("+t.Status+")")
	httpx.JSON(w, http.StatusOK, a.taskViews([]models.Task{t})[0])
	return nil
}

func (a *App) deleteTask(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var t models.Task
	if err := a.DB.First(&t, id).Error; err != nil {
		return notFound(err, "task")
	}
	if err := a.DB.Delete(&t).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "task_delete", "task", id, t.Title)
	w.WriteHeader(http.StatusNoContent)
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
		return tx.Model(&e).Updates(map[string]interface{}{"status": models.StatusOnNotice, "exit_date": *exit}).Error
	})
	if err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "offboarding_start", "employee", e.ID, e.FullName()+" exit on "+policy.FormatDate(*exit))
	httpx.JSON(w, http.StatusOK, map[string]int{"created": created})
	return nil
}
