package models

import "time"

// Who pays for a training.
const (
	SponsorSelf = "self"
	SponsorSIBK = "sibk"
)

// Training statuses.
const (
	TrainingUpcoming  = "upcoming"
	TrainingOngoing   = "ongoing"
	TrainingCompleted = "completed"
	TrainingCancelled = "cancelled"
)

// TrainingStatuses lists every valid training status.
var TrainingStatuses = []string{TrainingUpcoming, TrainingOngoing, TrainingCompleted, TrainingCancelled}

// Training is a course or programme an employee plans to attend or is attending. It is separate
// from leave: it records growth and who is paying for it.
type Training struct {
	ID          uint       `gorm:"primaryKey"`
	EmployeeID  uint       `gorm:"not null;index"`
	Title       string     `gorm:"size:200;not null"`
	Provider    string     `gorm:"size:200"`
	StartDate   time.Time  `gorm:"type:date;not null"`
	EndDate     *time.Time `gorm:"type:date"`
	Sponsorship string     `gorm:"size:10;not null"` // who is paying now: self or sibk
	Status      string     `gorm:"size:20;not null;index"`
	Notes       string     `gorm:"type:text"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// TableName implements gorm Tabler.
func (Training) TableName() string { return "trainings" }

// TrainingUpdate is one progress note. Each one records who is sponsoring at that point and,
// optionally, what was paid, so SIBK can see what it contributes to an employee's growth.
type TrainingUpdate struct {
	ID            uint     `gorm:"primaryKey"`
	TrainingID    uint     `gorm:"not null;index"`
	Note          string   `gorm:"type:text;not null"`
	Sponsorship   string   `gorm:"size:10;not null"`
	Amount        *float64 `gorm:"type:numeric(12,2)"`
	CreatedByName string   `gorm:"size:200"`
	CreatedAt     time.Time
}

// TableName implements gorm Tabler.
func (TrainingUpdate) TableName() string { return "training_updates" }

// DataFix records a one-time data correction that has already been applied.
type DataFix struct {
	Key       string `gorm:"primaryKey;size:100"`
	AppliedAt time.Time
}

// TableName implements gorm Tabler.
func (DataFix) TableName() string { return "data_fixes" }
