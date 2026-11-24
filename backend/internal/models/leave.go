package models

import "time"

// Leave types. Only annual leave is deducted from the leave balance.
const (
	LeaveAnnual       = "annual"
	LeaveSick         = "sick"
	LeaveStudy        = "study"
	LeaveMaternity    = "maternity"
	LeavePaternity    = "paternity"
	LeaveCompassion   = "compassionate"
	LeaveUnpaid       = "unpaid"
	SickNoteAfterDays = 2.0 // a sick note is expected when a sick leave is longer than this
)

// LeaveType describes one choice in the leave-type list.
type LeaveType struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

// LeaveTypes lists every valid leave type, in display order.
var LeaveTypes = []LeaveType{
	{LeaveAnnual, "Annual"}, {LeaveSick, "Sick"}, {LeaveStudy, "Study"}, {LeaveMaternity, "Maternity"},
	{LeavePaternity, "Paternity"}, {LeaveCompassion, "Compassionate"}, {LeaveUnpaid, "Unpaid"},
}

// LeaveTypeLabel returns the display label of a leave type.
func LeaveTypeLabel(key string) string {
	for _, t := range LeaveTypes {
		if t.Key == key {
			return t.Label
		}
	}
	return key
}

// ValidLeaveType reports whether key is a known leave type.
func ValidLeaveType(key string) bool {
	for _, t := range LeaveTypes {
		if t.Key == key {
			return true
		}
	}
	return false
}

// Leave request statuses.
const (
	LeavePending   = "pending"
	LeaveApproved  = "approved"
	LeaveRejected  = "rejected"
	LeaveCancelled = "cancelled"
)

// Who decides a request.
const (
	ApproverManager = "manager" // the requester's line manager; final
	ApproverHR      = "hr"      // any HR user
	ApproverCEO     = "ceo"     // the CEO, for HR's own leave
)

// Holiday is a public holiday. Holidays are not counted as leave days.
type Holiday struct {
	ID            uint      `gorm:"primaryKey"`
	Name          string    `gorm:"size:150;not null"`
	Date          time.Time `gorm:"type:date;not null;index"`
	RepeatsYearly bool      `gorm:"not null;default:false"`
	CreatedAt     time.Time
}

// TableName implements gorm Tabler.
func (Holiday) TableName() string { return "holidays" }

// LeaveRequest is one application for leave.
type LeaveRequest struct {
	ID                     uint      `gorm:"primaryKey"`
	EmployeeID             uint      `gorm:"not null;index"`
	Type                   string    `gorm:"size:20;not null;index"`
	FromDate               time.Time `gorm:"type:date;not null;index"`
	ToDate                 time.Time `gorm:"type:date;not null"`
	Days                   float64   `gorm:"not null"`
	Reason                 string    `gorm:"size:1000"`
	Status                 string    `gorm:"size:20;not null;index"`
	ApproverType           string    `gorm:"size:10;not null"`
	ApproverEmployeeID     *uint     `gorm:"index"`
	DaysRemainingAtRequest float64   `gorm:"not null;default:0"`
	DecidedByName          string    `gorm:"size:200"`
	DecidedByUserID        *uint
	DecidedAt              *time.Time
	Comment                string `gorm:"size:1000"`
	CountedInBalance       bool   `gorm:"not null;default:false"` // true once the days were deducted
	NoteKey                string `gorm:"size:100"`
	NoteFileName           string `gorm:"size:255"`
	NoteContentType        string `gorm:"size:120"`
	CreatedByUserID        *uint
	CreatedAt              time.Time `gorm:"index"`
	UpdatedAt              time.Time
}

// TableName implements gorm Tabler.
func (LeaveRequest) TableName() string { return "leave_requests" }
