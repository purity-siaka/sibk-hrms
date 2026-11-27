package seed

import (
	"log"
	"strings"
	"time"

	"gorm.io/gorm"

	"sibk-hrms/backend/internal/models"
	"sibk-hrms/backend/internal/storage"
)

// staffNumbers come from SIBK's Staff No list. Daniel Mwenga is not on it yet, so he keeps his
// generated number until HR has his.
var staffNumbers = map[string]string{
	"Saad Rahman": "SIB/015", "Saadia Omar Shurie": "SIB/024", "Geoffrey Aricha": "SIB/059", "Lucy Wairimu": "SIB/041",
	"Nicholas Kiganya": "SIB/021", "Dennis Muasya": "SIB/063", "Purity Siaka": "SIB/064", "Moses Ngige": "SIB/061",
	"Abdirahman Mohamed": "SIB/005", "Mohamed Abdullahi": "SIB/017", "Caroline Mathai": "SIB/006", "Oscar Namawa": "SIB/043",
	"Peter Odhiambo": "SIB/044", "Juma Ismail": "SIB/020", "Gerishon Chanzu": "SIB/028",
}

// remainingDays are everyone's real annual-leave days left, from SIBK's updated Employees sheet.
// Saad Rahman and Dennis Muasya have no figure on the sheet, so their balances are left alone.
var remainingDays = map[string]float64{
	"Saadia Omar Shurie": 16, "Daniel Mwenga": 14, "Geoffrey Aricha": 8, "Lucy Wairimu": 7, "Nicholas Kiganya": 12,
	"Purity Siaka": 0, "Moses Ngige": 4, "Abdirahman Mohamed": 6, "Mohamed Abdullahi": 21, "Caroline Mathai": 11,
	"Oscar Namawa": 5, "Peter Odhiambo": 10, "Juma Ismail": 7, "Gerishon Chanzu": 4,
}

type dataFix struct {
	key string
	run func(tx *gorm.DB, store storage.Store) error
}

var dataFixes = []dataFix{
	{"2026-11-27-real-staff-data", realStaffData},
}

// ApplyDataFixes runs each one-time correction once, in order. It is safe to call on every start.
func ApplyDataFixes(db *gorm.DB, store storage.Store) error {
	for _, f := range dataFixes {
		var n int64
		if err := db.Model(&models.DataFix{}).Where("key = ?", f.key).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		err := db.Transaction(func(tx *gorm.DB) error {
			if err := f.run(tx, store); err != nil {
				return err
			}
			return tx.Create(&models.DataFix{Key: f.key, AppliedAt: time.Now().UTC()}).Error
		})
		if err != nil {
			return err
		}
		log.Printf("data fix applied: %s", f.key)
	}
	return nil
}

func realStaffData(tx *gorm.DB, store storage.Store) error {
	var emps []models.Employee
	if err := tx.Find(&emps).Error; err != nil {
		return err
	}
	byName := map[string]*models.Employee{}
	for i := range emps {
		byName[strings.TrimSpace(emps[i].FullName())] = &emps[i]
	}
	for name, no := range staffNumbers {
		if e := byName[name]; e != nil {
			if err := tx.Model(&models.Employee{}).Where("id = ?", e.ID).Update("employee_no", no).Error; err != nil {
				return err
			}
		}
	}
	// Remaining = accrued + brought forward - taken, so keep what has really been taken and set the rest.
	for name, rem := range remainingDays {
		if e := byName[name]; e != nil {
			err := tx.Model(&models.Employee{}).Where("id = ?", e.ID).
				Updates(map[string]interface{}{"leave_carried_forward": 0, "leave_accrued_days": rem + e.LeaveTakenDays}).Error
			if err != nil {
				return err
			}
		}
	}
	// The two requests made while testing, and every old training-as-leave request (training has its own module now).
	var rows []models.LeaveRequest
	if err := tx.Find(&rows).Error; err != nil {
		return err
	}
	for _, l := range rows {
		who := ""
		if e := findByID(emps, l.EmployeeID); e != nil {
			who = strings.TrimSpace(e.FullName())
		}
		testSick := l.Type == models.LeaveSick && who == "Oscar Namawa"
		if !testSick && l.Type != models.LeaveTraining {
			continue
		}
		if l.CountedInBalance {
			if err := tx.Model(&models.Employee{}).Where("id = ?", l.EmployeeID).
				UpdateColumn("leave_taken_days", gorm.Expr("GREATEST(leave_taken_days - ?, 0)", l.Days)).Error; err != nil {
				return err
			}
		}
		if err := tx.Delete(&models.LeaveRequest{}, l.ID).Error; err != nil {
			return err
		}
		if l.NoteKey != "" && store != nil {
			_ = store.Delete(l.NoteKey)
		}
	}
	return tx.Exec("DROP TABLE IF EXISTS task_templates").Error
}

func findByID(emps []models.Employee, id uint) *models.Employee {
	for i := range emps {
		if emps[i].ID == id {
			return &emps[i]
		}
	}
	return nil
}
