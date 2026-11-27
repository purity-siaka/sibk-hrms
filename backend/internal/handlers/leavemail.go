package handlers

import (
	"fmt"
	"strings"

	"sibk-hrms/backend/internal/models"
)

// leaveDetails is the block of facts repeated in every leave email.
func (a *App) leaveDetails(l *models.LeaveRequest, empName string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Employee: %s\r\n", empName)
	fmt.Fprintf(&b, "Leave type: %s\r\n", models.LeaveTypeLabel(l.Type))
	fmt.Fprintf(&b, "Dates: %s to %s\r\nWorking days: %s\r\nReason: %s\r\n", dval(l.FromDate), dval(l.ToDate), num(l.Days), l.Reason)
	if l.Type == models.LeaveAnnual {
		fmt.Fprintf(&b, "Annual leave days left before this request: %s\r\n", num(l.DaysRemainingAtRequest))
	}
	return b.String()
}

func (a *App) emailOf(empID uint) string {
	var e models.Employee
	if err := a.DB.First(&e, empID).Error; err != nil {
		return ""
	}
	if e.Email != "" {
		return e.Email
	}
	if u := a.userFor(empID); u != nil {
		return u.Email
	}
	return ""
}

func label(l *models.LeaveRequest) string {
	return strings.ToLower(models.LeaveTypeLabel(l.Type)) + " leave"
}

// notifyApplied tells HR (before any approval) who asked and who it is waiting on, and asks the decider.
func (a *App) notifyApplied(l *models.LeaveRequest, e *models.Employee) {
	name := e.FullName()
	waiting, approverMail := "HR", a.Cfg.HRMailbox
	if l.ApproverEmployeeID != nil {
		var ap models.Employee
		if a.DB.First(&ap, *l.ApproverEmployeeID).Error == nil {
			waiting, approverMail = ap.FullName(), a.emailOf(ap.ID)
		}
	}
	details := a.leaveDetails(l, name)
	noHRMailbox := strings.EqualFold(approverMail, a.Cfg.HRMailbox)
	if l.ApproverType == models.ApproverHR {
		a.Mail.Go([]string{a.Cfg.HRMailbox}, fmt.Sprintf("HR approval needed: %s, %s", name, label(l)),
			"A request needs HR to decide, because "+name+" has no manager stage.\r\n\r\n"+details+"\r\nOpen the SIBK Management System and go to Leave, Approvals.\r\n")
		return
	}
	a.Mail.Go([]string{a.Cfg.HRMailbox}, fmt.Sprintf("For HR: %s requested %s, awaiting %s's approval", name, label(l), waiting),
		fmt.Sprintf("%s has requested %s and it is awaiting %s's approval. No action is needed from HR now.\r\n\r\n%s", name, label(l), waiting, details))
	if !noHRMailbox {
		a.Mail.Go([]string{approverMail}, fmt.Sprintf("Approval needed: %s, %s", name, label(l)),
			fmt.Sprintf("%s has requested %s and it needs your decision.\r\n\r\n%s\r\nSign in to the SIBK Management System, open My portal, Leave, Approvals.\r\n", name, label(l), details))
	}
}

// notifyDecided tells the employee the outcome and HR for the record.
func (a *App) notifyDecided(id uint) {
	var l models.LeaveRequest
	if a.DB.First(&l, id).Error != nil {
		return
	}
	name := a.employeeNames([]uint{l.EmployeeID})[l.EmployeeID]
	outcome := l.Status
	details := a.leaveDetails(&l, name)
	comment := ""
	if l.Comment != "" {
		comment = "Comment: " + l.Comment + "\r\n"
	}
	body := fmt.Sprintf("Your %s request was %s by %s.\r\n\r\n%s%s", label(&l), outcome, l.DecidedByName, details, comment)
	a.Mail.Go([]string{a.emailOf(l.EmployeeID)}, fmt.Sprintf("Your %s request was %s", label(&l), outcome), body)
	a.Mail.Go([]string{a.Cfg.HRMailbox}, fmt.Sprintf("Leave %s by %s: %s", outcome, l.DecidedByName, name),
		fmt.Sprintf("For your records. %s's %s request was %s by %s. Nothing else is needed.\r\n\r\n%s%s", name, label(&l), outcome, l.DecidedByName, details, comment))
}

func (a *App) notifyCancelled(id uint) {
	var l models.LeaveRequest
	if a.DB.First(&l, id).Error != nil {
		return
	}
	name := a.employeeNames([]uint{l.EmployeeID})[l.EmployeeID]
	to := []string{a.Cfg.HRMailbox}
	if l.ApproverEmployeeID != nil {
		to = append(to, a.emailOf(*l.ApproverEmployeeID))
	}
	a.Mail.Go(to, fmt.Sprintf("Request cancelled: %s, %s", name, label(&l)), fmt.Sprintf("%s's %s request was cancelled. For your records.\r\n\r\n%s", name, label(&l), a.leaveDetails(&l, name)))
}
