package handlers

import (
	"net/http"
	"strings"
	"time"

	"sibk-hrms/backend/internal/audit"
	"sibk-hrms/backend/internal/auth"
	"sibk-hrms/backend/internal/httpx"
	"sibk-hrms/backend/internal/models"
)

type userView struct {
	ID                 uint       `json:"id"`
	Email              string     `json:"email"`
	Name               string     `json:"name"`
	Role               string     `json:"role"`
	EmployeeID         *uint      `json:"employeeId"`
	Active             bool       `json:"active"`
	MustChangePassword bool       `json:"mustChangePassword"`
	LastLoginAt        *time.Time `json:"lastLoginAt"`
}

func toUserView(u *models.User) userView {
	return userView{u.ID, u.Email, u.Name, u.Role, u.EmployeeID, u.Active, u.MustChangePassword, u.LastLoginAt}
}

func (a *App) login(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	email := strings.ToLower(trim(in.Email))
	if email == "" || in.Password == "" {
		return httpx.Invalid(map[string]string{"email": "email and password are required"})
	}
	key := email + "|" + clientIP(r)
	if a.Limiter.Blocked(key) {
		return httpx.NewError(http.StatusTooManyRequests, "too many failed sign-in attempts, try again in 15 minutes")
	}
	var u models.User
	err := a.DB.Where("email = ?", email).Limit(1).Find(&u).Error
	if err != nil {
		return err
	}
	if u.ID == 0 || !u.Active {
		auth.BurnPasswordCheck(in.Password)
		a.Limiter.Fail(key)
		return httpx.Unauthorized("incorrect email or password")
	}
	if !auth.CheckPassword(u.PasswordHash, in.Password) {
		a.Limiter.Fail(key)
		return httpx.Unauthorized("incorrect email or password")
	}
	a.Limiter.Reset(key)
	now := time.Now().UTC()
	if err := a.DB.Model(&u).Update("last_login_at", now).Error; err != nil {
		return err
	}
	token, err := auth.Sign(a.Cfg.JWTSecret, u.ID, tokenTTL)
	if err != nil {
		return err
	}
	act := &auth.Actor{UserID: u.ID, Name: u.Name, Email: u.Email, Role: u.Role, EmployeeID: u.EmployeeID}
	audit.Log(a.DB, act, clientIP(r), "login", "user", u.ID, "signed in")
	httpx.JSON(w, http.StatusOK, map[string]interface{}{"token": token, "user": toUserView(&u)})
	return nil
}

func (a *App) me(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var u models.User
	if err := a.DB.First(&u, act.UserID).Error; err != nil {
		return notFound(err, "user")
	}
	httpx.JSON(w, http.StatusOK, toUserView(&u))
	return nil
}

func (a *App) changePassword(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var in struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	var u models.User
	if err := a.DB.First(&u, act.UserID).Error; err != nil {
		return notFound(err, "user")
	}
	f := fieldErrs{}
	if !auth.CheckPassword(u.PasswordHash, in.CurrentPassword) {
		f["currentPassword"] = "is incorrect"
	}
	if err := auth.ValidatePassword(in.NewPassword); err != nil {
		f["newPassword"] = err.Error()
	} else if in.NewPassword == in.CurrentPassword {
		f["newPassword"] = "must be different from the current password"
	}
	if err := f.err(); err != nil {
		return err
	}
	hash, err := auth.HashPassword(in.NewPassword)
	if err != nil {
		return err
	}
	if err := a.DB.Model(&u).Updates(map[string]interface{}{"password_hash": hash, "must_change_password": false}).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "password_change", "user", u.ID, "changed own password")
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
	return nil
}

func (a *App) reference(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	httpx.JSON(w, http.StatusOK, map[string]interface{}{
		"documentTypes":    models.DocumentTypes,
		"employmentTypes":  models.EmploymentTypes,
		"employeeStatuses": models.EmployeeStatuses,
		"applicantStages":  models.ApplicantStages,
		"ownerRoles":       models.OwnerRoles,
		"leaveTypes":       models.LeaveTypes,
	})
	return nil
}

// ---- users (hr_admin) ----

func (a *App) listUsers(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var us []models.User
	if err := a.DB.Order("name").Find(&us).Error; err != nil {
		return err
	}
	out := make([]userView, len(us))
	for i := range us {
		out[i] = toUserView(&us[i])
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (a *App) createUser(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	var in struct {
		Email      string `json:"email"`
		Name       string `json:"name"`
		Role       string `json:"role"`
		EmployeeID *uint  `json:"employeeId"`
		Password   string `json:"password"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	in.Email = strings.ToLower(trim(in.Email))
	in.Name = trim(in.Name)
	f := fieldErrs{}
	if !validEmail(in.Email) {
		f["email"] = "must be a valid email address"
	}
	if in.Name == "" {
		f["name"] = "is required"
	}
	if !models.ValidRole(in.Role) {
		f["role"] = "is not a valid role"
	}
	generated := ""
	pw := in.Password
	if pw == "" {
		generated = auth.GeneratePassword()
		pw = generated
	} else if err := auth.ValidatePassword(pw); err != nil {
		f["password"] = err.Error()
	}
	if err := f.err(); err != nil {
		return err
	}
	var n int64
	a.DB.Model(&models.User{}).Where("email = ?", in.Email).Count(&n)
	if n > 0 {
		return httpx.Invalid(map[string]string{"email": "already has an account"})
	}
	if in.EmployeeID != nil {
		var c int64
		a.DB.Model(&models.Employee{}).Where("id = ?", *in.EmployeeID).Count(&c)
		if c == 0 {
			return httpx.Invalid(map[string]string{"employeeId": "employee not found"})
		}
	}
	hash, err := auth.HashPassword(pw)
	if err != nil {
		return err
	}
	u := models.User{Email: in.Email, Name: in.Name, Role: in.Role, EmployeeID: in.EmployeeID, PasswordHash: hash, Active: true, MustChangePassword: true}
	if err := a.DB.Create(&u).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "user_create", "user", u.ID, "created "+u.Email+" as "+u.Role)
	resp := map[string]interface{}{"user": toUserView(&u)}
	if generated != "" {
		resp["temporaryPassword"] = generated
	}
	httpx.JSON(w, http.StatusCreated, resp)
	return nil
}

func (a *App) updateUser(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Role   *string `json:"role"`
		Active *bool   `json:"active"`
		Name   *string `json:"name"`
	}
	if err := httpx.Decode(w, r, &in); err != nil {
		return err
	}
	var u models.User
	if err := a.DB.First(&u, id).Error; err != nil {
		return notFound(err, "user")
	}
	changes := map[string]interface{}{}
	if in.Role != nil {
		if !models.ValidRole(*in.Role) {
			return httpx.Invalid(map[string]string{"role": "is not a valid role"})
		}
		changes["role"] = *in.Role
	}
	if in.Active != nil {
		changes["active"] = *in.Active
	}
	if in.Name != nil {
		if trim(*in.Name) == "" {
			return httpx.Invalid(map[string]string{"name": "is required"})
		}
		changes["name"] = trim(*in.Name)
	}
	if u.ID == act.UserID {
		if in.Active != nil && !*in.Active {
			return httpx.Conflict("you cannot deactivate your own account")
		}
		if in.Role != nil && *in.Role != models.RoleHRAdmin {
			return httpx.Conflict("you cannot remove your own admin role")
		}
	}
	if len(changes) > 0 {
		if err := a.DB.Model(&u).Updates(changes).Error; err != nil {
			return err
		}
		audit.Log(a.DB, act, clientIP(r), "user_update", "user", u.ID, "updated "+u.Email)
	}
	if err := a.DB.First(&u, id).Error; err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, toUserView(&u))
	return nil
}

func (a *App) resetPassword(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var u models.User
	if err := a.DB.First(&u, id).Error; err != nil {
		return notFound(err, "user")
	}
	pw := auth.GeneratePassword()
	hash, err := auth.HashPassword(pw)
	if err != nil {
		return err
	}
	if err := a.DB.Model(&u).Updates(map[string]interface{}{"password_hash": hash, "must_change_password": true}).Error; err != nil {
		return err
	}
	audit.Log(a.DB, act, clientIP(r), "password_reset", "user", u.ID, "reset password for "+u.Email)
	httpx.JSON(w, http.StatusOK, map[string]string{"temporaryPassword": pw})
	return nil
}

// ---- audit ----

func (a *App) listAudit(w http.ResponseWriter, r *http.Request, act *auth.Actor) error {
	q := a.DB.Model(&models.AuditLog{})
	if v := r.URL.Query().Get("entity"); v != "" {
		q = q.Where("entity = ?", v)
	}
	if v := r.URL.Query().Get("action"); v != "" {
		q = q.Where("action = ?", v)
	}
	if v := trim(r.URL.Query().Get("actor")); v != "" {
		q = q.Where("actor_name ILIKE ?", "%"+escapeLike(v)+"%")
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return err
	}
	_, size, off := httpx.Page(r)
	var rows []models.AuditLog
	if err := q.Order("occurred_at DESC, id DESC").Limit(size).Offset(off).Find(&rows).Error; err != nil {
		return err
	}
	items := make([]map[string]interface{}, len(rows))
	for i, x := range rows {
		items[i] = map[string]interface{}{"id": x.ID, "at": x.At, "actorName": x.ActorName, "actorRole": x.ActorRole,
			"action": x.Action, "entity": x.Entity, "entityId": x.EntityID, "summary": x.Summary, "ip": x.IP}
	}
	httpx.JSON(w, http.StatusOK, map[string]interface{}{"items": items, "total": total})
	return nil
}

func escapeLike(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, "%", `\%`)
	return strings.ReplaceAll(s, "_", `\_`)
}
