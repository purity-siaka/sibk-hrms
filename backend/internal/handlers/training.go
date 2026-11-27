package handlers

import (
	"net/http"
	"time"

	"sibk-hrms/backend/internal/audit"
	"sibk-hrms/backend/internal/auth"
	"sibk-hrms/backend/internal/httpx"
	"sibk-hrms/backend/internal/models"
)

type trainingUpdateView struct {
	ID          uint      `json:"id"`
	Note        string    `json:"note"`
	Sponsorship string    `json:"sponsorship"`
	Amount      *float64  `json:"amount"`
	ByName      string    `json:"byName"`
	CreatedAt   time.Time `json:"createdAt"`
}

// TrainingView is the JSON shape of a training with its updates.
type TrainingView struct {
	ID           uint                 `json:"id"`
	EmployeeID   uint                 `json:"employeeId"`
	EmployeeName string               `json:"employeeName"`
	Title        string               `json:"title"`
	Provider     string               `json:"provider"`
	StartDate    string               `json:"startDate"`
	EndDate      *string              `json:"endDate"`
	Sponsorship  string               `json:"sponsorship"`
	Status       string               `json:"status"`
	Notes        string               `json:"notes"`
	SIBKAmount   float64              `json:"sibkAmount"`
	SelfAmount   float64              `json:"selfAmount"`
	Updates      []trainingUpdateView `json:"updates"`
	CanEdit      bool                 `json:"canEdit"`
}

func (a *App) trainingViews(rows []models.Training, act *auth.Actor) []TrainingView {
	var ids, tids []uint
	for _, t := range rows {
		ids = append(ids, t.EmployeeID)
		tids = append(tids, t.ID)
	}
	names := a.employeeNames(ids)
	ups := map[uint][]models.TrainingUpdate{}
	if len(tids) > 0 {
		var all []models.TrainingUpdate
		a.DB.Where("training_id IN ?", tids).Order("created_at DESC, id DESC").Find(&all)
		for _, u := range all {
			ups[u.TrainingID] = append(ups[u.TrainingID], u)
		}
	}
	out := make([]TrainingView, len(rows))
	for i, t := range rows {
		v := TrainingView{ID: t.ID, EmployeeID: t.EmployeeID, EmployeeName: names[t.EmployeeID], Title: t.Title, Provider: t.Provider,
			StartDate: dval(t.StartDate), EndDate: dstr(t.EndDate), Sponsorship: t.Sponsorship, Status: t.Status, Notes: t.Notes,
			Updates: []trainingUpdateView{}, CanEdit: act.IsHR() || act.IsEmployee(t.EmployeeID)}
		for _, u := range ups[t.ID] {
			v.Updates = append(v.Updates, trainingUpdateView{u.ID, u.Note, u.Sponsorship, u.Amount, u.CreatedByName, u.CreatedAt})
			if u.Amount != nil {
				if u.Sponsorship == models.SponsorSIBK {
					v.SIBKAmount += *u.Amount
				} else {
					v.SelfAmount += *u.Amount
				}
			}
		}
		out[i] = v
	}
	return out
}

func (a *App) respondTraining(w http.ResponseWriter, status int, t *models.Training, act *auth.Actor) error {
	httpx.JSON(w, status, a.trainingViews([]models.Training{*t}, act)[0])
	return nil
}

func (a *App) loadTraining(r *http.Request, act *auth.Actor, needEdit bool) (*models.Training, error) {
	id, err := pathID(r)
	if err != nil {
		return nil, err
	}
	var t models.Training
	if err := a.DB.First(&t, id).Error; err != nil {
		return nil, notFound(err, "training")
	}
	var emp models.Employee
	if err := a.DB.First(&emp, t.EmployeeID).Error; err != nil {
		return nil, notFound(err, "employee")
	}
	if needEdit {
		if !act.IsHR() && !act.IsEmployee(t.EmployeeID) {
			return nil, httpx.Forbidden()
		}
	} else if !a.canView(act, &emp) {
		return nil, httpx.Forbidden()
	}
	return &t, nil
}

func (a *App) myTraining(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.actorEmployee(act)
	if err != nil {
		return err
	}
	return a.trainingFor(w, e.ID, act)
}

func (a *App) employeeTraining(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.loadViewable(r, act)
	if err != nil {
		return err
	}
	return a.trainingFor(w, e.ID, act)
}

func (a *App) trainingFor(w http.ResponseWriter, empID uint, act *auth.Actor) error {
	var rows []models.Training
	if err := a.DB.Where("employee_id = ?", empID).Order("start_date DESC, id DESC").Find(&rows).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a.trainingViews(rows, act))
	return nil
}

// listTraining is for HR (everyone) and managers (their team): who is training, and who pays.
func (a *App) listTraining(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	q := a.DB.Model(&models.Training{})
	if !act.IsHR() {
		ids, err := a.teamIDs(act)
		if err != nil {
			return err
		}
		if len(ids) == 0 {
			httpx.JSON(w, http.StatusOK, []TrainingView{})
			return nil
		}
		q = q.Where("employee_id IN ?", ids)
	}
	qs := r.URL.Query()
	if v := qs.Get("sponsorship"); v != "" {
		q = q.Where("sponsorship = ?", v)
	}
	if v := qs.Get("status"); v != "" {
		q = q.Where("status = ?", v)
	}
	if v := qs.Get("employeeId"); v != "" {
		q = q.Where("employee_id = ?", v)
	}
	var rows []models.Training
	if err := q.Order("start_date DESC, id DESC").Limit(1000).Find(&rows).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a.trainingViews(rows, act))
	return nil
}

type trainingInput struct {
	Title       *string `json:"title"`
	Provider    *string `json:"provider"`
	StartDate   *string `json:"startDate"`
	EndDate     *string `json:"endDate"`
	Sponsorship *string `json:"sponsorship"`
	Status      *string `json:"status"`
	Notes       *string `json:"notes"`
}

func (in *trainingInput) apply(t *models.Training, f fieldErrs) {
	setStr(&t.Title, in.Title)
	setStr(&t.Provider, in.Provider)
	setStr(&t.Notes, in.Notes)
	if in.StartDate != nil {
		d, err := parseDate(*in.StartDate)
		if err != nil || d == nil {
			f["startDate"] = "choose the date the training starts"
		} else {
			t.StartDate = *d
		}
	}
	if in.EndDate != nil {
		if trim(*in.EndDate) == "" {
			t.EndDate = nil
		} else {
			setDate(f, "endDate", &t.EndDate, in.EndDate)
		}
	}
	if in.Sponsorship != nil {
		if *in.Sponsorship != models.SponsorSelf && *in.Sponsorship != models.SponsorSIBK {
			f["sponsorship"] = "choose self-sponsored or SIBK-sponsored"
		}
		t.Sponsorship = *in.Sponsorship
	}
	if in.Status != nil {
		if !models.Contains(models.TrainingStatuses, *in.Status) {
			f["status"] = "is not a valid status"
		}
		t.Status = *in.Status
	}
	if t.Title == "" {
		f["title"] = "enter the name of the training"
	} else if len(t.Title) > 200 || len(t.Provider) > 200 {
		f["title"] = "keep the name and provider under 200 characters"
	}
	if t.Sponsorship == "" {
		f["sponsorship"] = "choose self-sponsored or SIBK-sponsored"
	}
	if t.StartDate.IsZero() {
		f["startDate"] = "choose the date the training starts"
	}
	if t.EndDate != nil && !t.StartDate.IsZero() && t.EndDate.Before(t.StartDate) {
		f["endDate"] = "must be on or after the start date"
	}
}

// createMyTraining lets an employee say that a training is coming up.
func (a *App) createMyTraining(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.actorEmployee(act)
	if err != nil {
		return err
	}
	var in trainingInput
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	t := models.Training{EmployeeID: e.ID, Status: models.TrainingUpcoming}
	f := fieldErrs{}
	in.Status = nil
	in.apply(&t, f)
	if err := f.err(); err != nil {
		return err
	}
	if err := a.DB.Create(&t).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "training_create", "training", t.ID, t.Title+" ("+t.Sponsorship+")")
	return a.respondTraining(w, http.StatusCreated, &t, act)
}

func (a *App) updateTraining(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	t, err := a.loadTraining(r, act, true)
	if err != nil {
		return err
	}
	var in trainingInput
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	f := fieldErrs{}
	in.apply(t, f)
	if err := f.err(); err != nil {
		return err
	}
	if err := a.DB.Save(t).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "training_update", "training", t.ID, t.Title)
	return a.respondTraining(w, http.StatusOK, t, act)
}

func (a *App) addTrainingUpdate(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	t, err := a.loadTraining(r, act, true)
	if err != nil {
		return err
	}
	var in struct {
		Note        string   `json:"note"`
		Sponsorship string   `json:"sponsorship"`
		Amount      *float64 `json:"amount"`
		Status      *string  `json:"status"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	f := fieldErrs{}
	note := trim(in.Note)
	if note == "" {
		f["note"] = "write a short update"
	} else if len(note) > 2000 {
		f["note"] = "keep the update under 2000 characters"
	}
	if in.Sponsorship != models.SponsorSelf && in.Sponsorship != models.SponsorSIBK {
		f["sponsorship"] = "say whether this is self-sponsored or SIBK-sponsored"
	}
	if in.Amount != nil && (*in.Amount < 0 || *in.Amount > 100000000) {
		f["amount"] = "enter a valid amount"
	}
	if in.Status != nil && !models.Contains(models.TrainingStatuses, *in.Status) {
		f["status"] = "is not a valid status"
	}
	if err := f.err(); err != nil {
		return err
	}
	u := models.TrainingUpdate{TrainingID: t.ID, Note: note, Sponsorship: in.Sponsorship, Amount: in.Amount, CreatedByName: act.Name}
	t.Sponsorship = in.Sponsorship
	if in.Status != nil {
		t.Status = *in.Status
	}
	if err := a.DB.Create(&u).Error; err != nil {
		return err
	}
	if err := a.DB.Save(t).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "training_note", "training", t.ID, t.Title+" ("+in.Sponsorship+")")
	return a.respondTraining(w, http.StatusCreated, t, act)
}

func (a *App) deleteTraining(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	t, err := a.loadTraining(r, act, true)
	if err != nil {
		return err
	}
	if !act.IsHR() {
		return httpx.Forbidden()
	}
	a.DB.Where("training_id = ?", t.ID).Delete(&models.TrainingUpdate{})
	if err := a.DB.Delete(t).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "training_delete", "training", t.ID, t.Title)
	w.WriteHeader(http.StatusNoContent)
	return nil
}
