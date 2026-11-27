package models

import "time"

// Sign-off statuses.
const (
	SignOffInProgress = "in_progress"
	SignOffCompleted  = "completed" // everyone signed; the document is archived
	SignOffRejected   = "rejected"
	SignOffReturned   = "returned" // sent back to the preparer for correction
)

// Step statuses.
const (
	StepPending = "pending"
	StepSigned  = "signed"
)

// SignOff is an uploaded document that moves from one signatory to the next.
type SignOff struct {
	ID                uint       `gorm:"primaryKey"`
	Title             string     `gorm:"size:200;not null"`
	ProcessName       string     `gorm:"size:200"`
	ProcessID         string     `gorm:"size:80"`
	ProcessDepartment string     `gorm:"size:150"`
	ProcessOwner      string     `gorm:"size:150"`
	ProcessManager    string     `gorm:"size:150"`
	Version           string     `gorm:"size:30"`
	EffectiveDate     *time.Time `gorm:"type:date"`
	ReviewDate        *time.Time `gorm:"type:date"`
	DocumentStatus    string     `gorm:"size:30"`
	Classification    string     `gorm:"size:40"`
	CategoryDeptID    *uint      `gorm:"index"`
	CategoryName      string     `gorm:"size:150;index"`
	PreparerID        uint       `gorm:"not null;index"`
	PreparerName      string     `gorm:"size:200;not null"`
	FileName          string     `gorm:"size:255;not null"`
	ContentType       string     `gorm:"size:120;not null"`
	Size              int64      `gorm:"not null"`
	StorageKey        string     `gorm:"size:100;not null"`
	Status            string     `gorm:"size:20;not null;index"`
	ReturnNote        string     `gorm:"size:1000"`
	Cycle             int        `gorm:"not null;default:1"`
	CompletedAt       *time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// TableName implements gorm Tabler.
func (SignOff) TableName() string { return "signoffs" }

// SignOffStep is one signatory in the order chosen by the preparer.
type SignOffStep struct {
	ID         uint   `gorm:"primaryKey"`
	SignOffID  uint   `gorm:"not null;index"`
	Position   int    `gorm:"column:step_no;not null"` // 1, 2, 3 ...
	EmployeeID uint   `gorm:"not null;index"`
	Name       string `gorm:"size:200;not null"`
	Email      string `gorm:"size:255;not null"`
	Label      string `gorm:"size:80"` // for example "Reviewed by"
	Status     string `gorm:"size:20;not null"`
	SignedAt   *time.Time
	Page       int     // 1-based page the signature was placed on
	X          float64 // 0..1 from the left of the page
	Y          float64 // 0..1 from the top of the page
}

// TableName implements gorm Tabler.
func (SignOffStep) TableName() string { return "signoff_steps" }

// Notification is an in-system alert shown on the bell icon.
type Notification struct {
	ID         uint   `gorm:"primaryKey"`
	EmployeeID uint   `gorm:"not null;index"`
	Kind       string `gorm:"size:30;not null"`
	Title      string `gorm:"size:200;not null"`
	Body       string `gorm:"size:500"`
	Link       string `gorm:"size:200"`
	ReadAt     *time.Time
	CreatedAt  time.Time `gorm:"index"`
}

// TableName implements gorm Tabler.
func (Notification) TableName() string { return "notifications" }
