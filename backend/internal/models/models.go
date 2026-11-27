// Package models holds the GORM models. Table and column names are explicit where raw SQL refers to them.
package models

import "time"

// Roles.
const (
	RoleHRAdmin   = "hr_admin"
	RoleHROfficer = "hr_officer"
	RoleManager   = "manager"
	RoleEmployee  = "employee"
)

// Roles lists every valid role.
var Roles = []string{RoleHRAdmin, RoleHROfficer, RoleManager, RoleEmployee}

// ValidRole reports whether r is a known role.
func ValidRole(r string) bool { return contains(Roles, r) }

// Employee statuses.
const (
	StatusProbation = "probation"
	StatusActive    = "active"
	StatusOnNotice  = "on_notice"
	StatusExited    = "exited"
)

// EmployeeStatuses lists every valid employee status.
var EmployeeStatuses = []string{StatusProbation, StatusActive, StatusOnNotice, StatusExited}

// EmploymentTypes lists every valid employment type.
var EmploymentTypes = []string{"permanent", "fixed_term", "temporary", "intern"}

// Applicant stages.
const (
	StageApplied   = "applied"
	StageHired     = "hired"
	StageRejected  = "rejected"
	StageScreening = "screening"
)

// ApplicantStages lists stages in pipeline order.
var ApplicantStages = []string{"applied", "screening", "interview", "assessment", "offer", "hired", "rejected"}

// Job statuses.
const (
	JobDraft  = "draft"
	JobOpen   = "open"
	JobClosed = "closed"
)

// JobStatuses lists every valid job status.
var JobStatuses = []string{JobDraft, JobOpen, JobClosed}

// Owner roles for onboarding/offboarding tasks.
var OwnerRoles = []string{"hr", "it", "finance", "line_manager"}

// Task kinds and statuses.
const (
	KindOnboarding  = "onboarding"
	KindOffboarding = "offboarding"

	TaskPending       = "pending"
	TaskInProgress    = "in_progress"
	TaskDone          = "done"
	TaskNotApplicable = "not_applicable"
)

// TaskStatuses lists every valid task status.
var TaskStatuses = []string{TaskPending, TaskInProgress, TaskDone, TaskNotApplicable}

// Document and request statuses.
const (
	DocPending  = "pending"
	DocVerified = "verified"
	DocRejected = "rejected"

	ReqPending  = "pending"
	ReqApproved = "approved"
	ReqRejected = "rejected"
)

func contains(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

// Contains is an exported string-slice membership helper.
func Contains(list []string, v string) bool { return contains(list, v) }

// All returns every model for AutoMigrate.
func All() []interface{} {
	return []interface{}{
		&User{}, &Department{}, &Employee{}, &Document{}, &Job{}, &Applicant{}, &Interview{},
		&Task{}, &ChangeRequest{}, &Announcement{},
		&Policy{}, &AuditLog{}, &Holiday{}, &LeaveRequest{}, &Training{}, &TrainingUpdate{}, &DataFix{},
		&SignOff{}, &SignOffStep{}, &Notification{},
	}
}

// User is a login account, optionally linked to an employee.
type User struct {
	ID                 uint   `gorm:"primaryKey"`
	Email              string `gorm:"size:255;not null;uniqueIndex"`
	Name               string `gorm:"size:200;not null"`
	PasswordHash       string `gorm:"size:100;not null"`
	Role               string `gorm:"size:20;not null"`
	EmployeeID         *uint  `gorm:"index"`
	Active             bool   `gorm:"not null"`
	MustChangePassword bool   `gorm:"not null"`
	LastLoginAt        *time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// TableName implements gorm Tabler.
func (User) TableName() string { return "users" }

// Department groups employees.
type Department struct {
	ID        uint   `gorm:"primaryKey"`
	Name      string `gorm:"size:150;not null;uniqueIndex"`
	HeadID    *uint  `gorm:"index"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

// TableName implements gorm Tabler.
func (Department) TableName() string { return "departments" }

// Employee is the core HR record.
type Employee struct {
	ID                       uint       `gorm:"primaryKey"`
	EmployeeNo               string     `gorm:"size:30;not null;uniqueIndex"`
	FirstName                string     `gorm:"size:100;not null"`
	LastName                 string     `gorm:"size:100;not null"`
	Email                    string     `gorm:"size:255;index"`
	Phone                    string     `gorm:"size:50"`
	JobTitle                 string     `gorm:"size:150"`
	DepartmentID             *uint      `gorm:"index"`
	ManagerID                *uint      `gorm:"index"`
	Status                   string     `gorm:"size:20;not null;index"`
	EmploymentType           string     `gorm:"size:20;not null"`
	StartDate                *time.Time `gorm:"type:date"`
	ProbationEndDate         *time.Time `gorm:"type:date"`
	ProbationExtended        bool       `gorm:"not null"`
	ContractEndDate          *time.Time `gorm:"type:date"`
	ExitDate                 *time.Time `gorm:"type:date"`
	Gender                   string     `gorm:"size:20"`
	Nationality              string     `gorm:"size:80"`
	Address                  string     `gorm:"size:500"`
	EmergencyContactName     string     `gorm:"size:150"`
	EmergencyContactPhone    string     `gorm:"size:50"`
	EmergencyContactRelation string     `gorm:"size:80"`
	DateOfBirth              *time.Time `gorm:"type:date"`
	NationalIDNo             string     `gorm:"column:national_id_no;size:50"`
	KRAPin                   string     `gorm:"column:kra_pin;size:30"`
	NSSFNo                   string     `gorm:"column:nssf_no;size:30"`
	SHANo                    string     `gorm:"column:sha_no;size:30"`
	BankName                 string     `gorm:"size:100"`
	BankAccount              string     `gorm:"size:50"`
	PhotoKey                 string     `gorm:"size:100"`
	LeaveAccruedDays         float64    `gorm:"not null;default:0"`
	LeaveCarriedForward      float64    `gorm:"not null;default:0"`
	LeaveTakenDays           float64    `gorm:"not null;default:0"`
	DoesNotApprove           bool       `gorm:"not null;default:false"`
	CreatedAt                time.Time
	UpdatedAt                time.Time
}

// TableName implements gorm Tabler.
func (Employee) TableName() string { return "employees" }

// FullName joins first and last name.
func (e *Employee) FullName() string {
	if e.LastName == "" {
		return e.FirstName
	}
	return e.FirstName + " " + e.LastName
}

// Document is an uploaded employee file.
type Document struct {
	ID              uint       `gorm:"primaryKey"`
	EmployeeID      uint       `gorm:"not null;index"`
	Type            string     `gorm:"column:type;size:40;not null;index"`
	FileName        string     `gorm:"size:255;not null"`
	ContentType     string     `gorm:"size:120;not null"`
	Size            int64      `gorm:"not null"`
	StorageKey      string     `gorm:"size:100;not null"`
	Status          string     `gorm:"size:20;not null;index"`
	ExpiryDate      *time.Time `gorm:"type:date;index"`
	UploadedByID    *uint
	UploadedAt      time.Time `gorm:"not null;index"`
	VerifiedByID    *uint
	VerifiedByName  string `gorm:"size:200"`
	VerifiedAt      *time.Time
	RejectionReason string `gorm:"size:500"`
}

// TableName implements gorm Tabler.
func (Document) TableName() string { return "documents" }

// Job is a recruitment position.
type Job struct {
	ID           uint       `gorm:"primaryKey"`
	Title        string     `gorm:"size:200;not null"`
	DepartmentID *uint      `gorm:"index"`
	Headcount    int        `gorm:"not null"`
	Status       string     `gorm:"size:20;not null;index"`
	Location     string     `gorm:"size:150"`
	Description  string     `gorm:"type:text"`
	ClosingDate  *time.Time `gorm:"type:date"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// TableName implements gorm Tabler.
func (Job) TableName() string { return "jobs" }

// Applicant is a candidate. Records are retained for at least six years and never auto-deleted.
type Applicant struct {
	ID             uint   `gorm:"primaryKey"`
	JobID          uint   `gorm:"not null;index"`
	FullName       string `gorm:"size:200;not null"`
	Email          string `gorm:"size:255;index"`
	Phone          string `gorm:"size:50"`
	Stage          string `gorm:"size:20;not null;index"`
	Source         string `gorm:"size:100"`
	Rating         int
	Notes          string `gorm:"type:text"`
	CVKey          string `gorm:"column:cv_key;size:100"`
	CVFileName     string `gorm:"column:cv_file_name;size:255"`
	CVContentType  string `gorm:"column:cv_content_type;size:120"`
	EmployeeID     *uint  `gorm:"index"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
	StageChangedAt time.Time
}

// TableName implements gorm Tabler.
func (Applicant) TableName() string { return "applicants" }

// Interview is a scheduled interview for an applicant.
type Interview struct {
	ID          uint      `gorm:"primaryKey"`
	ApplicantID uint      `gorm:"not null;index"`
	ScheduledAt time.Time `gorm:"not null"`
	Mode        string    `gorm:"size:40"`
	Panel       string    `gorm:"size:500"`
	Notes       string    `gorm:"type:text"`
	Score       int
	CreatedAt   time.Time
}

// TableName implements gorm Tabler.
func (Interview) TableName() string { return "interviews" }

// Task is a concrete onboarding/offboarding task for one employee.
type Task struct {
	ID              uint       `gorm:"primaryKey"`
	EmployeeID      uint       `gorm:"not null;index"`
	Kind            string     `gorm:"size:20;not null;index"`
	Title           string     `gorm:"size:255;not null"`
	OwnerRole       string     `gorm:"size:20;not null;index"`
	Mandatory       bool       `gorm:"not null"`
	DueDate         *time.Time `gorm:"type:date"`
	Status          string     `gorm:"size:20;not null;index"`
	CompletedAt     *time.Time
	CompletedByName string `gorm:"size:200"`
	Notes           string `gorm:"type:text"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// TableName implements gorm Tabler.
func (Task) TableName() string { return "tasks" }

// ChangeRequest is an employee-initiated change to a sensitive profile field.
type ChangeRequest struct {
	ID            uint   `gorm:"primaryKey"`
	EmployeeID    uint   `gorm:"not null;index"`
	Field         string `gorm:"size:40;not null"`
	OldValue      string `gorm:"size:255"`
	NewValue      string `gorm:"size:255;not null"`
	Reason        string `gorm:"size:500"`
	Status        string `gorm:"size:20;not null;index"`
	DecidedByID   *uint
	DecidedByName string `gorm:"size:200"`
	DecidedAt     *time.Time
	DecisionNote  string `gorm:"size:500"`
	CreatedAt     time.Time
}

// TableName implements gorm Tabler.
func (ChangeRequest) TableName() string { return "change_requests" }

// Announcement is a company-wide notice.
type Announcement struct {
	ID            uint   `gorm:"primaryKey"`
	Title         string `gorm:"size:255;not null"`
	Body          string `gorm:"type:text;not null"`
	CreatedByName string `gorm:"size:200"`
	Pinned        bool   `gorm:"not null"`
	CreatedAt     time.Time
}

// TableName implements gorm Tabler.
func (Announcement) TableName() string { return "announcements" }

// Policy is an uploaded policy document.
type Policy struct {
	ID            uint       `gorm:"primaryKey"`
	Title         string     `gorm:"size:255;not null"`
	Version       string     `gorm:"size:40"`
	EffectiveDate *time.Time `gorm:"type:date"`
	FileName      string     `gorm:"size:255;not null"`
	ContentType   string     `gorm:"size:120;not null"`
	StorageKey    string     `gorm:"size:100;not null"`
	UploadedAt    time.Time
}

// TableName implements gorm Tabler.
func (Policy) TableName() string { return "policies" }

// AuditLog records sensitive actions.
type AuditLog struct {
	ID        uint      `gorm:"primaryKey"`
	At        time.Time `gorm:"column:occurred_at;not null;index"`
	ActorID   *uint     `gorm:"index"`
	ActorName string    `gorm:"size:200"`
	ActorRole string    `gorm:"size:20"`
	Action    string    `gorm:"size:60;not null;index"`
	Entity    string    `gorm:"size:60;not null;index"`
	EntityID  string    `gorm:"size:40"`
	Summary   string    `gorm:"size:1000"`
	IP        string    `gorm:"column:ip;size:64"`
}

// TableName implements gorm Tabler.
func (AuditLog) TableName() string { return "audit_logs" }
