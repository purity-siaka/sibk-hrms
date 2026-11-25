package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"strings"

	"sibk-hrms/backend/internal/audit"
	"sibk-hrms/backend/internal/auth"
	"sibk-hrms/backend/internal/httpx"
	"sibk-hrms/backend/internal/models"
	"sibk-hrms/backend/internal/policy"
)

type dateItem struct {
	EmployeeID uint   `json:"employeeId"`
	FullName   string `json:"fullName"`
	Date       string `json:"date"`
	DaysLeft   int    `json:"daysLeft"`
}

func (a *App) dashboard(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	today := policy.Today()
	limit := today.AddDate(0, 0, policy.ExpiryWindowDays)
	count := func(m interface{}, cond string, args ...interface{}) int64 {
		var n int64
		a.DB.Model(m).Where(cond, args...).Count(&n)
		return n
	}
	var current []models.Employee
	if err := a.DB.Where("status <> ?", models.StatusExited).Find(&current).Error; err != nil {
		return err
	}
	var deps []models.Department
	a.DB.Find(&deps)
	depName := map[uint]string{}
	for _, d := range deps {
		depName[d.ID] = d.Name
	}
	byDept := map[string]int{}
	byStatus := map[string]int{}
	var probation, contracts, anniv []dateItem
	for i := range current {
		e := &current[i]
		name := "Unassigned"
		if e.DepartmentID != nil {
			name = depName[*e.DepartmentID]
		}
		byDept[name]++
		byStatus[e.Status]++
		if e.Status == models.StatusProbation && e.ProbationEndDate != nil && !e.ProbationEndDate.After(limit) {
			probation = append(probation, dateItem{e.ID, e.FullName(), dval(*e.ProbationEndDate), policy.DaysBetween(today, *e.ProbationEndDate)})
		}
		if e.ContractEndDate != nil && !e.ContractEndDate.Before(today) && !e.ContractEndDate.After(limit) {
			contracts = append(contracts, dateItem{e.ID, e.FullName(), dval(*e.ContractEndDate), policy.DaysBetween(today, *e.ContractEndDate)})
		}
		if e.StartDate != nil {
			next, years := policy.NextAnniversary(*e.StartDate, today)
			if years > 0 && policy.DaysBetween(today, next) <= policy.AnniversaryWindowDays {
				anniv = append(anniv, dateItem{e.ID, e.FullName(), dval(next), years})
			}
		}
	}
	sortItems := func(s []dateItem) {
		sort.Slice(s, func(i, j int) bool { return s[i].Date < s[j].Date })
	}
	sortItems(probation)
	sortItems(contracts)
	sortItems(anniv)
	type nc struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}
	type sc struct {
		Status string `json:"status"`
		Count  int    `json:"count"`
	}
	dl := []nc{}
	for k, v := range byDept {
		dl = append(dl, nc{k, v})
	}
	sort.Slice(dl, func(i, j int) bool {
		if dl[i].Count != dl[j].Count {
			return dl[i].Count > dl[j].Count
		}
		return dl[i].Name < dl[j].Name
	})
	sl := []sc{}
	for _, s := range models.EmployeeStatuses {
		if s != models.StatusExited && byStatus[s] > 0 {
			sl = append(sl, sc{s, byStatus[s]})
		}
	}
	missing, err := a.employeesMissingDocs(current)
	if err != nil {
		return err
	}
	var recent []models.Document
	a.DB.Order("uploaded_at DESC").Limit(6).Find(&recent)
	openStatuses := []string{models.TaskPending, models.TaskInProgress}
	var overdue int64
	a.DB.Model(&models.Task{}).Where("status IN ? AND due_date < ?", openStatuses, today).Count(&overdue)
	httpx.JSON(w, http.StatusOK, map[string]interface{}{
		"headcount": len(current), "byDepartment": dl, "byStatus": sl,
		"pendingDocuments":          count(&models.Document{}, "status = ?", models.DocPending),
		"employeesMissingDocuments": missing,
		"expiringDocuments":         count(&models.Document{}, "expiry_date IS NOT NULL AND expiry_date <= ?", limit),
		"probationEnding":           nonNil(probation), "contractsEnding": nonNil(contracts),
		"openJobs":              count(&models.Job{}, "status = ?", models.JobOpen),
		"activeApplicants":      count(&models.Applicant{}, "stage NOT IN ?", []string{models.StageHired, models.StageRejected}),
		"pendingChangeRequests": count(&models.ChangeRequest{}, "status = ?", models.ReqPending),
		"openTasks":             count(&models.Task{}, "status IN ?", openStatuses),
		"overdueTasks":          overdue,
		"recentUploads":         a.documentViews(recent),
		"anniversaries":         nonNil(anniv),
	})
	return nil
}

func nonNil(s []dateItem) []dateItem {
	if s == nil {
		return []dateItem{}
	}
	return s
}

// employeesMissingDocs counts current employees that lack an accepted upload for any required document type.
func (a *App) employeesMissingDocs(current []models.Employee) (int, error) {
	var docs []models.Document
	if err := a.DB.Select("employee_id", "type").Where("status <> ? AND type IN ?", models.DocRejected, models.RequiredDocKeys()).Find(&docs).Error; err != nil {
		return 0, err
	}
	have := map[uint]map[string]bool{}
	for _, d := range docs {
		if have[d.EmployeeID] == nil {
			have[d.EmployeeID] = map[string]bool{}
		}
		have[d.EmployeeID][d.Type] = true
	}
	need := len(models.RequiredDocKeys())
	n := 0
	for _, e := range current {
		if len(have[e.ID]) < need {
			n++
		}
	}
	return n, nil
}

// ---- CSV reports ----

func csvBytes(rows [][]string) []byte {
	var b strings.Builder
	b.WriteString("\xef\xbb\xbf")
	for _, row := range rows {
		cells := make([]string, len(row))
		for i, c := range row {
			cells[i] = httpx.CSVEscape(c)
		}
		b.WriteString(strings.Join(cells, ","))
		b.WriteString("\r\n")
	}
	return []byte(b.String())
}

func writeCSV(w http.ResponseWriter, filename string, rows [][]string) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename="+filename)
	_, _ = w.Write(csvBytes(rows))
}

func sv(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func (a *App) reportEmployees(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var emps []models.Employee
	if err := a.DB.Order("employee_no").Find(&emps).Error; err != nil {
		return err
	}
	views := a.employeeViews(emps, true, nil)
	rows := [][]string{{"Employee No", "Name", "Email", "Phone", "Job Title", "Department", "Manager", "Status", "Employment Type", "Start Date", "Probation End", "Contract End", "Exit Date"}}
	for _, v := range views {
		rows = append(rows, []string{v.EmployeeNo, v.FullName, v.Email, v.Phone, v.JobTitle, v.DepartmentName, v.ManagerName, v.Status,
			v.EmploymentType, sv(v.StartDate), sv(v.ProbationEndDate), sv(v.ContractEndDate), sv(v.ExitDate)})
	}
	audit.Log(a.DB, act, clientIP(r), "report_export", "report", "employees", fmt.Sprintf("%d rows", len(views)))
	writeCSV(w, "employees.csv", rows)
	return nil
}

func (a *App) reportCompliance(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var emps []models.Employee
	if err := a.DB.Where("status <> ?", models.StatusExited).Order("employee_no").Find(&emps).Error; err != nil {
		return err
	}
	var docs []models.Document
	if err := a.DB.Order("uploaded_at DESC, id DESC").Find(&docs).Error; err != nil {
		return err
	}
	latest := map[uint]map[string]string{}
	for _, d := range docs {
		if latest[d.EmployeeID] == nil {
			latest[d.EmployeeID] = map[string]string{}
		}
		if _, ok := latest[d.EmployeeID][d.Type]; !ok {
			latest[d.EmployeeID][d.Type] = d.Status
		}
	}
	header := []string{"Employee No", "Name"}
	var keys []string
	for _, t := range models.DocumentTypes {
		if t.Required {
			header = append(header, t.Label)
			keys = append(keys, t.Key)
		}
	}
	header = append(header, "Complete")
	rows := [][]string{header}
	for _, e := range emps {
		row := []string{e.EmployeeNo, e.FullName()}
		complete := true
		for _, k := range keys {
			st := latest[e.ID][k]
			if st == "" {
				st = "missing"
			}
			if st != models.DocVerified {
				complete = false
			}
			row = append(row, st)
		}
		c := "No"
		if complete {
			c = "Yes"
		}
		rows = append(rows, append(row, c))
	}
	audit.Log(a.DB, act, clientIP(r), "report_export", "report", "documents-compliance", fmt.Sprintf("%d rows", len(emps)))
	writeCSV(w, "documents-compliance.csv", rows)
	return nil
}

func (a *App) reportHeadcount(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var deps []models.Department
	a.DB.Order("name").Find(&deps)
	var emps []models.Employee
	if err := a.DB.Where("status <> ?", models.StatusExited).Find(&emps).Error; err != nil {
		return err
	}
	type tally struct{ total, probation, active, notice int }
	by := map[uint]*tally{}
	var unassigned tally
	for _, e := range emps {
		t := &unassigned
		if e.DepartmentID != nil {
			if by[*e.DepartmentID] == nil {
				by[*e.DepartmentID] = &tally{}
			}
			t = by[*e.DepartmentID]
		}
		t.total++
		switch e.Status {
		case models.StatusProbation:
			t.probation++
		case models.StatusActive:
			t.active++
		case models.StatusOnNotice:
			t.notice++
		}
	}
	rows := [][]string{{"Department", "Headcount", "On Probation", "Active", "On Notice"}}
	add := func(name string, t tally) {
		rows = append(rows, []string{name, fmt.Sprint(t.total), fmt.Sprint(t.probation), fmt.Sprint(t.active), fmt.Sprint(t.notice)})
	}
	for _, d := range deps {
		if t := by[d.ID]; t != nil {
			add(d.Name, *t)
		} else {
			add(d.Name, tally{})
		}
	}
	if unassigned.total > 0 {
		add("Unassigned", unassigned)
	}
	audit.Log(a.DB, act, clientIP(r), "report_export", "report", "headcount", "headcount by department")
	writeCSV(w, "headcount.csv", rows)
	return nil
}
