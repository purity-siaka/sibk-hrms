package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"sibk-hrms/backend/internal/audit"
	"sibk-hrms/backend/internal/auth"
	"sibk-hrms/backend/internal/httpx"
	"sibk-hrms/backend/internal/models"
	"sibk-hrms/backend/internal/policy"
)

// ---- who may see what ----

// reportScope says whose leave the caller may report on. HR sees everyone; a manager sees only
// the people who report to them. It is the single place that scoping is decided, so the staff
// list, every report and the exports always agree.
type reportScope struct {
	all bool
	ids []uint
}

func (a *App) scopeFor(act *auth.Actor) (reportScope, error) {
	if act.IsHR() {
		return reportScope{all: true}, nil
	}
	if act.EmployeeID == nil {
		return reportScope{}, httpx.Forbidden()
	}
	var ids []uint
	if err := a.DB.Model(&models.Employee{}).Where("manager_id = ? AND status <> ?", *act.EmployeeID, models.StatusExited).Pluck("id", &ids).Error; err != nil {
		return reportScope{}, err
	}
	if len(ids) == 0 {
		return reportScope{}, httpx.Forbidden()
	}
	return reportScope{ids: ids}, nil
}

func (s reportScope) has(id uint) bool {
	if s.all {
		return true
	}
	for _, v := range s.ids {
		if v == id {
			return true
		}
	}
	return false
}

// ---- staff and leave: one row per person, all derived from the same data ----

// StaffLeave is one row of Staff & Leave and of the balances report.
type StaffLeave struct {
	EmployeeID      uint    `json:"employeeId"`
	FullName        string  `json:"fullName"`
	JobTitle        string  `json:"jobTitle"`
	ManagerName     string  `json:"managerName"`
	BroughtForward  float64 `json:"broughtForwardDays"`
	Accrued         float64 `json:"accruedDays"`
	Taken           float64 `json:"takenDays"`
	Remaining       float64 `json:"remainingDays"`
	SickDays        float64 `json:"sickDays"`
	TrainingDays    float64 `json:"trainingDays"`
	OtherDays       float64 `json:"otherDays"`
	PendingRequests int     `json:"pendingRequests"`
	PendingDays     float64 `json:"pendingDays"`
	OutNow          bool    `json:"outNow"`
	OutNowReason    string  `json:"outNowReason,omitempty"`
	// CarriedForward is what will move into next year: the annual-leave days not taken.
	CarriedForward float64 `json:"carriedForwardDays"`
}

func (a *App) staffRows(s reportScope) ([]StaffLeave, error) {
	q := a.DB.Where("status <> ?", models.StatusExited).Order("first_name, last_name")
	if !s.all {
		q = q.Where("id IN ?", s.ids)
	}
	var emps []models.Employee
	if err := q.Find(&emps).Error; err != nil {
		return nil, err
	}
	var mgrIDs []uint
	for _, e := range emps {
		if e.ManagerID != nil {
			mgrIDs = append(mgrIDs, *e.ManagerID)
		}
	}
	names := a.employeeNames(mgrIDs)

	today := policy.Today()
	yearStart := time.Date(today.Year(), 1, 1, 0, 0, 0, 0, today.Location())
	var reqs []models.LeaveRequest
	rq := a.DB.Where("status IN ? AND to_date >= ?", []string{models.LeavePending, models.LeaveApproved}, yearStart)
	if !s.all {
		rq = rq.Where("employee_id IN ?", s.ids)
	}
	if err := rq.Find(&reqs).Error; err != nil {
		return nil, err
	}
	type agg struct {
		sick, training, other, pendDays float64
		pend                            int
		away                            string
	}
	by := map[uint]*agg{}
	for i := range reqs {
		l := &reqs[i]
		g := by[l.EmployeeID]
		if g == nil {
			g = &agg{}
			by[l.EmployeeID] = g
		}
		switch l.Status {
		case models.LeavePending:
			g.pend++
			g.pendDays += l.Days
		case models.LeaveApproved:
			if l.FromDate.Year() == today.Year() {
				switch l.Type {
				case models.LeaveSick:
					g.sick += l.Days
				case models.LeaveTraining:
					g.training += l.Days
				case models.LeaveAnnual:
				default:
					g.other += l.Days
				}
			}
			if !l.FromDate.After(today) && !l.ToDate.Before(today) {
				g.away = models.LeaveTypeLabel(l.Type)
			}
		}
	}
	res := make([]StaffLeave, 0, len(emps))
	for i := range emps {
		e := &emps[i]
		g := by[e.ID]
		if g == nil {
			g = &agg{}
		}
		mgr := ""
		if e.ManagerID != nil {
			mgr = names[*e.ManagerID]
		}
		rem := e.LeaveAccruedDays + e.LeaveCarriedForward - e.LeaveTakenDays
		cf := rem
		if cf < 0 {
			cf = 0
		}
		res = append(res, StaffLeave{
			EmployeeID: e.ID, FullName: e.FullName(), JobTitle: e.JobTitle, ManagerName: mgr,
			BroughtForward: e.LeaveCarriedForward, Accrued: e.LeaveAccruedDays, Taken: e.LeaveTakenDays, Remaining: rem,
			SickDays: g.sick, TrainingDays: g.training, OtherDays: g.other,
			PendingRequests: g.pend, PendingDays: g.pendDays, OutNow: g.away != "", OutNowReason: g.away,
			CarriedForward: cf,
		})
	}
	return res, nil
}

func (a *App) staffLeave(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	s, err := a.scopeFor(act)
	if err != nil {
		return err
	}
	rows, err := a.staffRows(s)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, rows)
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
	"full": "Full leave report", "out-now": "Who's out now", "pending": "Pending approvals", "upcoming": "Upcoming leave (90 days)",
	"balances": "Leave balances", "sick-no-note": "Sick leave without note", "audit": "Approval audit trail", "training": "Training applications",
}

// Reports in display order; managers get the simpler subset for their team.
var (
	hrReportKeys      = []string{"full", "pending", "upcoming", "out-now", "balances", "audit", "training", "sick-no-note"}
	managerReportKeys = []string{"full", "pending", "upcoming", "out-now", "balances"}
)

func reportAllowed(act *auth.Actor, key string) bool {
	keys := managerReportKeys
	if act.IsHR() {
		keys = hrReportKeys
	}
	for _, k := range keys {
		if k == key {
			return true
		}
	}
	return false
}

func capital(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func (a *App) leaveReportFor(key string, s reportScope) (*leaveReport, error) {
	title, ok := leaveReportTitles[key]
	if !ok {
		return nil, httpx.NotFound("report")
	}
	rep := &leaveReport{Key: key, Title: title, Rows: [][]string{}}
	today := policy.Today()
	if key == "balances" {
		staff, err := a.staffRows(s)
		if err != nil {
			return nil, err
		}
		rep.Columns = []string{"Employee", "Position", "Manager", "Brought forward", "Accrued", "Annual taken", "Annual remaining",
			"Sick days", "Training days", "Other leave days", "Pending days", "Carried forward to " + strconv.Itoa(today.Year()+1)}
		for _, x := range staff {
			rep.Rows = append(rep.Rows, []string{x.FullName, x.JobTitle, x.ManagerName, num(x.BroughtForward), num(x.Accrued), num(x.Taken), num(x.Remaining),
				num(x.SickDays), num(x.TrainingDays), num(x.OtherDays), num(x.PendingDays), num(x.CarriedForward)})
		}
		return rep, nil
	}
	q := a.DB.Model(&models.LeaveRequest{})
	if !s.all {
		q = q.Where("employee_id IN ?", s.ids)
	}
	switch key {
	case "full":
		q = q.Order("from_date DESC, id DESC")
		rep.Columns = []string{"Employee", "Position", "Manager", "Type", "From", "To", "Days", "Status", "Employee's reason",
			"Decided by", "Manager's comment", "Decided on", "Requested on", "Days left before request"}
	case "out-now":
		q = q.Where("status = ? AND from_date <= ? AND to_date >= ?", models.LeaveApproved, today, today).Order("to_date, id")
		rep.Columns = []string{"Employee", "Type", "From", "To", "Days", "Back on"}
	case "pending":
		q = q.Where("status = ?", models.LeavePending).Order("from_date, id")
		rep.Columns = []string{"Employee", "Type", "From", "To", "Days", "Employee's reason", "Waiting for", "Requested on"}
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
		rep.Columns = []string{"Employee", "Type", "From", "To", "Days", "Outcome", "Decided by", "Decided on", "Manager's comment", "Employee's reason"}
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
	// position and manager per employee, for the full report
	type who struct{ title, mgr string }
	info := map[uint]who{}
	if key == "full" && len(ids) > 0 {
		var emps []models.Employee
		a.DB.Select("id", "job_title", "manager_id").Where("id IN ?", ids).Find(&emps)
		var mids []uint
		for _, e := range emps {
			if e.ManagerID != nil {
				mids = append(mids, *e.ManagerID)
			}
		}
		mn := a.employeeNames(mids)
		for _, e := range emps {
			w := who{title: e.JobTitle}
			if e.ManagerID != nil {
				w.mgr = mn[*e.ManagerID]
			}
			info[e.ID] = w
		}
	}
	dt := func(t *time.Time) string {
		if t == nil {
			return ""
		}
		return t.Format("2006-01-02 15:04")
	}
	for i := range rows {
		l := &rows[i]
		emp, typ, from, to, days := names[l.EmployeeID], reportType(l), dval(l.FromDate), dval(l.ToDate), num(l.Days)
		waiting := "HR"
		if l.ApproverEmployeeID != nil {
			waiting = names[*l.ApproverEmployeeID]
		}
		by := l.DecidedByName
		if l.Status == models.LeaveCancelled && by == "" {
			by = "Employee"
		}
		var row []string
		switch key {
		case "full":
			left := ""
			if l.Type == models.LeaveAnnual {
				left = num(l.DaysRemainingAtRequest)
			}
			row = []string{emp, info[l.EmployeeID].title, info[l.EmployeeID].mgr, typ, from, to, days, capital(l.Status), l.Reason,
				by, l.Comment, dt(l.DecidedAt), dval(l.CreatedAt), left}
		case "out-now":
			row = []string{emp, typ, from, to, days, dval(nextWorkingDay(l.ToDate, a))}
		case "pending":
			row = []string{emp, typ, from, to, days, l.Reason, waiting, dval(l.CreatedAt)}
		case "upcoming":
			row = []string{emp, typ, from, to, days}
		case "sick-no-note":
			row = []string{emp, from, to, days, capital(l.Status)}
		case "training":
			row = []string{emp, l.TrainingTitle, l.TrainingProvider, from, to, days, capital(l.Status)}
		case "audit":
			row = []string{emp, typ, from, to, days, capital(l.Status), by, dt(l.DecidedAt), l.Comment, l.Reason}
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

// leaveReport returns a report as JSON, or as an Excel workbook with ?format=xlsx (?format=csv also works).
func (a *App) leaveReport(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	key := r.PathValue("name")
	s, err := a.scopeFor(act)
	if err != nil {
		return err
	}
	if !reportAllowed(act, key) {
		return httpx.NotFound("report")
	}
	rep, err := a.leaveReportFor(key, s)
	if err != nil {
		return err
	}
	switch r.URL.Query().Get("format") {
	case "xlsx":
		audit.Log(a.DB, act, clientIP(r), "export", "leave_report", key, rep.Title+" exported to Excel")
		writeXLSX(w, "leave-"+key+".xlsx", rep.Title, append([][]string{rep.Columns}, rep.Rows...))
	case "csv":
		audit.Log(a.DB, act, clientIP(r), "export", "leave_report", key, rep.Title+" exported")
		writeCSV(w, "leave-"+key+".csv", append([][]string{rep.Columns}, rep.Rows...))
	default:
		httpx.JSON(w, http.StatusOK, rep)
	}
	return nil
}

// leaveReportList lists the reports the caller may open.
func (a *App) leaveReportList(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	if _, err := a.scopeFor(act); err != nil {
		return err
	}
	keys := managerReportKeys
	if act.IsHR() {
		keys = hrReportKeys
	}
	out := []map[string]string{}
	for _, k := range keys {
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
