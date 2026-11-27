// Shared types mirroring docs/API.md. Keep in sync with the backend contract.

export type Role = "hr_admin" | "hr_officer" | "manager" | "employee";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  employeeId: number | null;
  mustChangePassword: boolean;
}

export interface AdminUser extends User {
  active: boolean;
  lastLoginAt: string | null;
  temporaryPassword?: string;
}

export type EmploymentType = "permanent" | "fixed_term" | "temporary" | "intern";
export type EmployeeStatus = "probation" | "active" | "on_notice" | "exited";
export type ApplicantStage =
  | "applied"
  | "screening"
  | "interview"
  | "assessment"
  | "offer"
  | "hired"
  | "rejected";
export type OwnerRole = "hr" | "it" | "finance" | "line_manager";

export interface DocumentTypeRef {
  key: string;
  label: string;
  required: boolean;
}

export interface Reference {
  documentTypes: DocumentTypeRef[];
  employmentTypes: EmploymentType[];
  employeeStatuses: EmployeeStatus[];
  applicantStages: ApplicantStage[];
  ownerRoles: OwnerRole[];
  leaveTypes: LeaveTypeRef[];
}

export interface Department {
  id: number;
  name: string;
  headId: number | null;
  headName: string;
  employeeCount: number;
}

export interface EmployeeSummary {
  id: number;
  employeeNo: string;
  fullName: string;
  email: string;
  jobTitle: string;
  departmentId: number | null;
  departmentName: string;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  startDate: string;
  hasPhoto: boolean;
}

export interface Employee extends EmployeeSummary {
  firstName: string;
  lastName: string;
  phone: string;
  managerId: number | null;
  managerName: string;
  probationEndDate: string | null;
  probationExtended?: boolean;
  contractEndDate: string | null;
  exitDate: string | null;
  gender: string;
  nationality: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  documentsVerified: number;
  documentsRequired: number;
  createdAt: string;
  // HR-only or self
  dateOfBirth?: string | null;
  nationalIdNo?: string;
  kraPin?: string;
  nssfNo?: string;
  shaNo?: string;
  bankName?: string;
  bankAccount?: string;
}

export interface EmployeeInput {
  employeeNo?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  jobTitle: string;
  departmentId?: number | null;
  managerId?: number | null;
  employmentType: EmploymentType;
  status?: EmployeeStatus;
  startDate: string;
  probationEndDate?: string | null;
  contractEndDate?: string | null;
  exitDate?: string | null;
  gender?: string;
  nationality?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  dateOfBirth?: string | null;
  nationalIdNo?: string;
  kraPin?: string;
  nssfNo?: string;
  shaNo?: string;
  bankName?: string;
  bankAccount?: string;
  extendProbation?: boolean;
  createUser?: boolean;
  role?: Role;
}

export interface EmployeeCreated extends Employee {
  temporaryPassword?: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
}

export type DocStatus = "pending" | "verified" | "rejected";

export interface DocumentRecord {
  id: number;
  employeeId: number;
  employeeName: string;
  type: string;
  typeLabel: string;
  fileName: string;
  contentType: string;
  size: number;
  status: DocStatus;
  expiryDate: string | null;
  uploadedAt: string;
  verifiedByName: string;
  verifiedAt: string | null;
  rejectionReason: string;
}

export interface ChecklistItem {
  type: string;
  label: string;
  required: boolean;
  document: DocumentRecord | null;
}

export type JobStatus = "draft" | "open" | "closed";

export interface Job {
  id: number;
  title: string;
  departmentId: number | null;
  departmentName: string;
  headcount: number;
  status: JobStatus;
  location: string;
  description: string;
  closingDate: string | null;
  applicantCount: number;
  createdAt: string;
}

export interface JobInput {
  title: string;
  departmentId?: number | null;
  headcount: number;
  status: JobStatus;
  location: string;
  description: string;
  closingDate?: string | null;
}

export interface Applicant {
  id: number;
  jobId: number | null;
  jobTitle: string;
  fullName: string;
  email: string;
  phone: string;
  stage: ApplicantStage;
  source: string;
  rating: number;
  notes: string;
  hasCv: boolean;
  createdAt: string;
  stageChangedAt: string;
  employeeId: number | null;
}

export interface Interview {
  id: number;
  applicantId: number;
  scheduledAt: string;
  mode: string;
  panel: string;
  notes: string;
  score: number | null;
  createdAt: string;
}

export interface HireInput {
  startDate: string;
  jobTitle?: string;
  departmentId?: number | null;
  managerId?: number | null;
  employmentType?: EmploymentType;
}

export type TaskKind = "onboarding" | "offboarding";
export type TaskStatus = "pending" | "in_progress" | "done" | "not_applicable";

export interface TaskInput {
  employeeId: number;
  kind: TaskKind;
  title: string;
  ownerRole: OwnerRole;
  dueDate: string;
  notes: string;
}

export interface Task {
  id: number;
  employeeId: number;
  employeeName: string;
  kind: TaskKind;
  title: string;
  ownerRole: OwnerRole;
  dueDate: string | null;
  status: TaskStatus;
  completedAt: string | null;
  completedByName: string;
  notes: string;
}

export type DecisionStatus = "pending" | "approved" | "rejected";

export interface ChangeRequest {
  id: number;
  employeeId: number;
  employeeName: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
  status: DecisionStatus;
  decidedByName: string;
  decidedAt: string | null;
  decisionNote: string;
  createdAt: string;
  isBankChange?: boolean;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  createdByName: string;
  createdAt: string;
  pinned: boolean;
}

export interface Policy {
  id: number;
  title: string;
  version: string;
  effectiveDate: string;
  fileName: string;
  uploadedAt: string;
}

export interface DatedPerson {
  employeeId: number;
  fullName: string;
  date: string;
  daysLeft: number;
}

export interface DashboardData {
  headcount: number;
  byDepartment: { name: string; count: number }[];
  byStatus: { status: EmployeeStatus; count: number }[];
  pendingDocuments: number;
  employeesMissingDocuments: number;
  expiringDocuments: number;
  probationEnding: DatedPerson[];
  contractsEnding: DatedPerson[];
  openJobs: number;
  activeApplicants: number;
  pendingChangeRequests: number;
  openTasks: number;
  overdueTasks: number;
  recentUploads: DocumentRecord[];
  anniversaries: { employeeId: number; fullName: string; date: string; years: number }[];
}

export interface MeDashboard {
  employee: Employee;
  documentsUploaded: number;
  documentsRequired: number;
  documentsPending: number;
  openTasks: number;
  announcements: Announcement[];
}

export interface AuditEntry {
  id: number;
  at: string;
  actorName: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string | number;
  summary: string;
  ip: string;
}

export interface ProfileUpdate {
  phone?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
}

export const CHANGE_FIELDS: { key: string; label: string }[] = [
  { key: "bankName", label: "Bank name" },
  { key: "bankAccount", label: "Bank account number" },
  { key: "nssfNo", label: "NSSF number" },
  { key: "shaNo", label: "SHA number" },
  { key: "kraPin", label: "KRA PIN" },
  { key: "nationalIdNo", label: "National ID number" },
];

// ---- leave ----

export interface LeaveTypeRef {
  key: string;
  label: string;
}

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveBalance {
  accruedDays: number;
  carriedForwardDays: number;
  takenDays: number;
  pendingDays: number;
  remainingDays: number;
  availableDays: number;
  doesNotApprove: boolean;
}

export interface Leave {
  id: number;
  employeeId: number;
  employeeName: string;
  type: string;
  typeLabel: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  approverType: "manager" | "hr" | "ceo";
  approverName: string;
  daysRemainingAtRequest: number;
  decidedByName?: string;
  decidedAt: string | null;
  comment?: string;
  hasNote: boolean;
  noteFileName?: string;
  needsNote: boolean;
  createdAt: string;
  canDecide: boolean;
  canCancel: boolean;
  canAttach: boolean;
}

export interface Holiday {
  id: number;
  name: string;
  date: string;
  repeatsYearly: boolean;
}

export interface LeaveSummary {
  balance: LeaveBalance;
  requests: Leave[];
  canApprove: boolean;
  pendingApprovals: number;
  upcomingHolidays?: Holiday[];
}

export interface LeaveReport {
  key: string;
  title: string;
  columns: string[];
  rows: string[][];
}

export interface StaffLeave {
  employeeId: number;
  fullName: string;
  jobTitle: string;
  managerName: string;
  broughtForwardDays: number;
  accruedDays: number;
  takenDays: number;
  remainingDays: number;
  sickDays: number;
  otherDays: number;
  pendingRequests: number;
  pendingDays: number;
  outNow: boolean;
  outNowReason?: string;
  /** annual-leave days not taken, which move into next year */
  carriedForwardDays: number;
}

export type Sponsorship = "self" | "sibk";
export type TrainingStatus = "upcoming" | "ongoing" | "completed" | "cancelled";

export interface TrainingUpdate {
  id: number;
  note: string;
  sponsorship: Sponsorship;
  amount: number | null;
  byName: string;
  createdAt: string;
}

export interface Training {
  id: number;
  employeeId: number;
  employeeName: string;
  title: string;
  provider: string;
  startDate: string;
  endDate: string | null;
  sponsorship: Sponsorship;
  status: TrainingStatus;
  notes: string;
  sibkAmount: number;
  selfAmount: number;
  updates: TrainingUpdate[];
  canEdit: boolean;
}

export interface TrainingInput {
  title: string;
  provider: string;
  startDate: string;
  endDate: string;
  sponsorship: Sponsorship;
  notes: string;
}

export type SignOffStatus = "in_progress" | "completed" | "rejected" | "returned";

export interface SignOffStep {
  id: number;
  position: number;
  employeeId: number;
  name: string;
  email: string;
  label: string;
  status: "pending" | "signed";
  signedAt: string | null;
  page: number;
  x: number;
  y: number;
}

export interface SignOff {
  id: number;
  title: string;
  processName: string;
  processId: string;
  processDepartment: string;
  processOwner: string;
  processManager: string;
  version: string;
  effectiveDate: string | null;
  reviewDate: string | null;
  documentStatus: string;
  classification: string;
  categoryDepartmentId: number | null;
  categoryName: string;
  preparerId: number;
  preparerName: string;
  fileName: string;
  contentType: string;
  status: SignOffStatus;
  returnNote: string;
  cycle: number;
  createdAt: string;
  completedAt: string | null;
  steps: SignOffStep[];
  waitingForId: number | null;
  waitingForName: string;
  myTurn: boolean;
  myStepId: number | null;
  isPreparer: boolean;
}

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
}
