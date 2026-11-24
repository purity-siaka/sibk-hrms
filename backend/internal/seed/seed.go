// Package seed loads default reference data and, optionally, demo data.
package seed

import (
	"fmt"
	"log"
	"strings"
	"time"

	"gorm.io/gorm"

	"sibk-hrms/backend/internal/auth"
	"sibk-hrms/backend/internal/config"
	"sibk-hrms/backend/internal/models"
	"sibk-hrms/backend/internal/policy"
)

type staff struct {
	name, title, email, dept, manager, role string
	startOffsetDays                         int // days before today; demo only
}

var staffList = []staff{
	{"Saad Rahman", "CEO", "saad.rahman@salaaminvestments.com", "Executive Management", "", models.RoleManager, 1700},
	{"Saadia Omar Shurie", "Legal & Compliance Manager", "saadia.omar@salaaminvestments.com", "Legal & Compliance", "Saad Rahman", models.RoleManager, 1200},
	{"Daniel Mwenga", "Paralegal", "daniel.mwenga@salaaminvestments.com", "Legal & Compliance", "Saadia Omar Shurie", models.RoleEmployee, 520},
	{"Geoffrey Aricha", "Accountant", "geoffrey.michael@salaaminvestments.com", "Finance", "Nicholas Kiganya", models.RoleEmployee, 900},
	{"Lucy Wairimu", "Risk & AML Manager", "lucy.wairimu@salaaminvestments.com", "Risk & AML", "Saad Rahman", models.RoleManager, 1000},
	{"Nicholas Kiganya", "Finance Manager", "nicholas.kiganya@salaaminvestments.com", "Finance", "Saad Rahman", models.RoleManager, 1300},
	{"Dennis Muasya", "Software Developer", "dennis.muasya@salaaminvestments.com", "ICT", "Nicholas Kiganya", models.RoleEmployee, 400},
	{"Purity Siaka", "Intern, Software Developer", "purity.siaka@salaaminvestments.com", "ICT", "Nicholas Kiganya", models.RoleEmployee, 75},
	{"Moses Ngige", "Junior Analyst", "moses.ngige@salaaminvestments.com", "", "Nicholas Kiganya", models.RoleEmployee, 40},
	{"Abdirahman Mohamed", "ICT Manager", "murshid@salaaminvestments.com", "ICT", "Saad Rahman", models.RoleManager, 1500},
	{"Mohamed Abdullahi", "Public Relations & Communications Manager", "mohamed.ali@salaaminvestments.com", "Public Relations & Communications", "Saad Rahman", models.RoleManager, 800},
	{"Caroline Mathai", "HR/Operations Officer", "carol.mathai@salaaminvestments.com", "Human Resources", "Saad Rahman", models.RoleHRAdmin, 1100},
	{"Oscar Namawa", "Senior Cleaning & Hospitality Officer", "", "Administration", "Caroline Mathai", models.RoleEmployee, 1400},
	{"Peter Odhiambo", "Cleaning & Hospitality Officer", "", "Administration", "Caroline Mathai", models.RoleEmployee, 700},
	{"Juma Ismail", "Admin Assistant", "", "Administration", "", models.RoleEmployee, 350},
	{"Gerishon Chanzu", "Admin, Salaam 45", "", "Administration", "Caroline Mathai", models.RoleEmployee, 200},
}

var departmentNames = []string{"Executive Management", "Legal & Compliance", "Finance", "Risk & AML", "ICT",
	"Public Relations & Communications", "Human Resources", "Administration"}

type tpl struct {
	kind, title, owner string
	offset             int
	mandatory          bool
}

// Defaults follow the SIBK HR Policy: onboarding (section 4) and the exit process (section 15).
var templates = []tpl{
	{models.KindOnboarding, "Collect signed employment contract and offer acceptance", "hr", 0, true},
	{models.KindOnboarding, "Collect and verify required documents (ID, KRA PIN, certificates, good conduct)", "hr", 7, true},
	{models.KindOnboarding, "Create email and system accounts", "it", -2, true},
	{models.KindOnboarding, "Issue laptop, access card and equipment", "it", 0, true},
	{models.KindOnboarding, "Register for payroll, NSSF and SHA", "finance", 5, true},
	{models.KindOnboarding, "Induction and introduction to the team", "line_manager", 1, true},
	{models.KindOnboarding, "Walk through the HR Policy and code of conduct", "hr", 3, true},
	{models.KindOnboarding, "Set probation objectives", "line_manager", 14, false},
	{models.KindOnboarding, "Probation review meeting", "line_manager", 75, true},
	{models.KindOffboarding, "Receive and acknowledge resignation or termination notice", "hr", 0, true},
	{models.KindOffboarding, "Handover of duties and files", "line_manager", -3, true},
	{models.KindOffboarding, "Return laptop, access card and company property", "it", 0, true},
	{models.KindOffboarding, "Disable email and system access", "it", 0, true},
	{models.KindOffboarding, "Exit interview", "hr", -2, false},
	{models.KindOffboarding, "Compute and pay final dues (within 7 working days)", "finance", 9, true},
	{models.KindOffboarding, "Issue certificate of service", "hr", 9, false},
}

// Run seeds reference data, then users, then optional demo data. It is safe to run on every start.
func Run(db *gorm.DB, cfg config.Config) error {
	if err := seedTemplates(db); err != nil {
		return err
	}
	if err := seedHolidays(db); err != nil {
		return err
	}
	var users int64
	if err := db.Model(&models.User{}).Count(&users).Error; err != nil {
		return err
	}
	if users > 0 {
		return nil
	}
	if cfg.SeedDemo {
		return seedDemo(db, cfg)
	}
	return seedAdmin(db, cfg)
}

func seedTemplates(db *gorm.DB) error {
	var n int64
	db.Model(&models.TaskTemplate{}).Count(&n)
	if n > 0 {
		return nil
	}
	for _, t := range templates {
		row := models.TaskTemplate{Kind: t.kind, Title: t.title, OwnerRole: t.owner, OffsetDays: t.offset, Mandatory: t.mandatory}
		if err := db.Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

func seedAdmin(db *gorm.DB, cfg config.Config) error {
	if cfg.AdminEmail == "" {
		log.Println("no users exist: set ADMIN_EMAIL and ADMIN_PASSWORD to create the first HR admin")
		return nil
	}
	if err := auth.ValidatePassword(cfg.AdminPassword); err != nil {
		return fmt.Errorf("ADMIN_PASSWORD %v", err)
	}
	hash, err := auth.HashPassword(cfg.AdminPassword)
	if err != nil {
		return err
	}
	u := models.User{Email: cfg.AdminEmail, Name: "HR Administrator", PasswordHash: hash, Role: models.RoleHRAdmin, Active: true, MustChangePassword: true}
	if err := db.Create(&u).Error; err != nil {
		return err
	}
	log.Printf("created first HR admin %s (must change password at first sign-in)", u.Email)
	return nil
}

func seedDemo(db *gorm.DB, cfg config.Config) error {
	today := policy.Today()
	return db.Transaction(func(tx *gorm.DB) error {
		deps := map[string]uint{}
		for _, n := range departmentNames {
			d := models.Department{Name: n}
			if err := tx.Create(&d).Error; err != nil {
				return err
			}
			deps[n] = d.ID
		}
		ids := map[string]uint{}
		emps := map[string]*models.Employee{}
		for i, s := range staffList {
			first, last := split(s.name)
			start := today.AddDate(0, 0, -s.startOffsetDays)
			e := models.Employee{
				EmployeeNo: fmt.Sprintf("SIBK-%04d", i+1), FirstName: first, LastName: last, Email: s.email, JobTitle: s.title,
				Status: models.StatusActive, EmploymentType: "permanent", StartDate: &start, Nationality: "Kenyan",
			}
			if s.dept != "" {
				id := deps[s.dept]
				e.DepartmentID = &id
			}
			if s.startOffsetDays < 90 {
				e.Status = models.StatusProbation
				pe := policy.ProbationEnd(start)
				e.ProbationEndDate = &pe
			}
			if s.name == "Peter Odhiambo" {
				e.EmploymentType = "fixed_term"
				ce := today.AddDate(0, 0, 45)
				e.ContractEndDate = &ce
			}
			if err := tx.Create(&e).Error; err != nil {
				return err
			}
			ids[s.name] = e.ID
			emps[s.name] = &e
		}
		for _, s := range staffList {
			if s.manager == "" {
				continue
			}
			if err := tx.Model(&models.Employee{}).Where("id = ?", ids[s.name]).Update("manager_id", ids[s.manager]).Error; err != nil {
				return err
			}
		}
		heads := map[string]string{"Executive Management": "Saad Rahman", "Legal & Compliance": "Saadia Omar Shurie", "Finance": "Nicholas Kiganya",
			"Risk & AML": "Lucy Wairimu", "ICT": "Abdirahman Mohamed", "Public Relations & Communications": "Mohamed Abdullahi", "Human Resources": "Caroline Mathai"}
		for d, h := range heads {
			if err := tx.Model(&models.Department{}).Where("id = ?", deps[d]).Update("head_id", ids[h]).Error; err != nil {
				return err
			}
		}
		for _, s := range staffList {
			if s.email == "" {
				continue
			}
			pw := auth.GeneratePassword()
			must := true
			if s.role == models.RoleHRAdmin {
				if err := auth.ValidatePassword(cfg.AdminPassword); err == nil {
					pw, must = cfg.AdminPassword, false
				} else {
					log.Printf("ADMIN_PASSWORD missing or weak; generated password for %s: %s", s.email, pw)
				}
			} else if cfg.IsDev() {
				log.Printf("demo login %s / %s", s.email, pw)
			}
			hash, err := auth.HashPassword(pw)
			if err != nil {
				return err
			}
			eid := ids[s.name]
			u := models.User{Email: strings.ToLower(s.email), Name: s.name, PasswordHash: hash, Role: s.role, EmployeeID: &eid, Active: true, MustChangePassword: must}
			if err := tx.Create(&u).Error; err != nil {
				return err
			}
		}
		if err := seedLeave(tx, ids); err != nil {
			return err
		}
		return seedDemoActivity(tx, ids, deps, today)
	})
}

func seedDemoActivity(tx *gorm.DB, ids, deps map[string]uint, today time.Time) error {
	// Onboarding tasks for the two newest employees.
	for _, n := range []string{"Purity Siaka", "Moses Ngige"} {
		var e models.Employee
		if err := tx.First(&e, ids[n]).Error; err != nil {
			return err
		}
		var tpls []models.TaskTemplate
		tx.Where("kind = ?", models.KindOnboarding).Order("offset_days, id").Find(&tpls)
		for i, t := range tpls {
			due := e.StartDate.AddDate(0, 0, t.OffsetDays)
			tid := t.ID
			task := models.Task{EmployeeID: e.ID, TemplateID: &tid, Kind: t.Kind, Title: t.Title, OwnerRole: t.OwnerRole, Mandatory: t.Mandatory, DueDate: &due, Status: models.TaskPending}
			if i < 4 {
				now := time.Now().UTC()
				task.Status, task.CompletedAt, task.CompletedByName = models.TaskDone, &now, "Caroline Mathai"
			}
			if err := tx.Create(&task).Error; err != nil {
				return err
			}
		}
	}
	jobs := []models.Job{
		{Title: "Investment Analyst", DepartmentID: ptr(deps["Finance"]), Headcount: 1, Status: models.JobOpen, Location: "Nairobi", Description: "Support fund analysis and reporting."},
		{Title: "Compliance Officer", DepartmentID: ptr(deps["Legal & Compliance"]), Headcount: 1, Status: models.JobOpen, Location: "Nairobi", Description: "Support regulatory compliance and monitoring."},
		{Title: "ICT Support Officer", DepartmentID: ptr(deps["ICT"]), Headcount: 2, Status: models.JobDraft, Location: "Nairobi"},
	}
	for i := range jobs {
		if err := tx.Create(&jobs[i]).Error; err != nil {
			return err
		}
	}
	now := time.Now().UTC()
	applicants := []models.Applicant{
		{JobID: jobs[0].ID, FullName: "Amina Hassan", Email: "amina.hassan@example.com", Stage: "interview", Source: "LinkedIn", Rating: 4},
		{JobID: jobs[0].ID, FullName: "Brian Otieno", Email: "brian.otieno@example.com", Stage: "screening", Source: "Referral", Rating: 3},
		{JobID: jobs[0].ID, FullName: "Faith Wanjiru", Email: "faith.wanjiru@example.com", Stage: "applied", Source: "Careers page"},
		{JobID: jobs[1].ID, FullName: "Kevin Mutua", Email: "kevin.mutua@example.com", Stage: "offer", Source: "LinkedIn", Rating: 5},
		{JobID: jobs[1].ID, FullName: "Zainab Ali", Email: "zainab.ali@example.com", Stage: "assessment", Source: "Referral", Rating: 4},
	}
	for i := range applicants {
		applicants[i].StageChangedAt = now
		if err := tx.Create(&applicants[i]).Error; err != nil {
			return err
		}
	}
	cr := models.ChangeRequest{EmployeeID: ids["Daniel Mwenga"], Field: "bankName", NewValue: "Salaam Bank", Reason: "Changed bank", Status: models.ReqPending}
	if err := tx.Create(&cr).Error; err != nil {
		return err
	}
	ann := models.Announcement{Title: "Welcome to the SIBK HR Management System", Pinned: true, CreatedByName: "Caroline Mathai",
		Body: "Please sign in, check your profile and upload your required documents (CV, certificates, Certificate of Good Conduct, ID, KRA PIN, passport photo and contract)."}
	return tx.Create(&ann).Error
}

func ptr(v uint) *uint { return &v }

func split(full string) (string, string) {
	p := strings.Fields(full)
	if len(p) == 0 {
		return "", ""
	}
	return p[0], strings.Join(p[1:], " ")
}
