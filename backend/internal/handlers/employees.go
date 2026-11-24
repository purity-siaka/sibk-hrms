package handlers

import (
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"

	"sibk-hrms/backend/internal/audit"
	"sibk-hrms/backend/internal/auth"
	"sibk-hrms/backend/internal/httpx"
	"sibk-hrms/backend/internal/models"
	"sibk-hrms/backend/internal/policy"
	"sibk-hrms/backend/internal/storage"
)

// ---- departments ----

type departmentView struct {
	ID            uint   `json:"id"`
	Name          string `json:"name"`
	HeadID        *uint  `json:"headId"`
	HeadName      string `json:"headName"`
	EmployeeCount int64  `json:"employeeCount"`
}

func (a *App) listDepartments(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var deps []models.Department
	if err := a.DB.Order("name").Find(&deps).Error; err != nil {
		return err
	}
	type cnt struct {
		DepartmentID uint
		N            int64
	}
	var counts []cnt
	a.DB.Model(&models.Employee{}).Select("department_id, count(*) AS n").
		Where("department_id IS NOT NULL AND status <> ?", models.StatusExited).Group("department_id").Scan(&counts)
	cm := map[uint]int64{}
	for _, c := range counts {
		cm[c.DepartmentID] = c.N
	}
	var heads []uint
	for _, d := range deps {
		if d.HeadID != nil {
			heads = append(heads, *d.HeadID)
		}
	}
	names := a.employeeNames(heads)
	out := make([]departmentView, len(deps))
	for i, d := range deps {
		v := departmentView{ID: d.ID, Name: d.Name, HeadID: d.HeadID, EmployeeCount: cm[d.ID]}
		if d.HeadID != nil {
			v.HeadName = names[*d.HeadID]
		}
		out[i] = v
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (a *App) saveDepartment(w http.ResponseWriter, r *http.Request, act *auth.Actor, d *models.Department, status int) error {
	var in struct {
		Name   string `json:"name"`
		HeadID *uint  `json:"headId"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	name := trim(in.Name)
	if name == "" {
		return httpx.Invalid(map[string]string{"name": "is required"})
	}
	var n int64
	a.DB.Model(&models.Department{}).Where("LOWER(name) = ? AND id <> ?", strings.ToLower(name), d.ID).Count(&n)
	if n > 0 {
		return httpx.Invalid(map[string]string{"name": "a department with this name already exists"})
	}
	if in.HeadID != nil {
		var c int64
		a.DB.Model(&models.Employee{}).Where("id = ?", *in.HeadID).Count(&c)
		if c == 0 {
			return httpx.Invalid(map[string]string{"headId": "employee not found"})
		}
	}
	d.Name, d.HeadID = name, in.HeadID
	if err := a.DB.Save(d).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "department_save", "department", d.ID, name)
	httpx.JSON(w, status, map[string]interface{}{"id": d.ID, "name": d.Name, "headId": d.HeadID})
	return nil
}

func (a *App) createDepartment(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	return a.saveDepartment(w, r, act, &models.Department{}, http.StatusCreated)
}

func (a *App) updateDepartment(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var d models.Department
	if err := a.DB.First(&d, id).Error; err != nil {
		return notFound(err, "department")
	}
	return a.saveDepartment(w, r, act, &d, http.StatusOK)
}

func (a *App) deleteDepartment(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var d models.Department
	if err := a.DB.First(&d, id).Error; err != nil {
		return notFound(err, "department")
	}
	var n int64
	a.DB.Model(&models.Employee{}).Where("department_id = ?", id).Count(&n)
	if n > 0 {
		return httpx.Conflict("this department still has employees; move them first")
	}
	if err := a.DB.Delete(&d).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "department_delete", "department", id, d.Name)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ---- employee views ----

// EmployeeView is the JSON shape of an employee. Sensitive fields are filled only for HR or the employee themself.
type EmployeeView struct {
	ID             uint    `json:"id"`
	EmployeeNo     string  `json:"employeeNo"`
	FullName       string  `json:"fullName"`
	Email          string  `json:"email"`
	JobTitle       string  `json:"jobTitle"`
	DepartmentID   *uint   `json:"departmentId"`
	DepartmentName string  `json:"departmentName"`
	Status         string  `json:"status"`
	EmploymentType string  `json:"employmentType"`
	StartDate      *string `json:"startDate"`
	HasPhoto       bool    `json:"hasPhoto"`

	FirstName                string     `json:"firstName,omitempty"`
	LastName                 string     `json:"lastName,omitempty"`
	Phone                    string     `json:"phone,omitempty"`
	ManagerID                *uint      `json:"managerId,omitempty"`
	ManagerName              string     `json:"managerName,omitempty"`
	ProbationEndDate         *string    `json:"probationEndDate,omitempty"`
	ProbationExtended        *bool      `json:"probationExtended,omitempty"`
	ContractEndDate          *string    `json:"contractEndDate,omitempty"`
	ExitDate                 *string    `json:"exitDate,omitempty"`
	Gender                   string     `json:"gender,omitempty"`
	Nationality              string     `json:"nationality,omitempty"`
	Address                  string     `json:"address,omitempty"`
	EmergencyContactName     string     `json:"emergencyContactName,omitempty"`
	EmergencyContactPhone    string     `json:"emergencyContactPhone,omitempty"`
	EmergencyContactRelation string     `json:"emergencyContactRelation,omitempty"`
	DocumentsVerified        *int       `json:"documentsVerified,omitempty"`
	DocumentsRequired        *int       `json:"documentsRequired,omitempty"`
	CreatedAt                *time.Time `json:"createdAt,omitempty"`

	DateOfBirth  *string `json:"dateOfBirth,omitempty"`
	NationalIDNo string  `json:"nationalIdNo,omitempty"`
	KRAPin       string  `json:"kraPin,omitempty"`
	NSSFNo       string  `json:"nssfNo,omitempty"`
	SHANo        string  `json:"shaNo,omitempty"`
	BankName     string  `json:"bankName,omitempty"`
	BankAccount  string  `json:"bankAccount,omitempty"`
}

// employeeViews converts models into views. detail adds the full profile; sensitive adds protected fields.
func (a *App) employeeViews(emps []models.Employee, detail bool, sensitive func(*models.Employee) bool) []EmployeeView {
	depIDs := map[uint]bool{}
	var mgrIDs, empIDs []uint
	for i := range emps {
		if emps[i].DepartmentID != nil {
			depIDs[*emps[i].DepartmentID] = true
		}
		if emps[i].ManagerID != nil {
			mgrIDs = append(mgrIDs, *emps[i].ManagerID)
		}
		empIDs = append(empIDs, emps[i].ID)
	}
	depNames := map[uint]string{}
	if len(depIDs) > 0 {
		var deps []models.Department
		a.DB.Find(&deps)
		for _, d := range deps {
			depNames[d.ID] = d.Name
		}
	}
	mgrNames := a.employeeNames(mgrIDs)
	hasPhoto := map[uint]bool{}
	verified := map[uint]int{}
	if len(empIDs) > 0 {
		var withPhoto []uint
		a.DB.Model(&models.Employee{}).Where("id IN ? AND photo_key <> ''", empIDs).Pluck("id", &withPhoto)
		for _, id := range withPhoto {
			hasPhoto[id] = true
		}
		if detail {
			type vc struct {
				EmployeeID uint
				N          int
			}
			var vcs []vc
			a.DB.Model(&models.Document{}).Select("employee_id, count(DISTINCT type) AS n").
				Where("employee_id IN ? AND status = ? AND type IN ?", empIDs, models.DocVerified, models.RequiredDocKeys()).
				Group("employee_id").Scan(&vcs)
			for _, x := range vcs {
				verified[x.EmployeeID] = x.N
			}
		}
	}
	required := len(models.RequiredDocKeys())
	out := make([]EmployeeView, len(emps))
	for i := range emps {
		e := &emps[i]
		v := EmployeeView{
			ID: e.ID, EmployeeNo: e.EmployeeNo, FullName: e.FullName(), Email: e.Email, JobTitle: e.JobTitle,
			DepartmentID: e.DepartmentID, Status: e.Status, EmploymentType: e.EmploymentType,
			StartDate: dstr(e.StartDate), HasPhoto: hasPhoto[e.ID],
		}
		if e.DepartmentID != nil {
			v.DepartmentName = depNames[*e.DepartmentID]
		}
		if detail {
			v.FirstName, v.LastName, v.Phone = e.FirstName, e.LastName, e.Phone
			v.ManagerID = e.ManagerID
			if e.ManagerID != nil {
				v.ManagerName = mgrNames[*e.ManagerID]
			}
			v.ProbationEndDate, v.ContractEndDate, v.ExitDate = dstr(e.ProbationEndDate), dstr(e.ContractEndDate), dstr(e.ExitDate)
			ext := e.ProbationExtended
			v.ProbationExtended = &ext
			v.Gender, v.Nationality, v.Address = e.Gender, e.Nationality, e.Address
			v.EmergencyContactName, v.EmergencyContactPhone, v.EmergencyContactRelation =
				e.EmergencyContactName, e.EmergencyContactPhone, e.EmergencyContactRelation
			dv, dr := verified[e.ID], required
			v.DocumentsVerified, v.DocumentsRequired = &dv, &dr
			ca := e.CreatedAt
			v.CreatedAt = &ca
			if sensitive != nil && sensitive(e) {
				v.DateOfBirth = dstr(e.DateOfBirth)
				v.NationalIDNo, v.KRAPin, v.NSSFNo, v.SHANo = e.NationalIDNo, e.KRAPin, e.NSSFNo, e.SHANo
				v.BankName, v.BankAccount = e.BankName, e.BankAccount
			}
		}
		out[i] = v
	}
	return out
}

func (a *App) detailView(act *auth.Actor, e *models.Employee) EmployeeView {
	sens := func(x *models.Employee) bool { return act.IsHR() || act.IsEmployee(x.ID) }
	return a.employeeViews([]models.Employee{*e}, true, sens)[0]
}

// ---- employees ----

func (a *App) listEmployees(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	q := a.DB.Model(&models.Employee{})
	if !act.IsHR() {
		ids, err := a.teamIDs(act)
		if err != nil {
			return err
		}
		if len(ids) == 0 {
			httpx.JSON(w, http.StatusOK, map[string]interface{}{"items": []EmployeeView{}, "total": 0})
			return nil
		}
		q = q.Where("id IN ?", ids)
	}
	qs := r.URL.Query()
	if s := trim(qs.Get("q")); s != "" {
		like := "%" + escapeLike(s) + "%"
		q = q.Where("first_name ILIKE ? OR last_name ILIKE ? OR (first_name || ' ' || last_name) ILIKE ? OR email ILIKE ? OR employee_no ILIKE ? OR job_title ILIKE ?",
			like, like, like, like, like, like)
	}
	if v := qs.Get("departmentId"); v != "" {
		q = q.Where("department_id = ?", v)
	}
	if v := qs.Get("status"); v != "" {
		q = q.Where("status = ?", v)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return err
	}
	_, size, off := httpx.Page(r)
	var emps []models.Employee
	if err := q.Order("first_name, last_name").Limit(size).Offset(off).Find(&emps).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]interface{}{"items": a.employeeViews(emps, false, nil), "total": total})
	return nil
}

// employeeInput holds writable employee fields. Pointers distinguish "not sent" from "empty".
type employeeInput struct {
	FirstName                *string `json:"firstName"`
	LastName                 *string `json:"lastName"`
	Email                    *string `json:"email"`
	Phone                    *string `json:"phone"`
	JobTitle                 *string `json:"jobTitle"`
	DepartmentID             *uint   `json:"departmentId"`
	ManagerID                *uint   `json:"managerId"`
	Status                   *string `json:"status"`
	EmploymentType           *string `json:"employmentType"`
	StartDate                *string `json:"startDate"`
	ProbationEndDate         *string `json:"probationEndDate"`
	ExtendProbation          *bool   `json:"extendProbation"`
	ContractEndDate          *string `json:"contractEndDate"`
	ExitDate                 *string `json:"exitDate"`
	Gender                   *string `json:"gender"`
	Nationality              *string `json:"nationality"`
	Address                  *string `json:"address"`
	EmergencyContactName     *string `json:"emergencyContactName"`
	EmergencyContactPhone    *string `json:"emergencyContactPhone"`
	EmergencyContactRelation *string `json:"emergencyContactRelation"`
	DateOfBirth              *string `json:"dateOfBirth"`
	NationalIDNo             *string `json:"nationalIdNo"`
	KRAPin                   *string `json:"kraPin"`
	NSSFNo                   *string `json:"nssfNo"`
	SHANo                    *string `json:"shaNo"`
	BankName                 *string `json:"bankName"`
	BankAccount              *string `json:"bankAccount"`

	EmployeeNo string `json:"employeeNo"`
	CreateUser bool   `json:"createUser"`
	Role       string `json:"role"`
}

func setStr(dst *string, src *string) {
	if src != nil {
		*dst = trim(*src)
	}
}

func setDate(f fieldErrs, key string, dst **time.Time, src *string) {
	if src == nil {
		return
	}
	t, err := parseDate(*src)
	if err != nil {
		f[key] = err.Error()
		return
	}
	*dst = t
}

// apply copies the sent fields onto e and records validation problems in f.
func (in *employeeInput) apply(e *models.Employee, f fieldErrs) {
	setStr(&e.FirstName, in.FirstName)
	setStr(&e.LastName, in.LastName)
	if in.Email != nil {
		e.Email = strings.ToLower(trim(*in.Email))
	}
	setStr(&e.Phone, in.Phone)
	setStr(&e.JobTitle, in.JobTitle)
	setStr(&e.Gender, in.Gender)
	setStr(&e.Nationality, in.Nationality)
	setStr(&e.Address, in.Address)
	setStr(&e.EmergencyContactName, in.EmergencyContactName)
	setStr(&e.EmergencyContactPhone, in.EmergencyContactPhone)
	setStr(&e.EmergencyContactRelation, in.EmergencyContactRelation)
	setStr(&e.NationalIDNo, in.NationalIDNo)
	setStr(&e.KRAPin, in.KRAPin)
	setStr(&e.NSSFNo, in.NSSFNo)
	setStr(&e.SHANo, in.SHANo)
	setStr(&e.BankName, in.BankName)
	setStr(&e.BankAccount, in.BankAccount)
	if in.DepartmentID != nil {
		if *in.DepartmentID == 0 {
			e.DepartmentID = nil
		} else {
			e.DepartmentID = in.DepartmentID
		}
	}
	if in.ManagerID != nil {
		if *in.ManagerID == 0 {
			e.ManagerID = nil
		} else {
			e.ManagerID = in.ManagerID
		}
	}
	if in.Status != nil {
		if !models.Contains(models.EmployeeStatuses, *in.Status) {
			f["status"] = "is not a valid status"
		} else {
			e.Status = *in.Status
		}
	}
	if in.EmploymentType != nil {
		if !models.Contains(models.EmploymentTypes, *in.EmploymentType) {
			f["employmentType"] = "is not a valid employment type"
		} else {
			e.EmploymentType = *in.EmploymentType
		}
	}
	setDate(f, "startDate", &e.StartDate, in.StartDate)
	setDate(f, "probationEndDate", &e.ProbationEndDate, in.ProbationEndDate)
	setDate(f, "contractEndDate", &e.ContractEndDate, in.ContractEndDate)
	setDate(f, "exitDate", &e.ExitDate, in.ExitDate)
	setDate(f, "dateOfBirth", &e.DateOfBirth, in.DateOfBirth)
}

func (a *App) validateEmployee(e *models.Employee, f fieldErrs) {
	if e.FirstName == "" {
		f["firstName"] = "is required"
	}
	if e.Email != "" && !validEmail(e.Email) {
		f["email"] = "must be a valid email address"
	}
	if e.DepartmentID != nil {
		var n int64
		a.DB.Model(&models.Department{}).Where("id = ?", *e.DepartmentID).Count(&n)
		if n == 0 {
			f["departmentId"] = "department not found"
		}
	}
	if e.ManagerID != nil {
		var n int64
		a.DB.Model(&models.Employee{}).Where("id = ?", *e.ManagerID).Count(&n)
		if n == 0 {
			f["managerId"] = "manager not found"
		} else if e.ID != 0 && *e.ManagerID == e.ID {
			f["managerId"] = "an employee cannot report to themself"
		}
	}
	if e.StartDate != nil && e.ExitDate != nil && e.ExitDate.Before(*e.StartDate) {
		f["exitDate"] = "cannot be before the start date"
	}
}

// nextEmployeeNo returns the next SIBK-0001 style number.
func nextEmployeeNo(tx *gorm.DB) (string, error) {
	var nos []string
	if err := tx.Model(&models.Employee{}).Where("employee_no LIKE 'SIBK-%'").Pluck("employee_no", &nos).Error; err != nil {
		return "", err
	}
	max := 0
	for _, s := range nos {
		n := 0
		for _, c := range strings.TrimPrefix(s, "SIBK-") {
			if c < '0' || c > '9' {
				n = 0
				break
			}
			n = n*10 + int(c-'0')
		}
		if n > max {
			max = n
		}
	}
	return "SIBK-" + pad4(max+1), nil
}

func pad4(n int) string {
	s := ""
	for i := 0; i < 4; i++ {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	if n > 0 {
		return "9999"
	}
	return s
}

func (a *App) createEmployee(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var in employeeInput
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	e := models.Employee{Status: models.StatusProbation, EmploymentType: "permanent"}
	f := fieldErrs{}
	in.apply(&e, f)
	a.validateEmployee(&e, f)
	if in.CreateUser {
		if !models.ValidRole(in.Role) {
			f["role"] = "is not a valid role"
		}
		if e.Email == "" {
			f["email"] = "is required to create a login"
		}
	}
	if err := f.err(); err != nil {
		return err
	}
	if e.Status == models.StatusProbation && e.ProbationEndDate == nil && e.StartDate != nil && policy.IsProbationary(e.EmploymentType) {
		pe := policy.ProbationEnd(*e.StartDate)
		e.ProbationEndDate = &pe
	}
	var tempPassword string
	var created models.User
	err := a.DB.Transaction(func(tx *gorm.DB) error {
		e.EmployeeNo = trim(in.EmployeeNo)
		if e.EmployeeNo == "" {
			no, err := nextEmployeeNo(tx)
			if err != nil {
				return err
			}
			e.EmployeeNo = no
		} else {
			var n int64
			tx.Model(&models.Employee{}).Where("employee_no = ?", e.EmployeeNo).Count(&n)
			if n > 0 {
				return httpx.Invalid(map[string]string{"employeeNo": "is already in use"})
			}
		}
		if err := tx.Create(&e).Error; err != nil {
			return err
		}
		if in.CreateUser {
			var n int64
			tx.Model(&models.User{}).Where("email = ?", e.Email).Count(&n)
			if n > 0 {
				return httpx.Invalid(map[string]string{"email": "already has a login"})
			}
			tempPassword = auth.GeneratePassword()
			hash, err := auth.HashPassword(tempPassword)
			if err != nil {
				return err
			}
			created = models.User{Email: e.Email, Name: e.FullName(), PasswordHash: hash, Role: in.Role, EmployeeID: &e.ID, Active: true, MustChangePassword: true}
			return tx.Create(&created).Error
		}
		return nil
	})
	if err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "employee_create", "employee", e.ID, "created "+e.FullName()+" ("+e.EmployeeNo+")")
	resp := map[string]interface{}{}
	view := a.detailView(act, &e)
	b, _ := jsonMap(view)
	for k, v := range b {
		resp[k] = v
	}
	if tempPassword != "" {
		resp["temporaryPassword"] = tempPassword
	}
	httpx.JSON(w, http.StatusCreated, resp)
	return nil
}

func (a *App) getEmployee(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.loadViewable(r, act)
	if err != nil {
		return err
	}
	if act.IsHR() && !act.IsEmployee(e.ID) {
		audit.Log(a.DB, act, clientIP(r), "employee_view", "employee", e.ID, "viewed profile incl. sensitive fields of "+e.FullName())
	}
	httpx.JSON(w, http.StatusOK, a.detailView(act, e))
	return nil
}

func (a *App) updateEmployee(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var e models.Employee
	if err := a.DB.First(&e, id).Error; err != nil {
		return notFound(err, "employee")
	}
	var in employeeInput
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	before := e
	f := fieldErrs{}
	in.apply(&e, f)
	if in.ExtendProbation != nil && *in.ExtendProbation {
		switch {
		case e.ProbationExtended:
			f["extendProbation"] = "probation can be extended only once"
		case e.ProbationEndDate == nil:
			f["extendProbation"] = "this employee has no probation end date"
		default:
			ne := policy.ExtendProbation(*e.ProbationEndDate)
			e.ProbationEndDate, e.ProbationExtended = &ne, true
		}
	}
	if e.FirstName == "" {
		f["firstName"] = "is required"
	}
	a.validateEmployee(&e, f)
	if e.Status == models.StatusExited && e.ExitDate == nil {
		f["exitDate"] = "is required when the employee has exited"
	}
	if e.Status == models.StatusExited && before.Status != models.StatusExited {
		var open int64
		a.DB.Model(&models.Task{}).Where("employee_id = ? AND kind = ? AND mandatory = ? AND status NOT IN ?",
			e.ID, models.KindOffboarding, true, []string{models.TaskDone, models.TaskNotApplicable}).Count(&open)
		if open > 0 {
			f["status"] = "mandatory exit tasks are still open"
		}
	}
	if err := f.err(); err != nil {
		return err
	}
	e.UpdatedAt = time.Now().UTC()
	if err := a.DB.Save(&e).Error; err != nil {
		return err
	}
	if e.Status == models.StatusExited {
		a.DB.Model(&models.User{}).Where("employee_id = ?", e.ID).Update("active", false)
	}
	audit.Log(a.DB, act, clientIP(r), "employee_update", "employee", e.ID, "changed: "+strings.Join(changedFields(&before, &e), ", "))
	httpx.JSON(w, http.StatusOK, a.detailView(act, &e))
	return nil
}

// changedFields lists the names (never the values) of fields that differ.
func changedFields(a, b *models.Employee) []string {
	var out []string
	add := func(name string, diff bool) {
		if diff {
			out = append(out, name)
		}
	}
	add("firstName", a.FirstName != b.FirstName)
	add("lastName", a.LastName != b.LastName)
	add("email", a.Email != b.Email)
	add("phone", a.Phone != b.Phone)
	add("jobTitle", a.JobTitle != b.JobTitle)
	add("department", !eqUint(a.DepartmentID, b.DepartmentID))
	add("manager", !eqUint(a.ManagerID, b.ManagerID))
	add("status", a.Status != b.Status)
	add("employmentType", a.EmploymentType != b.EmploymentType)
	add("startDate", !eqTime(a.StartDate, b.StartDate))
	add("probationEndDate", !eqTime(a.ProbationEndDate, b.ProbationEndDate))
	add("contractEndDate", !eqTime(a.ContractEndDate, b.ContractEndDate))
	add("exitDate", !eqTime(a.ExitDate, b.ExitDate))
	add("gender", a.Gender != b.Gender)
	add("nationality", a.Nationality != b.Nationality)
	add("address", a.Address != b.Address)
	add("emergencyContact", a.EmergencyContactName != b.EmergencyContactName || a.EmergencyContactPhone != b.EmergencyContactPhone || a.EmergencyContactRelation != b.EmergencyContactRelation)
	add("dateOfBirth", !eqTime(a.DateOfBirth, b.DateOfBirth))
	add("nationalId", a.NationalIDNo != b.NationalIDNo)
	add("kraPin", a.KRAPin != b.KRAPin)
	add("nssfNo", a.NSSFNo != b.NSSFNo)
	add("shaNo", a.SHANo != b.SHANo)
	add("bankDetails", a.BankName != b.BankName || a.BankAccount != b.BankAccount)
	if len(out) == 0 {
		out = append(out, "nothing")
	}
	return out
}

func eqUint(a, b *uint) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func eqTime(a, b *time.Time) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.Equal(*b)
}

func (a *App) directReports(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.loadViewable(r, act)
	if err != nil {
		return err
	}
	var emps []models.Employee
	if err := a.DB.Where("manager_id = ?", e.ID).Order("first_name, last_name").Find(&emps).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a.employeeViews(emps, false, nil))
	return nil
}

// ---- photo ----

func (a *App) uploadPhoto(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var e models.Employee
	if err := a.DB.First(&e, id).Error; err != nil {
		return notFound(err, "employee")
	}
	if !act.IsHR() && !act.IsEmployee(e.ID) {
		return httpx.Forbidden()
	}
	return a.savePhoto(w, r, act, &e)
}

func (a *App) savePhoto(w http.ResponseWriter, r *http.Request, act *auth.Actor, e *models.Employee) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxPhotoSize+(64<<10))
	file, hdr, err := r.FormFile("file")
	if err != nil {
		return httpx.BadRequest("attach an image in the 'file' field")
	}
	defer file.Close()
	saved, err := a.Store.Save(file, hdr.Filename, maxPhotoSize, storage.ImageOnly)
	if err != nil {
		return uploadError(err, "photos must be JPG or PNG up to 2 MB")
	}
	old := e.PhotoKey
	if err := a.DB.Model(e).Update("photo_key", saved.Key).Error; err != nil {
		a.Store.Delete(saved.Key)
		return err
	}
	_ = a.Store.Delete(old)
	audit.Log(a.DB, act, clientIP(r), "photo_upload", "employee", e.ID, "updated passport photo")
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
	return nil
}

func uploadError(err error, msg string) error {
	switch err {
	case storage.ErrTooLarge, storage.ErrType, storage.ErrEmpty:
		return httpx.NewError(http.StatusUnprocessableEntity, msg)
	}
	return err
}

func (a *App) getPhoto(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	e, err := a.loadViewable(r, act)
	if err != nil {
		return err
	}
	if e.PhotoKey == "" {
		return httpx.NotFound("photo")
	}
	f, err := a.Store.Open(e.PhotoKey)
	if err != nil {
		return httpx.NotFound("photo")
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	ct := "image/jpeg"
	if strings.HasSuffix(e.PhotoKey, ".png") {
		ct = "image/png"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "private, max-age=300")
	http.ServeContent(w, r, "", st.ModTime(), f)
	return nil
}
