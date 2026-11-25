// Package handlers contains the HTTP API. Routes are registered in Routes.
package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"sibk-hrms/backend/internal/auth"
	"sibk-hrms/backend/internal/config"
	"sibk-hrms/backend/internal/httpx"
	"sibk-hrms/backend/internal/mail"
	"sibk-hrms/backend/internal/models"
	"sibk-hrms/backend/internal/policy"
	"sibk-hrms/backend/internal/storage"
)

const (
	tokenTTL     = 12 * time.Hour
	maxDocBytes  = 10 << 20
	maxPhotoSize = 2 << 20
)

// App holds the dependencies shared by every handler.
type App struct {
	DB      *gorm.DB
	Cfg     config.Config
	Store   storage.Store
	Mail    *mail.Mailer
	Limiter *auth.Limiter
}

// New creates an App.
func New(db *gorm.DB, cfg config.Config, store storage.Store) *App {
	m := mail.New(mail.Config{Host: cfg.SMTPHost, Port: cfg.SMTPPort, User: cfg.SMTPUser, Pass: cfg.SMTPPass, Auth: cfg.SMTPAuth, From: cfg.MailFrom, FromName: cfg.MailFromName})
	return &App{DB: db, Cfg: cfg, Store: store, Mail: m, Limiter: auth.NewLimiter(5, 15*time.Minute)}
}

type handlerFunc func(w http.ResponseWriter, r *http.Request, act *auth.Actor) error

var anyRole []string

var (
	hrRoles    = []string{models.RoleHRAdmin, models.RoleHROfficer}
	hrOrMgr    = []string{models.RoleHRAdmin, models.RoleHROfficer, models.RoleManager}
	adminRoles = []string{models.RoleHRAdmin}
)

// wrap authenticates the caller (re-reading the user so deactivation takes effect at once),
// checks the role and renders any returned error.
func (a *App) wrap(fn handlerFunc, roles []string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		act, err := a.authenticate(r)
		if err == nil && len(roles) > 0 && !act.HasRole(roles...) {
			err = httpx.Forbidden()
		}
		if err == nil {
			err = fn(w, r, act)
		}
		if err != nil {
			httpx.WriteError(w, err)
		}
	}
}

func (a *App) authenticate(r *http.Request) (*auth.Actor, error) {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return nil, httpx.Unauthorized("sign in to continue")
	}
	uid, err := auth.Verify(a.Cfg.JWTSecret, strings.TrimSpace(h[7:]))
	if err != nil {
		return nil, httpx.Unauthorized("your session has expired, please sign in again")
	}
	var u models.User
	if err := a.DB.First(&u, uid).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, httpx.Unauthorized("your session has expired, please sign in again")
		}
		return nil, err
	}
	if !u.Active {
		return nil, httpx.Unauthorized("this account has been deactivated")
	}
	if u.MustChangePassword && r.URL.Path != "/api/auth/change-password" && r.URL.Path != "/api/auth/me" {
		return nil, httpx.NewError(http.StatusForbidden, "you must change your password before continuing")
	}
	return &auth.Actor{UserID: u.ID, Name: u.Name, Email: u.Email, Role: u.Role, EmployeeID: u.EmployeeID}, nil
}

// Routes registers every endpoint on a new mux.
func (a *App) Routes() *http.ServeMux {
	m := http.NewServeMux()
	route := func(pattern string, fn handlerFunc, roles []string) { m.HandleFunc(pattern, a.wrap(fn, roles)) }

	m.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		sqlDB, err := a.DB.DB()
		if err != nil || sqlDB.Ping() != nil {
			httpx.JSON(w, http.StatusServiceUnavailable, map[string]string{"status": "database unavailable"})
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	m.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		if err := a.login(w, r); err != nil {
			httpx.WriteError(w, err)
		}
	})
	route("GET /api/auth/me", a.me, anyRole)
	route("POST /api/auth/change-password", a.changePassword, anyRole)
	route("GET /api/reference", a.reference, anyRole)

	route("GET /api/departments", a.listDepartments, anyRole)
	route("POST /api/departments", a.createDepartment, hrRoles)
	route("PUT /api/departments/{id}", a.updateDepartment, hrRoles)
	route("DELETE /api/departments/{id}", a.deleteDepartment, hrRoles)

	route("GET /api/employees", a.listEmployees, hrOrMgr)
	route("POST /api/employees", a.createEmployee, hrRoles)
	route("GET /api/employees/{id}", a.getEmployee, anyRole)
	route("PUT /api/employees/{id}", a.updateEmployee, hrRoles)
	route("POST /api/employees/{id}/photo", a.uploadPhoto, anyRole)
	route("GET /api/employees/{id}/photo", a.getPhoto, anyRole)
	route("GET /api/employees/{id}/documents/checklist", a.employeeChecklist, anyRole)
	route("GET /api/employees/{id}/documents", a.employeeDocuments, anyRole)
	route("POST /api/employees/{id}/documents", a.uploadEmployeeDocument, anyRole)
	route("GET /api/employees/{id}/tasks", a.employeeTasks, anyRole)
	route("GET /api/employees/{id}/direct-reports", a.directReports, anyRole)
	route("POST /api/employees/{id}/onboarding/start", a.startOnboarding, hrRoles)
	route("POST /api/employees/{id}/offboarding/start", a.startOffboarding, hrRoles)

	route("GET /api/employees/{id}/leave", a.employeeLeave, anyRole)
	route("POST /api/employees/{id}/leave", a.recordLeaveFor, hrRoles)
	route("PUT /api/employees/{id}/leave-balance", a.updateLeaveBalance, hrRoles)

	route("GET /api/me/leave", a.myLeave, anyRole)
	route("POST /api/me/leave", a.applyLeave, anyRole)
	route("GET /api/leave", a.listLeave, hrRoles)
	route("GET /api/leave/calc", a.calcDays, anyRole)
	route("GET /api/leave/approvals", a.leaveApprovals, anyRole)
	route("GET /api/leave-reports", a.leaveReportList, hrRoles)
	route("GET /api/leave-reports/{name}", a.leaveReport, hrRoles)
	route("POST /api/leave-reports/{name}/email", a.emailReport, hrRoles)
	route("GET /api/leave/staff", a.staffLeave, hrRoles)
	route("POST /api/leave/year-end", a.yearEnd, adminRoles)
	route("POST /api/leave/{id}/decide", a.decideLeave, anyRole)
	route("POST /api/leave/{id}/cancel", a.cancelLeave, anyRole)
	route("POST /api/leave/{id}/attachment", a.attachLeaveNote, anyRole)
	route("GET /api/leave/{id}/attachment", a.downloadLeaveNote, anyRole)
	route("GET /api/holidays", a.listHolidays, anyRole)
	route("POST /api/holidays", a.createHoliday, hrRoles)
	route("DELETE /api/holidays/{id}", a.deleteHoliday, hrRoles)

	route("GET /api/me/dashboard", a.meDashboard, anyRole)
	route("GET /api/me/profile", a.meProfile, anyRole)
	route("PUT /api/me/profile", a.updateMeProfile, anyRole)
	route("GET /api/me/documents", a.meChecklist, anyRole)
	route("POST /api/me/documents", a.uploadMeDocument, anyRole)
	route("GET /api/me/change-requests", a.myChangeRequests, anyRole)
	route("POST /api/me/change-requests", a.createChangeRequest, anyRole)

	route("GET /api/documents", a.listDocuments, hrRoles)
	route("POST /api/documents/{id}/verify", a.verifyDocument, hrRoles)
	route("POST /api/documents/{id}/reject", a.rejectDocument, hrRoles)
	route("GET /api/documents/{id}/download", a.downloadDocument, anyRole)
	route("DELETE /api/documents/{id}", a.deleteDocument, anyRole)

	route("GET /api/jobs", a.listJobs, hrRoles)
	route("POST /api/jobs", a.createJob, hrRoles)
	route("PUT /api/jobs/{id}", a.updateJob, hrRoles)
	route("GET /api/applicants", a.listApplicants, hrRoles)
	route("POST /api/applicants", a.createApplicant, hrRoles)
	route("PUT /api/applicants/{id}", a.updateApplicant, hrRoles)
	route("POST /api/applicants/{id}/stage", a.applicantStage, hrRoles)
	route("POST /api/applicants/{id}/hire", a.hireApplicant, hrRoles)
	route("GET /api/applicants/{id}/cv", a.applicantCV, hrRoles)
	route("GET /api/applicants/{id}/interviews", a.listInterviews, hrRoles)
	route("POST /api/applicants/{id}/interviews", a.createInterview, hrRoles)

	route("GET /api/task-templates", a.listTemplates, hrRoles)
	route("POST /api/task-templates", a.createTemplate, hrRoles)
	route("PUT /api/task-templates/{id}", a.updateTemplate, hrRoles)
	route("DELETE /api/task-templates/{id}", a.deleteTemplate, hrRoles)
	route("GET /api/tasks", a.listTasks, hrOrMgr)
	route("PUT /api/tasks/{id}", a.updateTask, hrOrMgr)

	route("GET /api/change-requests", a.listChangeRequests, hrRoles)
	route("POST /api/change-requests/{id}/decide", a.decideChangeRequest, hrRoles)

	route("GET /api/announcements", a.listAnnouncements, anyRole)
	route("POST /api/announcements", a.createAnnouncement, hrRoles)
	route("DELETE /api/announcements/{id}", a.deleteAnnouncement, hrRoles)
	route("GET /api/policies", a.listPolicies, anyRole)
	route("POST /api/policies", a.createPolicy, hrRoles)
	route("GET /api/policies/{id}/download", a.downloadPolicy, anyRole)

	route("GET /api/dashboard", a.dashboard, hrRoles)
	route("GET /api/reports/employees.csv", a.reportEmployees, hrRoles)
	route("GET /api/reports/documents-compliance.csv", a.reportCompliance, hrRoles)
	route("GET /api/reports/headcount.csv", a.reportHeadcount, hrRoles)

	route("GET /api/users", a.listUsers, adminRoles)
	route("POST /api/users", a.createUser, adminRoles)
	route("PUT /api/users/{id}", a.updateUser, adminRoles)
	route("POST /api/users/{id}/reset-password", a.resetPassword, adminRoles)
	route("GET /api/audit", a.listAudit, adminRoles)
	return m
}

// ---- shared helpers ----

type fieldErrs map[string]string

func (f fieldErrs) err() error {
	if len(f) > 0 {
		return httpx.Invalid(f)
	}
	return nil
}

func pathID(r *http.Request) (uint, error) {
	n, err := strconv.ParseUint(r.PathValue("id"), 10, 64)
	if err != nil || n == 0 {
		return 0, httpx.NotFound("record")
	}
	return uint(n), nil
}

func notFound(err error, what string) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return httpx.NotFound(what)
	}
	return err
}

func dstr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := policy.FormatDate(*t)
	return &s
}

func dval(t time.Time) string { return policy.FormatDate(t) }

// parseDate parses an optional date string. An empty string yields nil.
func parseDate(s string) (*time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	t, err := policy.ParseDate(s)
	if err != nil {
		return nil, errors.New("must be a date in YYYY-MM-DD format")
	}
	return &t, nil
}

func trim(s string) string { return strings.TrimSpace(s) }

func validEmail(s string) bool {
	at := strings.Index(s, "@")
	return at > 0 && at < len(s)-3 && strings.Contains(s[at:], ".") && !strings.ContainsAny(s, " ,;")
}

func clientIP(r *http.Request) string { return httpx.ClientIP(r) }

func ptrUint(v uint) *uint { return &v }

// actorEmployee loads the actor's own employee record.
func (a *App) actorEmployee(act *auth.Actor) (*models.Employee, error) {
	if act.EmployeeID == nil {
		return nil, httpx.NewError(http.StatusConflict, "your account is not linked to an employee record")
	}
	var e models.Employee
	if err := a.DB.First(&e, *act.EmployeeID).Error; err != nil {
		return nil, notFound(err, "employee")
	}
	return &e, nil
}

// teamIDs returns the ids of the actor's direct reports.
func (a *App) teamIDs(act *auth.Actor) ([]uint, error) {
	if act.EmployeeID == nil {
		return nil, nil
	}
	var ids []uint
	err := a.DB.Model(&models.Employee{}).Where("manager_id = ?", *act.EmployeeID).Pluck("id", &ids).Error
	return ids, err
}

// canView reports whether the actor may see the employee record.
func (a *App) canView(act *auth.Actor, e *models.Employee) bool {
	if act.IsHR() || act.IsEmployee(e.ID) {
		return true
	}
	return act.Role == models.RoleManager && act.EmployeeID != nil && e.ManagerID != nil && *e.ManagerID == *act.EmployeeID
}

// loadViewable loads an employee by the {id} path value and checks access.
func (a *App) loadViewable(r *http.Request, act *auth.Actor) (*models.Employee, error) {
	id, err := pathID(r)
	if err != nil {
		return nil, err
	}
	var e models.Employee
	if err := a.DB.First(&e, id).Error; err != nil {
		return nil, notFound(err, "employee")
	}
	if !a.canView(act, &e) {
		return nil, httpx.Forbidden()
	}
	return &e, nil
}

func (a *App) employeeNames(ids []uint) map[uint]string {
	out := map[uint]string{}
	if len(ids) == 0 {
		return out
	}
	var emps []models.Employee
	a.DB.Select("id", "first_name", "last_name").Where("id IN ?", ids).Find(&emps)
	for i := range emps {
		out[emps[i].ID] = emps[i].FullName()
	}
	return out
}
