package seed

import (
	"time"

	"gorm.io/gorm"

	"sibk-hrms/backend/internal/models"
)

type hol struct {
	name    string
	y, m, d int
	yearly  bool
}

// Kenyan public holidays from SIBK's Holidays list.
var holidays = []hol{
	{"New Year’s Day", 2026, 1, 1, true}, {"Good Friday", 2026, 4, 3, false}, {"Easter Monday", 2026, 4, 6, false},
	{"Labour Day", 2026, 5, 1, true}, {"Madaraka Day", 2026, 6, 1, true}, {"Mashujaa Day", 2026, 10, 20, true},
	{"Jamhuri Day", 2026, 12, 12, true}, {"Christmas Day", 2026, 12, 25, true}, {"Boxing Day", 2026, 12, 26, true},
	{"Eid ul-Fitr", 2026, 3, 20, false}, {"Idd-ul-Azha", 2026, 5, 27, false}, {"Utamaduni Day", 2026, 10, 10, true},
	{"New Year’s Day", 2027, 1, 1, true}, {"Labour Day", 2027, 5, 1, true}, {"Madaraka Day", 2027, 6, 1, true},
	{"Mashujaa Day", 2027, 10, 20, true}, {"Jamhuri Day", 2027, 12, 12, true}, {"Christmas Day", 2027, 12, 25, true},
	{"Boxing Day", 2027, 12, 26, true}, {"Utamaduni Day", 2027, 10, 10, true},
}

func seedHolidays(db *gorm.DB) error {
	var n int64
	db.Model(&models.Holiday{}).Count(&n)
	if n > 0 {
		return nil
	}
	for _, h := range holidays {
		row := models.Holiday{Name: h.name, Date: time.Date(h.y, time.Month(h.m), h.d, 0, 0, 0, 0, time.UTC), RepeatsYearly: h.yearly}
		if err := db.Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

// balances are the leave balances recorded in SIBK's Employees list.
var balances = map[string][3]float64{ // accrued, carried forward, taken
	"Purity Siaka": {21, 0, 6}, "Dennis Muasya": {7, 0, 0}, "Caroline Mathai": {11, 0, 0}, "Nicholas Kiganya": {11, 0, 0},
	"Lucy Wairimu": {7, 0, 0}, "Geoffrey Aricha": {8, 0, 2}, "Daniel Mwenga": {16, 0, 0}, "Saadia Omar Shurie": {17, 0, 0},
	"Moses Ngige": {4, 0, 2}, "Abdirahman Mohamed": {8, 0, 0}, "Saad Rahman": {21, 0, 0}, "Mohamed Abdullahi": {0, 0, 0},
	"Oscar Namawa": {5, 0, 0}, "Peter Odhiambo": {10, 0, 0}, "Juma Ismail": {7, 0, 0}, "Gerishon Chanzu": {10, 0, 0},
}

type leaveRow struct {
	who, typ, from, to      string
	days                    float64
	remaining               float64
	approver, status        string
	by, on, reason, comment string
}

// The leave requests recorded so far (SIBK's Leavelogs list).
var leaveRows = []leaveRow{
	{"Purity Siaka", models.LeaveStudy, "2026-11-04", "2026-11-11", 6, 15, "Nicholas Kiganya", models.LeaveRejected, "Nicholas Kiganya", "2026-11-02", "Graduation arrangements and commitments.", "Request under the normal annual leave."},
	{"Purity Siaka", models.LeaveAnnual, "2026-11-04", "2026-11-11", 6, 21, "Nicholas Kiganya", models.LeaveApproved, "Nicholas Kiganya", "2026-11-02", "Graduation arrangements and commitment.", "Ok"},
	{"Caroline Mathai", models.LeaveAnnual, "2026-11-09", "2026-11-16", 6, 11, "Saad Rahman", models.LeavePending, "", "", "Annual leave", ""},
	{"Abdirahman Mohamed", models.LeaveAnnual, "2026-11-17", "2026-11-17", 1, 8, "Saad Rahman", models.LeaveCancelled, "", "", "HI", ""},
	{"Geoffrey Aricha", models.LeaveAnnual, "2026-11-13", "2026-11-16", 2, 8, "Nicholas Kiganya", models.LeaveApproved, "Nicholas Kiganya", "2026-11-17", "Annual Leave", "ok"},
	{"Abdirahman Mohamed", models.LeaveAnnual, "2026-11-18", "2026-11-18", 1, 8, "Saad Rahman", models.LeavePending, "", "", "1", ""},
	{"Moses Ngige", models.LeaveAnnual, "2026-11-20", "2026-11-23", 2, 4, "Nicholas Kiganya", models.LeaveApproved, "Nicholas Kiganya", "2026-11-19", "To handle personal matters that require my attention", "ok"},
	{"Dennis Muasya", models.LeaveStudy, "2026-11-23", "2026-11-26", 4, 7, "Nicholas Kiganya", models.LeaveApproved, "Nicholas Kiganya", "2026-11-23", "To attend to exams", "Approved."},
}

func date(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

// seedLeave loads the real balances and leave requests. Balances are set directly, so approved
// requests are marked as already counted.
func seedLeave(tx *gorm.DB, ids map[string]uint) error {
	for name, b := range balances {
		if err := tx.Model(&models.Employee{}).Where("id = ?", ids[name]).
			Updates(map[string]interface{}{"leave_accrued_days": b[0], "leave_carried_forward": b[1], "leave_taken_days": b[2]}).Error; err != nil {
			return err
		}
	}
	for _, r := range leaveRows {
		l := models.LeaveRequest{
			EmployeeID: ids[r.who], Type: r.typ, FromDate: date(r.from), ToDate: date(r.to), Days: r.days, Reason: r.reason,
			Status: r.status, ApproverType: models.ApproverManager, ApproverEmployeeID: ptr(ids[r.approver]),
			DaysRemainingAtRequest: r.remaining, Comment: r.comment, CountedInBalance: r.status == models.LeaveApproved && r.typ == models.LeaveAnnual,
		}
		if r.who == "Caroline Mathai" {
			l.ApproverType = models.ApproverCEO
		}
		if r.by != "" {
			t := date(r.on).Add(10 * time.Hour)
			l.DecidedByName, l.DecidedAt = r.by, &t
		}
		l.CreatedAt = date(r.from).AddDate(0, 0, -2)
		if err := tx.Create(&l).Error; err != nil {
			return err
		}
	}
	return nil
}
