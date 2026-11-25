package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"sibk-hrms/backend/internal/audit"
	"sibk-hrms/backend/internal/auth"
	"sibk-hrms/backend/internal/httpx"
	"sibk-hrms/backend/internal/mail"
	"sibk-hrms/backend/internal/models"
	"sibk-hrms/backend/internal/policy"
	"sibk-hrms/backend/internal/storage"
)

const backdateDays = 14 // staff may record leave that started up to this many days ago

// ---- balances ----

// LeaveBalance is an employee's annual-leave position.
type LeaveBalance struct {
	Accrued        float64 `json:"accruedDays"`
	CarriedForward float64 `json:"carriedForwardDays"`
	Taken          float64 `json:"takenDays"`
	Pending        float64 `json:"pendingDays"`
	Remaining      float64 `json:"remainingDays"`
	Available      float64 `json:"availableDays"` // remaining minus annual leave awaiting a decision
	DoesNotApprove bool    `json:"doesNotApprove"`
}

func (a *App) balanceOf(e *models.Employee) (LeaveBalance, error) {
	var pending float64
	err := a.DB.Model(&models.LeaveRequest{}).
		Where("employee_id = ? AND type = ? AND status = ?", e.ID, models.LeaveAnnual, models.LeavePending).
		Select("COALESCE(SUM(days), 0)").Scan(&pending).Error
	if err != nil {
		return LeaveBalance{}, err
	}
	rem := e.LeaveAccruedDays + e.LeaveCarriedForward - e.LeaveTakenDays
	return LeaveBalance{
		Accrued: e.LeaveAccruedDays, CarriedForward: e.LeaveCarriedForward, Taken: e.LeaveTakenDays,
		Pending: pending, Remaining: rem, Available: rem - pending, DoesNotApprove: e.DoesNotApprove,
	}, nil
}

// ---- holidays ----

// holidayFunc loads the holidays once and returns a lookup.
func (a *App) holidayFunc() (func(time.Time) bool, error) {
	var hs []models.Holiday
	if err := a.DB.Find(&hs).Error; err != nil {
		return nil, err
	}
	exact := map[string]bool{}
	yearly := map[string]bool{}
	for _, h := range hs {
		exact[h.Date.Format("2006-01-02")] = true
		if h.RepeatsYearly {
			yearly[h.Date.Format("01-02")] = true
		}
	}
	return func(t time.Time) bool { return exact[t.Format("2006-01-02")] || yearly[t.Format("01-02")] }, nil
}

type holidayView struct {
	ID            uint   `json:"id"`
	Name          string `json:"name"`
	Date          string `json:"date"`
	RepeatsYearly bool   `json:"repeatsYearly"`
}

func (a *App) listHolidays(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var hs []models.Holiday
	if err := a.DB.Order("date, id").Find(&hs).Error; err != nil {
		return err
	}
	out := make([]holidayView, len(hs))
	for i, h := range hs {
		out[i] = holidayView{h.ID, h.Name, dval(h.Date), h.RepeatsYearly}
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (a *App) createHoliday(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var in struct {
		Name          string `json:"name"`
		Date          string `json:"date"`
		RepeatsYearly bool   `json:"repeatsYearly"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	f := fieldErrs{}
	in.Name = trim(in.Name)
	if in.Name == "" || len(in.Name) > 150 {
		f["name"] = "enter the holiday name"
	}
	d, derr := parseDate(in.Date)
	if derr != nil || d == nil {
		f["date"] = "choose a date"
	}
	if err := f.err(); err != nil {
		return err
	}
	h := models.Holiday{Name: in.Name, Date: *d, RepeatsYearly: in.RepeatsYearly}
	if err := a.DB.Create(&h).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "holiday_create", "holiday", h.ID, h.Name+" "+dval(h.Date))
	httpx.JSON(w, http.StatusCreated, holidayView{h.ID, h.Name, dval(h.Date), h.RepeatsYearly})
	return nil
}

func (a *App) deleteHoliday(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	res := a.DB.Delete(&models.Holiday{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return httpx.NotFound("holiday")
	}
	audit.Log(a.DB, act, clientIP(r), "holiday_delete", "holiday", id, "holiday removed")
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// calcDays previews how many leave days a date range will use.
func (a *App) calcDays(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	from, ferr := parseDate(r.URL.Query().Get("from"))
	to, terr := parseDate(r.URL.Query().Get("to"))
	if ferr != nil || terr != nil || from == nil || to == nil {
		return httpx.BadRequest("from and to must be dates in YYYY-MM-DD format")
	}
	if to.Before(*from) || policy.DaysBetween(*from, *to) > 366 {
		return httpx.BadRequest("the end date must be on or after the start date")
	}
	hol, err := a.holidayFunc()
	if err != nil {
		return err
	}
	var skipped []string
	for d := *from; !d.After(*to); d = d.AddDate(0, 0, 1) {
		if !policy.IsWeekend(d) && hol(d) {
			skipped = append(skipped, dval(d))
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]interface{}{"days": policy.WorkingDays(*from, *to, hol), "holidays": skipped})
	return nil
}

// ---- approver routing ----

func (a *App) userFor(empID uint) *models.User {
	var u models.User
	if err := a.DB.Where("employee_id = ?", empID).First(&u).Error; err != nil {
		return nil
	}
	return &u
}

func (a *App) canApproveEmp(id uint) bool {
	var e models.Employee
	if err := a.DB.First(&e, id).Error; err != nil || e.DoesNotApprove || e.Status == models.StatusExited {
		return false
	}
	var n int64
	a.DB.Model(&models.User{}).Where("employee_id = ? AND active = ?", id, true).Count(&n)
	return n > 0
}

// routeLeave decides who decides a request. Every request goes to the employee's line manager,
// whose decision is final. It goes to HR only when there is no manager stage: the person has no
// manager (for example the CEO) or the manager is set not to approve.
func (a *App) routeLeave(e *models.Employee) (string, *uint) {
	if e.ManagerID != nil && *e.ManagerID != e.ID && a.canApproveEmp(*e.ManagerID) {
		return models.ApproverManager, ptrUint(*e.ManagerID)
	}
	return models.ApproverHR, nil
}

// ---- views ----

// LeaveView is the JSON shape of a leave request.
type LeaveView struct {
	ID                     uint       `json:"id"`
	EmployeeID             uint       `json:"employeeId"`
	EmployeeName           string     `json:"employeeName"`
	Type                   string     `json:"type"`
	TypeLabel              string     `json:"typeLabel"`
	FromDate               string     `json:"fromDate"`
	ToDate                 string     `json:"toDate"`
	Days                   float64    `json:"days"`
	Reason                 string     `json:"reason"`
	Status                 string     `json:"status"`
	ApproverType           string     `json:"approverType"`
	ApproverName           string     `json:"approverName"`
	DaysRemainingAtRequest float64    `json:"daysRemainingAtRequest"`
	DecidedByName          string     `json:"decidedByName,omitempty"`
	DecidedAt              *time.Time `json:"decidedAt"`
	Comment                string     `json:"comment,omitempty"`
	HasNote                bool       `json:"hasNote"`
	NoteFileName           string     `json:"noteFileName,omitempty"`
	TrainingTitle          string     `json:"trainingTitle,omitempty"`
	TrainingProvider       string     `json:"trainingProvider,omitempty"`
	NeedsNote              bool       `json:"needsNote"`
	CreatedAt              time.Time  `json:"createdAt"`
	CanDecide              bool       `json:"canDecide"`
	CanCancel              bool       `json:"canCancel"`
	CanAttach              bool       `json:"canAttach"`
}

func needsNote(l *models.LeaveRequest) bool {
	return l.Type == models.LeaveSick && l.Days > models.SickNoteAfterDays && l.NoteKey == "" &&
		(l.Status == models.LeavePending || l.Status == models.LeaveApproved)
}

func (a *App) mayDecide(act *auth.Actor, l *models.LeaveRequest) bool {
	if l.Status != models.LeavePending || act.IsEmployee(l.EmployeeID) {
		return false
	}
	if l.ApproverType == models.ApproverHR {
		return act.IsHR()
	}
	return l.ApproverEmployeeID != nil && act.IsEmployee(*l.ApproverEmployeeID)
}

func (a *App) leaveViews(rows []models.LeaveRequest, act *auth.Actor) []LeaveView {
	var ids []uint
	for _, l := range rows {
		ids = append(ids, l.EmployeeID)
		if l.ApproverEmployeeID != nil {
			ids = append(ids, *l.ApproverEmployeeID)
		}
	}
	names := a.employeeNames(ids)
	today := policy.Today()
	out := make([]LeaveView, len(rows))
	for i := range rows {
		l := &rows[i]
		approver := "HR"
		if l.ApproverEmployeeID != nil {
			approver = names[*l.ApproverEmployeeID]
		}
		own := act.IsEmployee(l.EmployeeID)
		open := l.Status == models.LeavePending || (l.Status == models.LeaveApproved && !l.ToDate.Before(today))
		out[i] = LeaveView{
			ID: l.ID, EmployeeID: l.EmployeeID, EmployeeName: names[l.EmployeeID], Type: l.Type, TypeLabel: models.LeaveTypeLabel(l.Type),
			FromDate: dval(l.FromDate), ToDate: dval(l.ToDate), Days: l.Days, Reason: l.Reason, Status: l.Status,
			ApproverType: l.ApproverType, ApproverName: approver, DaysRemainingAtRequest: l.DaysRemainingAtRequest,
			DecidedByName: l.DecidedByName, DecidedAt: l.DecidedAt, Comment: l.Comment, HasNote: l.NoteKey != "",
			TrainingTitle: l.TrainingTitle, TrainingProvider: l.TrainingProvider,
			NoteFileName: l.NoteFileName, NeedsNote: needsNote(l), CreatedAt: l.CreatedAt,
			CanDecide: a.mayDecide(act, l), CanCancel: open && (own || act.IsHR()),
			CanAttach: l.Type == models.LeaveSick && open && (own || act.IsHR()),
		}
	}
	return out
}

// ---- create ----

func (a *App) applyLeave(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.actorEmployee(act)
	if err != nil {
		return err
	}
	return a.createLeave(w, r, act, e, false)
}

func (a *App) recordLeaveFor(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var e models.Employee
	if err := a.DB.First(&e, id).Error; err != nil {
		return notFound(err, "employee")
	}
	return a.createLeave(w, r, act, &e, true)
}

func (a *App) createLeave(w http.ResponseWriter, r *http.Request, act *auth.Actor, e *models.Employee, onBehalf bool) error {
	if e.Status == models.StatusExited {
		return httpx.NewError(http.StatusConflict, "this employee has left the bank")
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxDocBytes+(64<<10))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		return httpx.BadRequest("the form is invalid or the attachment is larger than 10 MB")
	}
	typ := r.FormValue("type")
	reason := trim(r.FormValue("reason"))
	f := fieldErrs{}
	if !models.ValidLeaveType(typ) {
		f["type"] = "choose a leave type"
	}
	from, ferr := parseDate(r.FormValue("fromDate"))
	to, terr := parseDate(r.FormValue("toDate"))
	if ferr != nil || from == nil {
		f["fromDate"] = "choose the first day of leave"
	}
	if terr != nil || to == nil {
		f["toDate"] = "choose the last day of leave"
	}
	if reason == "" {
		f["reason"] = "give a short reason"
	} else if len(reason) > 1000 {
		f["reason"] = "keep the reason under 1000 characters"
	}
	title, provider := trim(r.FormValue("trainingTitle")), trim(r.FormValue("trainingProvider"))
	if typ == models.LeaveTraining {
		if title == "" {
			f["trainingTitle"] = "enter the name of the training"
		}
		if len(title) > 200 || len(provider) > 200 {
			f["trainingTitle"] = "keep the training name and provider under 200 characters"
		}
	} else {
		title, provider = "", ""
	}
	if len(f) == 0 && to.Before(*from) {
		f["toDate"] = "must be on or after the first day"
	}
	if len(f) == 0 && policy.DaysBetween(*from, *to) > 366 {
		f["toDate"] = "leave cannot be longer than a year"
	}
	if len(f) == 0 && !onBehalf && policy.DaysBetween(*from, policy.Today()) > backdateDays {
		f["fromDate"] = fmt.Sprintf("leave can only be recorded up to %d days after it started. Ask HR to record it.", backdateDays)
	}
	if err := f.err(); err != nil {
		return err
	}
	hol, err := a.holidayFunc()
	if err != nil {
		return err
	}
	days := policy.WorkingDays(*from, *to, hol)
	if days <= 0 {
		return httpx.Invalid(fieldErrs{"toDate": "those dates are all weekends or public holidays, so no leave is needed"})
	}
	var clash int64
	if err := a.DB.Model(&models.LeaveRequest{}).
		Where("employee_id = ? AND status IN ? AND from_date <= ? AND to_date >= ?", e.ID, []string{models.LeavePending, models.LeaveApproved}, *to, *from).
		Count(&clash).Error; err != nil {
		return err
	}
	if clash > 0 {
		return httpx.NewError(http.StatusConflict, "there is already a pending or approved leave request on some of these dates")
	}
	bal, err := a.balanceOf(e)
	if err != nil {
		return err
	}
	if typ == models.LeaveAnnual && days > bal.Available {
		return httpx.Invalid(fieldErrs{"toDate": fmt.Sprintf("this needs %s days but only %s annual leave days are available", num(days), num(bal.Available))})
	}

	l := models.LeaveRequest{
		EmployeeID: e.ID, Type: typ, FromDate: *from, ToDate: *to, Days: days, Reason: reason, Status: models.LeavePending,
		DaysRemainingAtRequest: bal.Remaining, CreatedByUserID: ptrUint(act.UserID), TrainingTitle: title, TrainingProvider: provider,
	}
	l.ApproverType, l.ApproverEmployeeID = a.routeLeave(e)

	if file, hdr, ferr := r.FormFile("file"); ferr == nil {
		defer file.Close()
		if typ != models.LeaveSick {
			return httpx.Invalid(fieldErrs{"file": "attachments are only for sick leave"})
		}
		saved, serr := a.Store.Save(file, hdr.Filename, maxDocBytes, storage.Any)
		if serr != nil {
			return uploadError(serr, "files must be PDF, JPG, PNG or DOCX up to 10 MB")
		}
		l.NoteKey, l.NoteContentType, l.NoteFileName = saved.Key, saved.ContentType, cleanName(hdr.Filename)
	}
	if err := a.DB.Create(&l).Error; err != nil {
		if l.NoteKey != "" {
			a.Store.Delete(l.NoteKey)
		}
		return err
	}
	who := "own"
	if onBehalf {
		who = "recorded by HR for " + e.FullName()
	}
	audit.Log(a.DB, act, clientIP(r), "leave_apply", "leave", l.ID, fmt.Sprintf("%s %s to %s (%s days), %s", models.LeaveTypeLabel(typ), dval(l.FromDate), dval(l.ToDate), num(days), who))
	a.notifyApplied(&l, e)
	httpx.JSON(w, http.StatusCreated, a.leaveViews([]models.LeaveRequest{l}, act)[0])
	return nil
}

func cleanName(name string) string {
	if i := strings.LastIndexAny(name, `/\`); i >= 0 {
		name = name[i+1:]
	}
	if len(name) > 200 {
		name = name[len(name)-200:]
	}
	return name
}

func num(f float64) string { return strconv.FormatFloat(f, 'f', -1, 64) }

// ---- load / decide / cancel ----

func (a *App) loadLeave(r *http.Request) (*models.LeaveRequest, error) {
	id, err := pathID(r)
	if err != nil {
		return nil, err
	}
	var l models.LeaveRequest
	if err := a.DB.First(&l, id).Error; err != nil {
		return nil, notFound(err, "leave request")
	}
	return &l, nil
}

func (a *App) mayReadLeave(act *auth.Actor, l *models.LeaveRequest) bool {
	return act.IsHR() || act.IsEmployee(l.EmployeeID) || (l.ApproverEmployeeID != nil && act.IsEmployee(*l.ApproverEmployeeID))
}

func (a *App) decideLeave(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	l, err := a.loadLeave(r)
	if err != nil {
		return err
	}
	var in struct {
		Decision string `json:"decision"`
		Comment  string `json:"comment"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	in.Comment = trim(in.Comment)
	f := fieldErrs{}
	if in.Decision != "approve" && in.Decision != "reject" {
		f["decision"] = "choose approve or reject"
	}
	if in.Decision == "reject" && in.Comment == "" {
		f["comment"] = "give a reason so the employee understands"
	}
	if len(in.Comment) > 1000 {
		f["comment"] = "keep the comment under 1000 characters"
	}
	if err := f.err(); err != nil {
		return err
	}
	if !a.mayDecide(act, l) {
		if l.Status != models.LeavePending {
			return httpx.NewError(http.StatusConflict, "this request has already been "+l.Status)
		}
		return httpx.Forbidden()
	}
	status := models.LeaveApproved
	if in.Decision == "reject" {
		status = models.LeaveRejected
	}
	now := time.Now().UTC()
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&models.LeaveRequest{}).Where("id = ? AND status = ?", l.ID, models.LeavePending).
			Updates(map[string]interface{}{"status": status, "decided_by_name": act.Name, "decided_by_user_id": act.UserID, "decided_at": now, "comment": in.Comment,
				"counted_in_balance": status == models.LeaveApproved && l.Type == models.LeaveAnnual})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return httpx.NewError(http.StatusConflict, "this request has already been decided")
		}
		if status == models.LeaveApproved && l.Type == models.LeaveAnnual {
			return tx.Model(&models.Employee{}).Where("id = ?", l.EmployeeID).
				UpdateColumn("leave_taken_days", gorm.Expr("leave_taken_days + ?", l.Days)).Error
		}
		return nil
	})
	if err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "leave_"+in.Decision, "leave", l.ID, fmt.Sprintf("%s leave %s to %s (%s days)", models.LeaveTypeLabel(l.Type), dval(l.FromDate), dval(l.ToDate), num(l.Days)))
	a.notifyDecided(l.ID)
	return a.respondLeave(w, l.ID, act)
}

func (a *App) respondLeave(w http.ResponseWriter, id uint, act *auth.Actor) error {
	var l models.LeaveRequest
	if err := a.DB.First(&l, id).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a.leaveViews([]models.LeaveRequest{l}, act)[0])
	return nil
}

func (a *App) cancelLeave(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	l, err := a.loadLeave(r)
	if err != nil {
		return err
	}
	if !act.IsEmployee(l.EmployeeID) && !act.IsHR() {
		return httpx.Forbidden()
	}
	if l.Status != models.LeavePending && l.Status != models.LeaveApproved {
		return httpx.NewError(http.StatusConflict, "this request is already "+l.Status)
	}
	if l.Status == models.LeaveApproved && l.ToDate.Before(policy.Today()) {
		return httpx.NewError(http.StatusConflict, "leave that has already finished cannot be cancelled")
	}
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&models.LeaveRequest{}).Where("id = ? AND status IN ?", l.ID, []string{models.LeavePending, models.LeaveApproved}).
			Updates(map[string]interface{}{"status": models.LeaveCancelled, "counted_in_balance": false})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return httpx.NewError(http.StatusConflict, "this request has already changed")
		}
		if l.CountedInBalance {
			return tx.Model(&models.Employee{}).Where("id = ?", l.EmployeeID).
				UpdateColumn("leave_taken_days", gorm.Expr("GREATEST(leave_taken_days - ?, 0)", l.Days)).Error
		}
		return nil
	})
	if err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "leave_cancel", "leave", l.ID, fmt.Sprintf("%s leave %s to %s", models.LeaveTypeLabel(l.Type), dval(l.FromDate), dval(l.ToDate)))
	a.notifyCancelled(l.ID)
	return a.respondLeave(w, l.ID, act)
}

// ---- sick note ----

func (a *App) attachLeaveNote(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	l, err := a.loadLeave(r)
	if err != nil {
		return err
	}
	if !act.IsEmployee(l.EmployeeID) && !act.IsHR() {
		return httpx.Forbidden()
	}
	if l.Type != models.LeaveSick {
		return httpx.BadRequest("attachments are only for sick leave")
	}
	if l.Status != models.LeavePending && l.Status != models.LeaveApproved {
		return httpx.NewError(http.StatusConflict, "this request is "+l.Status)
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxDocBytes+(64<<10))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		return httpx.BadRequest("the upload is invalid or larger than 10 MB")
	}
	file, hdr, ferr := r.FormFile("file")
	if ferr != nil {
		return httpx.Invalid(fieldErrs{"file": "attach a file"})
	}
	defer file.Close()
	saved, err := a.Store.Save(file, hdr.Filename, maxDocBytes, storage.Any)
	if err != nil {
		return uploadError(err, "files must be PDF, JPG, PNG or DOCX up to 10 MB")
	}
	old := l.NoteKey
	if err := a.DB.Model(&models.LeaveRequest{}).Where("id = ?", l.ID).
		Updates(map[string]interface{}{"note_key": saved.Key, "note_content_type": saved.ContentType, "note_file_name": cleanName(hdr.Filename)}).Error; err != nil {
		a.Store.Delete(saved.Key)
		return err
	}
	if old != "" {
		a.Store.Delete(old)
	}
	audit.Log(a.DB, act, clientIP(r), "leave_note_upload", "leave", l.ID, "sick note attached")
	return a.respondLeave(w, l.ID, act)
}

func (a *App) downloadLeaveNote(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	l, err := a.loadLeave(r)
	if err != nil {
		return err
	}
	if !a.mayReadLeave(act, l) {
		return httpx.Forbidden()
	}
	if l.NoteKey == "" {
		return httpx.NotFound("attachment")
	}
	f, err := a.Store.Open(l.NoteKey)
	if err != nil {
		return httpx.NotFound("file")
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "leave_note_download", "leave", l.ID, "downloaded sick note")
	w.Header().Set("Content-Type", l.NoteContentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", safeFilename(l.NoteFileName)))
	http.ServeContent(w, r, "", st.ModTime(), f)
	return nil
}

// ---- lists ----

type leaveSummary struct {
	Balance      LeaveBalance  `json:"balance"`
	Requests     []LeaveView   `json:"requests"`
	CanApprove   bool          `json:"canApprove"`
	PendingToMe  int           `json:"pendingApprovals"`
	NextHolidays []holidayView `json:"upcomingHolidays,omitempty"`
}

func (a *App) summaryFor(e *models.Employee, act *auth.Actor) (*leaveSummary, error) {
	bal, err := a.balanceOf(e)
	if err != nil {
		return nil, err
	}
	var rows []models.LeaveRequest
	if err := a.DB.Where("employee_id = ?", e.ID).Order("from_date DESC, id DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return &leaveSummary{Balance: bal, Requests: a.leaveViews(rows, act)}, nil
}

func (a *App) myLeave(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.actorEmployee(act)
	if err != nil {
		return err
	}
	s, err := a.summaryFor(e, act)
	if err != nil {
		return err
	}
	pending, can, err := a.approvalQueue(act)
	if err != nil {
		return err
	}
	s.CanApprove, s.PendingToMe = can, len(pending)
	var hs []models.Holiday
	a.DB.Where("date >= ?", policy.Today()).Order("date").Limit(5).Find(&hs)
	for _, h := range hs {
		s.NextHolidays = append(s.NextHolidays, holidayView{h.ID, h.Name, dval(h.Date), h.RepeatsYearly})
	}
	httpx.JSON(w, http.StatusOK, s)
	return nil
}

func (a *App) employeeLeave(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.loadViewable(r, act)
	if err != nil {
		return err
	}
	s, err := a.summaryFor(e, act)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, s)
	return nil
}

// approvalQueue returns pending requests the actor can decide, and whether the actor is an approver at all.
func (a *App) approvalQueue(act *auth.Actor) ([]models.LeaveRequest, bool, error) {
	q := a.DB.Model(&models.LeaveRequest{}).Where("status = ?", models.LeavePending)
	can := act.IsHR()
	switch {
	case act.IsHR() && act.EmployeeID != nil:
		q = q.Where("(approver_type = ? OR approver_employee_id = ?) AND employee_id <> ?", models.ApproverHR, *act.EmployeeID, *act.EmployeeID)
	case act.IsHR():
		q = q.Where("approver_type = ?", models.ApproverHR)
	case act.EmployeeID != nil:
		q = q.Where("approver_employee_id = ? AND employee_id <> ?", *act.EmployeeID, *act.EmployeeID)
	default:
		return nil, false, nil
	}
	if !can && act.EmployeeID != nil {
		var n int64
		a.DB.Model(&models.Employee{}).Where("manager_id = ?", *act.EmployeeID).Count(&n)
		if n == 0 {
			a.DB.Model(&models.LeaveRequest{}).Where("approver_employee_id = ?", *act.EmployeeID).Count(&n)
		}
		can = n > 0
	}
	var rows []models.LeaveRequest
	if err := q.Order("from_date, id").Find(&rows).Error; err != nil {
		return nil, false, err
	}
	return rows, can, nil
}

func (a *App) leaveApprovals(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	rows, can, err := a.approvalQueue(act)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]interface{}{"canApprove": can, "items": a.leaveViews(rows, act)})
	return nil
}

func (a *App) listLeave(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	q := a.DB.Model(&models.LeaveRequest{})
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
	if v := trim(qs.Get("q")); v != "" {
		q = q.Where("employee_id IN (?)", a.DB.Model(&models.Employee{}).Select("id").
			Where("LOWER(first_name || ' ' || last_name) LIKE ?", "%"+strings.ToLower(v)+"%"))
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return err
	}
	_, size, offset := httpx.Page(r)
	var rows []models.LeaveRequest
	if err := q.Order("from_date DESC, id DESC").Limit(size).Offset(offset).Find(&rows).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]interface{}{"items": a.leaveViews(rows, act), "total": total})
	return nil
}

// ---- balances admin ----

func (a *App) updateLeaveBalance(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var e models.Employee
	if err := a.DB.First(&e, id).Error; err != nil {
		return notFound(err, "employee")
	}
	var in struct {
		Accrued        float64 `json:"accruedDays"`
		CarriedForward float64 `json:"carriedForwardDays"`
		DoesNotApprove bool    `json:"doesNotApprove"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	f := fieldErrs{}
	if in.Accrued < 0 || in.Accrued > 366 {
		f["accruedDays"] = "enter a number between 0 and 366"
	}
	if in.CarriedForward < 0 || in.CarriedForward > 366 {
		f["carriedForwardDays"] = "enter a number between 0 and 366"
	}
	if err := f.err(); err != nil {
		return err
	}
	summary := fmt.Sprintf("%s: accrued %s to %s, carried forward %s to %s, does not approve %t",
		e.FullName(), num(e.LeaveAccruedDays), num(in.Accrued), num(e.LeaveCarriedForward), num(in.CarriedForward), in.DoesNotApprove)
	if err := a.DB.Model(&models.Employee{}).Where("id = ?", e.ID).
		Updates(map[string]interface{}{"leave_accrued_days": in.Accrued, "leave_carried_forward": in.CarriedForward, "does_not_approve": in.DoesNotApprove}).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "leave_balance_update", "employee", e.ID, summary)
	if err := a.DB.First(&e, e.ID).Error; err != nil {
		return err
	}
	bal, err := a.balanceOf(&e)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, bal)
	return nil
}

// yearEnd carries every remaining annual-leave day forward (no cap) and restarts the year.
func (a *App) yearEnd(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var in struct {
		Confirm string `json:"confirm"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	if in.Confirm != "CARRY FORWARD" {
		return httpx.Invalid(fieldErrs{"confirm": "type CARRY FORWARD to confirm"})
	}
	res := a.DB.Exec(`UPDATE employees SET leave_carried_forward = GREATEST(0, leave_accrued_days + leave_carried_forward - leave_taken_days),
		leave_accrued_days = 0, leave_taken_days = 0 WHERE status <> ?`, models.StatusExited)
	if res.Error != nil {
		return res.Error
	}
	audit.Log(a.DB, act, clientIP(r), "leave_year_end", "employee", "all", fmt.Sprintf("year-end carry forward run for %d employees", res.RowsAffected))
	httpx.JSON(w, http.StatusOK, map[string]int64{"employees": res.RowsAffected})
	return nil
}

// ---- reports ----

type leaveReport struct {
	Key     string     `json:"key"`
	Title   string     `json:"title"`
	Columns []string   `json:"columns"`
	Rows    [][]string `json:"rows"`
}

var leaveReportTitles = map[string]string{
	"out-now": "Who's out now", "pending": "Pending approvals", "upcoming": "Upcoming leave (90 days)",
	"balances": "Leave balances", "sick-no-note": "Sick leave without note", "audit": "Approval audit trail", "training": "Training applications",
}

func (a *App) leaveReportFor(key string) (*leaveReport, error) {
	title, ok := leaveReportTitles[key]
	if !ok {
		return nil, httpx.NotFound("report")
	}
	rep := &leaveReport{Key: key, Title: title, Rows: [][]string{}}
	today := policy.Today()
	if key == "balances" {
		var emps []models.Employee
		if err := a.DB.Where("status <> ?", models.StatusExited).Order("first_name, last_name").Find(&emps).Error; err != nil {
			return nil, err
		}
		rep.Columns = []string{"Employee", "Position", "Accrued", "Carried forward", "Taken", "Remaining"}
		for i := range emps {
			e := &emps[i]
			rep.Rows = append(rep.Rows, []string{e.FullName(), e.JobTitle, num(e.LeaveAccruedDays), num(e.LeaveCarriedForward), num(e.LeaveTakenDays),
				num(e.LeaveAccruedDays + e.LeaveCarriedForward - e.LeaveTakenDays)})
		}
		return rep, nil
	}
	q := a.DB.Model(&models.LeaveRequest{})
	switch key {
	case "out-now":
		q = q.Where("status = ? AND from_date <= ? AND to_date >= ?", models.LeaveApproved, today, today).Order("to_date, id")
		rep.Columns = []string{"Employee", "Type", "From", "To", "Days", "Back on"}
	case "pending":
		q = q.Where("status = ?", models.LeavePending).Order("from_date, id")
		rep.Columns = []string{"Employee", "Type", "From", "To", "Days", "Waiting for", "Requested on"}
	case "upcoming":
		q = q.Where("status = ? AND to_date >= ? AND from_date <= ?", models.LeaveApproved, today, today.AddDate(0, 0, 90)).Order("from_date, id")
		rep.Columns = []string{"Employee", "Type", "From", "To", "Days"}
	case "sick-no-note":
		q = q.Where("type = ? AND days > ? AND note_key = '' AND status IN ?", models.LeaveSick, models.SickNoteAfterDays, []string{models.LeavePending, models.LeaveApproved}).Order("from_date DESC, id")
		rep.Columns = []string{"Employee", "From", "To", "Days", "Status"}
	case "training":
		q = q.Where("type = ? AND status IN ?", models.LeaveTraining, []string{models.LeavePending, models.LeaveApproved}).Order("from_date DESC, id")
		rep.Columns = []string{"Employee", "Training", "Provider", "From", "To", "Days", "Status"}
	case "audit":
		q = q.Where("status <> ?", models.LeavePending).Order("COALESCE(decided_at, updated_at) DESC, id DESC").Limit(500)
		rep.Columns = []string{"Employee", "Type", "From", "To", "Days", "Outcome", "Decided by", "Decided on", "Comment"}
	}
	var rows []models.LeaveRequest
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	var ids []uint
	for _, l := range rows {
		ids = append(ids, l.EmployeeID)
		if l.ApproverEmployeeID != nil {
			ids = append(ids, *l.ApproverEmployeeID)
		}
	}
	names := a.employeeNames(ids)
	for i := range rows {
		l := &rows[i]
		emp, typ, from, to, days := names[l.EmployeeID], reportType(l), dval(l.FromDate), dval(l.ToDate), num(l.Days)
		var row []string
		switch key {
		case "out-now":
			row = []string{emp, typ, from, to, days, dval(nextWorkingDay(l.ToDate, a))}
		case "pending":
			who := "HR"
			if l.ApproverEmployeeID != nil {
				who = names[*l.ApproverEmployeeID]
			}
			row = []string{emp, typ, from, to, days, who, dval(l.CreatedAt)}
		case "upcoming":
			row = []string{emp, typ, from, to, days}
		case "sick-no-note":
			row = []string{emp, from, to, days, strings.ToUpper(l.Status[:1]) + l.Status[1:]}
		case "training":
			row = []string{emp, l.TrainingTitle, l.TrainingProvider, from, to, days, strings.ToUpper(l.Status[:1]) + l.Status[1:]}
		case "audit":
			on := ""
			if l.DecidedAt != nil {
				on = l.DecidedAt.Format("2006-01-02 15:04")
			}
			by := l.DecidedByName
			if l.Status == models.LeaveCancelled && by == "" {
				by = "Employee"
			}
			row = []string{emp, typ, from, to, days, strings.ToUpper(l.Status[:1]) + l.Status[1:], by, on, l.Comment}
		}
		rep.Rows = append(rep.Rows, row)
	}
	return rep, nil
}

func nextWorkingDay(last time.Time, a *App) time.Time {
	hol, _ := a.holidayFunc()
	d := last.AddDate(0, 0, 1)
	for i := 0; i < 20 && (policy.IsWeekend(d) || (hol != nil && hol(d))); i++ {
		d = d.AddDate(0, 0, 1)
	}
	return d
}

func (a *App) leaveReport(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	key := r.PathValue("name")
	rep, err := a.leaveReportFor(key)
	if err != nil {
		return err
	}
	if r.URL.Query().Get("format") == "csv" {
		audit.Log(a.DB, act, clientIP(r), "export", "leave_report", key, rep.Title+" exported")
		writeCSV(w, "leave-"+key+".csv", append([][]string{rep.Columns}, rep.Rows...))
		return nil
	}
	httpx.JSON(w, http.StatusOK, rep)
	return nil
}

// leaveReportList lists the available reports.
func (a *App) leaveReportList(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	out := []map[string]string{}
	for _, k := range []string{"pending", "upcoming", "out-now", "audit", "training", "balances", "sick-no-note"} {
		out = append(out, map[string]string{"key": k, "title": leaveReportTitles[k]})
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

// reportType labels a request in a report; training shows its title.
func reportType(l *models.LeaveRequest) string {
	if l.Type == models.LeaveTraining && l.TrainingTitle != "" {
		return "Training: " + l.TrainingTitle
	}
	return models.LeaveTypeLabel(l.Type)
}

// emailReport sends a report to the person who asks, as a file that opens in Excel.
func (a *App) emailReport(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	key := r.PathValue("name")
	rep, err := a.leaveReportFor(key)
	if err != nil {
		return err
	}
	if !a.Mail.Enabled() {
		return httpx.NewError(http.StatusServiceUnavailable, "email is not set up on this server yet. Use Download instead, or ask IT to configure SMTP.")
	}
	if act.Email == "" {
		return httpx.BadRequest("your account has no email address")
	}
	body := fmt.Sprintf("Hello %s,\r\n\r\nAttached is the report \"%s\" as you requested, with %d rows. It opens in Excel.\r\n\r\nSIBK HR Management System", act.Name, rep.Title, len(rep.Rows))
	err = a.Mail.Send([]string{act.Email}, "Leave report: "+rep.Title, body,
		&mail.Attachment{Name: "leave-" + key + ".csv", ContentType: "text/csv; charset=utf-8", Data: csvBytes(append([][]string{rep.Columns}, rep.Rows...))})
	if err != nil {
		return httpx.NewError(http.StatusBadGateway, "the email could not be sent. Please try again or use Download.")
	}
	audit.Log(a.DB, act, clientIP(r), "export", "leave_report", key, rep.Title+" emailed to the requester")
	httpx.JSON(w, http.StatusOK, map[string]string{"sentTo": act.Email})
	return nil
}

// StaffLeave is one row of the Staff & Leave list.
type StaffLeave struct {
	EmployeeID   uint    `json:"employeeId"`
	FullName     string  `json:"fullName"`
	JobTitle     string  `json:"jobTitle"`
	ManagerName  string  `json:"managerName"`
	Taken        float64 `json:"takenDays"`
	Remaining    float64 `json:"remainingDays"`
	Pending      float64 `json:"pendingDays"`
	OutNow       bool    `json:"outNow"`
	OutNowReason string  `json:"outNowReason,omitempty"`
}

func (a *App) staffLeave(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var emps []models.Employee
	if err := a.DB.Where("status <> ?", models.StatusExited).Order("first_name, last_name").Find(&emps).Error; err != nil {
		return err
	}
	var ids []uint
	for _, e := range emps {
		if e.ManagerID != nil {
			ids = append(ids, *e.ManagerID)
		}
	}
	names := a.employeeNames(ids)
	type pend struct {
		EmployeeID uint
		Total      float64
	}
	var ps []pend
	a.DB.Model(&models.LeaveRequest{}).Select("employee_id, COALESCE(SUM(days),0) AS total").
		Where("type = ? AND status = ?", models.LeaveAnnual, models.LeavePending).Group("employee_id").Scan(&ps)
	pending := map[uint]float64{}
	for _, p := range ps {
		pending[p.EmployeeID] = p.Total
	}
	today := policy.Today()
	var out []models.LeaveRequest
	a.DB.Where("status = ? AND from_date <= ? AND to_date >= ?", models.LeaveApproved, today, today).Find(&out)
	away := map[uint]string{}
	for i := range out {
		away[out[i].EmployeeID] = models.LeaveTypeLabel(out[i].Type)
	}
	res := make([]StaffLeave, 0, len(emps))
	for i := range emps {
		e := &emps[i]
		mgr := ""
		if e.ManagerID != nil {
			mgr = names[*e.ManagerID]
		}
		why, isOut := away[e.ID]
		res = append(res, StaffLeave{e.ID, e.FullName(), e.JobTitle, mgr, e.LeaveTakenDays,
			e.LeaveAccruedDays + e.LeaveCarriedForward - e.LeaveTakenDays, pending[e.ID], isOut, why})
	}
	httpx.JSON(w, http.StatusOK, res)
	return nil
}
