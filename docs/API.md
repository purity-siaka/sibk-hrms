# SIBK HR Management System: API contract

Single source of truth for the Go backend (`backend/`) and the Next.js frontend (`frontend/`).
Base URL: `http://localhost:8080`. All routes below are under `/api`. JSON is camelCase. Dates are `YYYY-MM-DD`; timestamps are RFC 3339.
Auth: `Authorization: Bearer <jwt>` on every route except `POST /api/auth/login` and `GET /healthz`.
Errors: HTTP status + `{"error":"message","fields":{"email":"is required"}}` (`fields` optional).
Lists: `{"items":[...],"total":N}` when paginated (`page` 1-based, `pageSize` default 24, max 100).
Leave management is OUT OF SCOPE (it is delivered separately in Power Apps). Overtime and salary advances are also out of scope for now. Do not build them.

## Roles
`hr_admin` (everything incl. users, audit), `hr_officer` (all HR data, no users/audit), `manager` (own team read, team onboarding tasks), `employee` (own data only).
A user may be linked to an employee (`employeeId`). Managers are employees with direct reports (`managerId`), role comes from the user record.

## Auth
- `POST /auth/login` `{email,password}` -> `{token, user}`; `user = {id,email,name,role,employeeId,mustChangePassword}`
- `GET /auth/me` -> `user`
- `POST /auth/change-password` `{currentPassword,newPassword}` -> `{ok:true}` (min 10 chars, letter+digit)
- Login is rate limited (5 failures / 15 min per email+IP -> 429). Token lifetime 12h.

## Reference data
- `GET /reference` -> `{documentTypes:[{key,label,required}], employmentTypes:[...], employeeStatuses:[...], applicantStages:[...], ownerRoles:[...]}`
  - documentTypes keys: `cv`, `academic_certificate`, `professional_certificate`, `good_conduct`, `national_id`, `kra_pin`, `passport_photo`, `contract`, `nssf`, `sha`, `other`. `required:true` for cv, academic_certificate, good_conduct, national_id, kra_pin, passport_photo, contract.
  - employmentTypes: `permanent`,`fixed_term`,`temporary`,`intern`. employeeStatuses: `probation`,`active`,`on_notice`,`exited`.
  - applicantStages: `applied`,`screening`,`interview`,`assessment`,`offer`,`hired`,`rejected`. ownerRoles: `hr`,`it`,`finance`,`line_manager`.

## Departments (HR write, all authenticated read)
`Department = {id,name,headId,headName,employeeCount}`
- `GET /departments` -> `Department[]`
- `POST /departments` `{name,headId?}`; `PUT /departments/{id}`; `DELETE /departments/{id}` (409 if employees exist)

## Employees
`EmployeeSummary = {id,employeeNo,fullName,email,jobTitle,departmentId,departmentName,status,employmentType,startDate,hasPhoto}`
`Employee` = summary plus: `firstName,lastName,phone,managerId,managerName,probationEndDate,contractEndDate,exitDate,gender,nationality,address,emergencyContactName,emergencyContactPhone,emergencyContactRelation,documentsVerified,documentsRequired,createdAt`
and HR-only sensitive fields (omitted/empty unless caller is HR, or the employee themself): `dateOfBirth,nationalIdNo,kraPin,nssfNo,shaNo,bankName,bankAccount`.
- `GET /employees?q=&departmentId=&status=&page=&pageSize=` (HR all; manager their team; employee 403) -> `{items:EmployeeSummary[],total}`
- `POST /employees` (HR) body = Employee writable fields (`firstName,lastName,email,jobTitle,departmentId,managerId,employmentType,startDate,...`); `employeeNo` auto `SIBK-0001` style if omitted; probation end auto = startDate + 3 months unless given or type is not probationary. Creates a linked user when `createUser:true` with `role` and a generated temp password returned once as `temporaryPassword`.
- `GET /employees/{id}` (HR; manager for team; self) -> `Employee`. Sensitive fields access is written to the audit log.
- `PUT /employees/{id}` (HR) full/partial update; writes audit entry with changed fields.
- `POST /employees/{id}/photo` multipart `file` (jpg/png, <=2MB) (HR or self) ; `GET /employees/{id}/photo` (any authed who can view the employee) -> image bytes.
- `GET /employees/{id}/documents/checklist` -> `[{type,label,required,document:Document|null}]`
- `GET /employees/{id}/documents` -> `Document[]`; `POST /employees/{id}/documents` multipart `file,type,expiryDate?` (HR or self)
- `GET /employees/{id}/tasks` -> `Task[]`
- `GET /employees/{id}/reports-to-chain`: not needed. `GET /employees/{id}/direct-reports` -> `EmployeeSummary[]`

## Me (self-service)
- `GET /me/dashboard` -> `{employee:Employee, documentsUploaded, documentsRequired, documentsPending, openTasks, announcements:Announcement[]}`
- `GET /me/profile` -> `Employee`; `PUT /me/profile` `{phone?,address?,emergencyContactName?,emergencyContactPhone?,emergencyContactRelation?}`
- `GET /me/documents` -> checklist (same shape as above); `POST /me/documents` multipart `file,type,expiryDate?`
- `POST /me/change-requests` `{field,newValue,reason?}`; allowed fields `bankName,bankAccount,nssfNo,shaNo,kraPin,nationalIdNo`. `GET /me/change-requests`.

## Documents
`Document = {id,employeeId,employeeName,type,typeLabel,fileName,contentType,size,status,expiryDate,uploadedAt,verifiedByName,verifiedAt,rejectionReason}` status: `pending|verified|rejected`.
- `GET /documents?status=&type=&employeeId=&expiring=1&page=&pageSize=` (HR) -> `{items,total}`; `expiring=1` = expires within 60 days or already expired.
- `POST /documents/{id}/verify` (HR); `POST /documents/{id}/reject` `{reason}` (HR)
- `GET /documents/{id}/download` (HR or owner) streams the file with `Content-Disposition`; audit logged.
- `DELETE /documents/{id}` (HR, or owner while pending)
- Uploads: allow pdf, jpg, png, docx; max 10 MB; sniff content type; store under `UPLOAD_DIR` with random names; never serve from a public path.

## Recruitment (HR)
`Job = {id,title,departmentId,departmentName,headcount,status,location,description,closingDate,applicantCount,createdAt}` status `draft|open|closed`.
`Applicant = {id,jobId,jobTitle,fullName,email,phone,stage,source,rating,notes,hasCv,createdAt,stageChangedAt,employeeId}`
`Interview = {id,applicantId,scheduledAt,mode,panel,notes,score,createdAt}`
- `GET /jobs?status=`; `POST /jobs`; `PUT /jobs/{id}`
- `GET /applicants?jobId=&stage=&q=` -> `Applicant[]`; `POST /applicants` (JSON or multipart with optional `cv`); `PUT /applicants/{id}`
- `POST /applicants/{id}/stage` `{stage,note?}`; stage `rejected` keeps the record (recruitment records are kept 6 years per HR Policy; never auto-delete).
- `POST /applicants/{id}/hire` `{startDate,jobTitle?,departmentId?,managerId?,employmentType?}` -> `Employee` (status probation, onboarding tasks created, applicant stage hired, applicant.employeeId set)
- `GET /applicants/{id}/cv`; `GET/POST /applicants/{id}/interviews`

## Onboarding and offboarding
`TaskTemplate = {id,kind,title,ownerRole,offsetDays,mandatory}` kind `onboarding|offboarding`.
`Task = {id,employeeId,employeeName,kind,title,ownerRole,dueDate,status,completedAt,completedByName,notes}` status `pending|in_progress|done|not_applicable`.
- `GET /task-templates?kind=`; `POST /task-templates`; `PUT /task-templates/{id}`; `DELETE /task-templates/{id}` (HR)
- `GET /tasks?employeeId=&kind=&status=&ownerRole=&mine=1` (HR all; others see tasks for their owner role/team; `mine=1` = tasks owned by my role or my direct reports' onboarding if manager)
- `PUT /tasks/{id}` `{status,notes?}`
- `POST /employees/{id}/onboarding/start` (HR; idempotent; due = startDate + offsetDays)
- `POST /employees/{id}/offboarding/start` `{exitDate}` (HR; sets status on_notice, exitDate; tasks due = exitDate + offsetDays). When all mandatory offboarding tasks are done the employee can be marked `exited` via `PUT /employees/{id}`.
- Default templates are seeded from HR Policy section 15 (exit process) and section 4 (onboarding).

## Profile change requests (HR)
`ChangeRequest = {id,employeeId,employeeName,field,oldValue,newValue,reason,status,decidedByName,decidedAt,decisionNote,createdAt}`
- `GET /change-requests?status=`; `POST /change-requests/{id}/decide` `{approve,note?}` (applies the value to the employee when approved; writes audit; bank changes are flagged `isBankChange:true`).

## Announcements and policies
`Announcement = {id,title,body,createdByName,createdAt,pinned}`; `GET /announcements`; `POST /announcements` (HR); `DELETE /announcements/{id}` (HR)
`Policy = {id,title,version,effectiveDate,fileName,uploadedAt}`; `GET /policies` (all authed); `POST /policies` multipart `file,title,version,effectiveDate` (HR); `GET /policies/{id}/download`.

## Dashboard and reports (HR)
- `GET /dashboard` -> `{headcount, byDepartment:[{name,count}], byStatus:[{status,count}], pendingDocuments, employeesMissingDocuments, expiringDocuments, probationEnding:[{employeeId,fullName,date,daysLeft}], contractsEnding:[{employeeId,fullName,date,daysLeft}], openJobs, activeApplicants, pendingChangeRequests, openTasks, overdueTasks, recentUploads:Document[], anniversaries:[{employeeId,fullName,date,years}]}` (probation/contracts within 60 days; anniversaries within 30 days).
- `GET /reports/employees.csv`, `GET /reports/documents-compliance.csv`, `GET /reports/headcount.csv` (HR; UTF-8 CSV with header; audit logged)

## Users and audit (hr_admin)
`User = {id,email,name,role,employeeId,active,mustChangePassword,lastLoginAt}`
- `GET /users`; `POST /users` `{email,name,role,employeeId?,password?}` (returns `temporaryPassword` if generated); `PUT /users/{id}` `{role?,active?,name?}`; `POST /users/{id}/reset-password` -> `{temporaryPassword}`
- `GET /audit?entity=&actor=&action=&page=&pageSize=` -> `{items:[{id,at,actorName,actorRole,action,entity,entityId,summary,ip}],total}`

## Platform requirements (backend)
Go 1.22+, standard `net/http` ServeMux with method+path patterns, GORM + Postgres (`gorm.io/driver/postgres`), bcrypt (`golang.org/x/crypto/bcrypt`), HS256 JWT implemented with `crypto/hmac` (no JWT library). Config by env: `PORT=8080 DATABASE_URL JWT_SECRET UPLOAD_DIR=./uploads CORS_ORIGIN=http://localhost:3000 SEED_DEMO=true ADMIN_EMAIL ADMIN_PASSWORD`. AutoMigrate on start. Health: `GET /healthz`. Graceful shutdown, request logging, panic recovery, security headers, body size limits, CORS.
Seed (when `SEED_DEMO=true`): the 16 real staff names/roles/emails, departments, default task templates, jobs, a few sample documents, one `hr_admin` user for Caroline Mathai (`carol.mathai@salaaminvestments.com`) with password from `ADMIN_PASSWORD`; all other staff get `employee` users with `mustChangePassword=true`.

## Brand (frontend)
SIBK HR Management System. Navy `#1B2F7A` (dark `#132160`), blue `#2F4DA8`, gold `#C8A04A` (soft `#F6EDD6`), white, ink `#16203F`, page background `#F4F6FB`. Font Inter.


## Leave

Process (same as the Power Apps version): staff apply, the decider approves or rejects, the employee sees the outcome.
Working days are Monday to Friday minus public holidays. Only annual leave is deducted from the balance (on approval; refunded on cancel).

Who decides: every request goes to the employee's line manager, whose decision is final. It goes to HR only when there is
no manager stage: the person has no manager (for example the CEO) or the manager is marked `doesNotApprove`. Nobody can decide
their own request. Staff without an email have no login; HR (Carol, as their manager) records and decides for them.

Training: leave type `training` is a separate application (fields `trainingTitle`, `trainingProvider`), uses the same approval,
is never deducted from the balance, and shows in "Who's out now" and the Training report.

Emails (when SMTP_* is set; otherwise they are only logged): on every request HR_MAILBOX is told who asked and whose approval it
awaits, the approver is asked to decide, the employee and HR are told the outcome, and HR is told about cancellations.

Sick leave longer than 2 working days accepts a sick-note attachment (PDF/JPG/PNG/DOCX, 10 MB); it can be added later, and
requests without one appear in the "Sick leave without note" report.

| Method and path | Who | Notes |
|---|---|---|
| GET /api/me/leave | any | `{balance, requests, canApprove, pendingApprovals, upcomingHolidays}` |
| POST /api/me/leave | any | multipart: type, fromDate, toDate, reason, file (sick >2 days) |
| GET /api/employees/{id}/leave | HR, the employee, their manager | same shape as /api/me/leave |
| POST /api/employees/{id}/leave | HR | records leave on behalf of someone (same fields) |
| PUT /api/employees/{id}/leave-balance | HR | `{accruedDays, carriedForwardDays, doesNotApprove}` |
| GET /api/leave | HR | filters: status, type, employeeId, q, page, pageSize |
| GET /api/leave/calc?from=&to= | any | `{days, holidays}` preview |
| GET /api/leave/approvals | any | `{canApprove, items}` requests the caller can decide |
| POST /api/leave/{id}/decide | decider | `{decision: "approve"|"reject", comment}`; comment required on reject |
| POST /api/leave/{id}/cancel | owner, HR | pending, or approved and not yet finished |
| POST /api/leave/{id}/attachment | owner, HR | multipart `file` (sick leave only) |
| GET /api/leave/{id}/attachment | owner, decider, HR | download (audited) |
| GET /api/leave/staff | HR | every employee: takenDays, remainingDays, pendingDays, outNow |
| GET /api/leave-reports | HR | list of reports |
| POST /api/leave-reports/{name}/email | HR | emails the report as a CSV (opens in Excel) to the caller; 503 if SMTP is not set |
| GET /api/leave-reports/{name}[?format=csv] | HR | out-now, pending, upcoming, balances, sick-no-note, audit, training |
| POST /api/leave/year-end | HR admin | `{confirm: "CARRY FORWARD"}`; carries all unused days forward, no cap |
| GET/POST/DELETE /api/holidays | read: any; write: HR | `{name, date, repeatsYearly}` |
