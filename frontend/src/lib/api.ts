import type {
  AdminUser,
  Announcement,
  Applicant,
  ApplicantStage,
  AuditEntry,
  ChangeRequest,
  ChecklistItem,
  DashboardData,
  Department,
  DocStatus,
  DocumentRecord,
  Employee,
  EmployeeCreated,
  EmployeeInput,
  EmployeeSummary,
  HireInput,
  Holiday,
  Interview,
  Job,
  JobInput,
  Leave,
  LeaveBalance,
  LeaveReport,
  LeaveSummary,
  StaffLeave,
  MeDashboard,
  Paged,
  Policy,
  ProfileUpdate,
  Reference,
  Role,
  Task,
  TaskInput,
  TaskKind,
  TaskStatus,
  Training,
  TrainingInput,
  TrainingStatus,
  Sponsorship,
  User,
  SignOff,
  AppNotification,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/+$/, "");
const TOKEN_KEY = "sibk_token";

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable */
  }
}
export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_URL}/api${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function handleUnauthorized(path: string): void {
  if (path === "/auth/login" || path === "/auth/change-password") return;
  clearToken();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

async function toError(res: Response, path: string): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let fields: Record<string, string> = {};
  try {
    const data = (await res.json()) as { error?: string; fields?: Record<string, string> };
    if (data.error) message = data.error;
    if (data.fields) fields = data.fields;
  } catch {
    /* non JSON error body */
  }
  if (res.status === 401) handleUnauthorized(path);
  return new ApiError(res.status, message, fields);
}

async function send(path: string, init: RequestInit, query?: Query): Promise<Response> {
  try {
    return await fetch(buildUrl(path, query), init);
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const res = await send(
    path,
    {
      method,
      headers: authHeaders(body !== undefined ? { "Content-Type": "application/json" } : undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    query,
  );
  if (!res.ok) throw await toError(res, path);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** multipart upload helper */
async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await send(path, { method: "POST", headers: authHeaders(), body: form });
  if (!res.ok) throw await toError(res, path);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Fetch a protected binary resource as a Blob (used for images). */
export async function fetchBlob(path: string, query?: Query): Promise<Blob> {
  const res = await send(path, { headers: authHeaders() }, query);
  if (!res.ok) throw await toError(res, path);
  return res.blob();
}

function filenameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get("Content-Disposition") || "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1] : fallback;
}

/** Download a protected file with the bearer token and hand it to the browser. */
export async function downloadFile(path: string, fallbackName: string, query?: Query): Promise<void> {
  const res = await send(path, { headers: authHeaders() }, query);
  if (!res.ok) throw await toError(res, path);
  const blob = await res.blob();
  const name = filenameFrom(res, fallbackName);
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

function norm<T>(list: T[] | null | undefined): T[] {
  return list ?? [];
}
function normPaged<T>(p: Paged<T>): Paged<T> {
  return { items: norm(p?.items), total: p?.total ?? 0 };
}

export type ListQuery = {
  page?: number;
  pageSize?: number;
};

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: User }>("POST", "/auth/login", { email, password }),
    me: () => request<User>("GET", "/auth/me"),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ ok: boolean }>("POST", "/auth/change-password", { currentPassword, newPassword }),
  },
  reference: () => request<Reference>("GET", "/reference"),

  leave: {
    me: () => request<LeaveSummary>("GET", "/me/leave"),
    forEmployee: (id: number) => request<LeaveSummary>("GET", `/employees/${id}/leave`),
    calc: (from: string, to: string) => request<{ days: number; holidays: string[] }>("GET", "/leave/calc", undefined, { from, to }),
    /** Apply for leave. HR passes employeeId to record leave for someone else. */
    apply: (b: { type: string; fromDate: string; toDate: string; reason: string }, file?: File | null, employeeId?: number) => {
      const f = new FormData();
      Object.entries(b).forEach(([k, v]) => v !== undefined && f.append(k, v));
      if (file) f.append("file", file);
      return upload<Leave>(employeeId ? `/employees/${employeeId}/leave` : "/me/leave", f);
    },
    decide: (id: number, decision: "approve" | "reject", comment: string) =>
      request<Leave>("POST", `/leave/${id}/decide`, { decision, comment }),
    cancel: (id: number) => request<Leave>("POST", `/leave/${id}/cancel`),
    /** HR only: removes the request from every report. */
    remove: (id: number) => request<void>("DELETE", `/leave/${id}`),
    attach: (id: number, file: File) => {
      const f = new FormData();
      f.append("file", file);
      return upload<Leave>(`/leave/${id}/attachment`, f);
    },
    downloadNote: (l: { id: number; noteFileName?: string }) => downloadFile(`/leave/${l.id}/attachment`, l.noteFileName || "sick-note"),
    approvals: async () => {
      const r = await request<{ canApprove: boolean; items: Leave[] | null }>("GET", "/leave/approvals");
      return { canApprove: r.canApprove, items: norm(r.items) };
    },
    list: async (q: { status?: string; type?: string; q?: string; employeeId?: number } & ListQuery) =>
      normPaged(await request<Paged<Leave>>("GET", "/leave", undefined, q)),
    report: async (key: string) => {
      const r = await request<LeaveReport>("GET", `/leave-reports/${key}`);
      return { ...r, rows: norm(r.rows) };
    },
    staff: async () => norm(await request<StaffLeave[]>("GET", "/leave/staff")),
    reportList: async () => norm(await request<{ key: string; title: string }[]>("GET", "/leave-reports")),
    /** Download a report as an Excel workbook (.xlsx). */
    exportReport: (key: string) => downloadFile(`/leave-reports/${key}`, `leave-${key}.xlsx`, { format: "xlsx" }),
    updateBalance: (id: number, b: { accruedDays: number; carriedForwardDays: number; doesNotApprove: boolean }) =>
      request<LeaveBalance>("PUT", `/employees/${id}/leave-balance`, b),
    yearEnd: () => request<{ employees: number }>("POST", "/leave/year-end", { confirm: "CARRY FORWARD" }),
    holidays: async () => norm(await request<Holiday[]>("GET", "/holidays")),
    addHoliday: (b: { name: string; date: string; repeatsYearly: boolean }) => request<Holiday>("POST", "/holidays", b),
    removeHoliday: (id: number) => request<void>("DELETE", `/holidays/${id}`),
  },

  departments: {
    list: async () => norm(await request<Department[]>("GET", "/departments")),
    create: (b: { name: string; headId?: number | null }) => request<Department>("POST", "/departments", b),
    update: (id: number, b: { name: string; headId?: number | null }) =>
      request<Department>("PUT", `/departments/${id}`, b),
    remove: (id: number) => request<void>("DELETE", `/departments/${id}`),
  },

  employees: {
    list: async (q: { q?: string; departmentId?: number | string; status?: string } & ListQuery) =>
      normPaged(await request<Paged<EmployeeSummary>>("GET", "/employees", undefined, q)),
    get: (id: number) => request<Employee>("GET", `/employees/${id}`),
    create: (b: EmployeeInput) => request<EmployeeCreated>("POST", "/employees", b),
    update: (id: number, b: Partial<EmployeeInput>) => request<Employee>("PUT", `/employees/${id}`, b),
    uploadPhoto: (id: number, file: File) => {
      const f = new FormData();
      f.append("file", file);
      return upload<{ ok?: boolean }>(`/employees/${id}/photo`, f);
    },
    checklist: async (id: number) =>
      norm(await request<ChecklistItem[]>("GET", `/employees/${id}/documents/checklist`)),
    documents: async (id: number) => norm(await request<DocumentRecord[]>("GET", `/employees/${id}/documents`)),
    uploadDocument: (id: number, file: File, type: string, expiryDate?: string) => {
      const f = new FormData();
      f.append("file", file);
      f.append("type", type);
      if (expiryDate) f.append("expiryDate", expiryDate);
      return upload<DocumentRecord>(`/employees/${id}/documents`, f);
    },
    tasks: async (id: number) => norm(await request<Task[]>("GET", `/employees/${id}/tasks`)),
    directReports: async (id: number) =>
      norm(await request<EmployeeSummary[]>("GET", `/employees/${id}/direct-reports`)),
    training: async (id: number) => norm(await request<Training[]>("GET", `/employees/${id}/training`)),
    startOffboarding: (id: number, exitDate: string) =>
      request<unknown>("POST", `/employees/${id}/offboarding/start`, { exitDate }),
  },

  me: {
    dashboard: () => request<MeDashboard>("GET", "/me/dashboard"),
    profile: () => request<Employee>("GET", "/me/profile"),
    updateProfile: (b: ProfileUpdate) => request<Employee>("PUT", "/me/profile", b),
    documents: async () => norm(await request<ChecklistItem[]>("GET", "/me/documents")),
    uploadDocument: (file: File, type: string, expiryDate?: string) => {
      const f = new FormData();
      f.append("file", file);
      f.append("type", type);
      if (expiryDate) f.append("expiryDate", expiryDate);
      return upload<DocumentRecord>("/me/documents", f);
    },
    requestChange: (b: { field: string; newValue: string; reason?: string }) =>
      request<ChangeRequest>("POST", "/me/change-requests", b),
    changeRequests: async () => norm(await request<ChangeRequest[]>("GET", "/me/change-requests")),
  },

  documents: {
    list: async (q: {
      status?: DocStatus | "";
      type?: string;
      employeeId?: number;
      expiring?: boolean;
    } & ListQuery) =>
      normPaged(
        await request<Paged<DocumentRecord>>("GET", "/documents", undefined, {
          ...q,
          expiring: q.expiring ? 1 : undefined,
        }),
      ),
    verify: (id: number) => request<DocumentRecord>("POST", `/documents/${id}/verify`),
    reject: (id: number, reason: string) => request<DocumentRecord>("POST", `/documents/${id}/reject`, { reason }),
    remove: (id: number) => request<void>("DELETE", `/documents/${id}`),
    download: (d: { id: number; fileName: string }) => downloadFile(`/documents/${d.id}/download`, d.fileName),
  },

  jobs: {
    list: async (status?: string) => norm(await request<Job[]>("GET", "/jobs", undefined, { status })),
    create: (b: JobInput) => request<Job>("POST", "/jobs", b),
    update: (id: number, b: JobInput) => request<Job>("PUT", `/jobs/${id}`, b),
  },

  applicants: {
    list: async (q: { jobId?: number | string; stage?: string; q?: string }) =>
      norm(await request<Applicant[]>("GET", "/applicants", undefined, q)),
    create: (
      b: { fullName: string; email: string; phone?: string; jobId?: number | null; source?: string; notes?: string },
      cv?: File | null,
    ) => {
      if (cv) {
        const f = new FormData();
        Object.entries(b).forEach(([k, v]) => {
          if (v !== undefined && v !== null) f.append(k, String(v));
        });
        f.append("cv", cv);
        return upload<Applicant>("/applicants", f);
      }
      return request<Applicant>("POST", "/applicants", b);
    },
    update: (id: number, b: Partial<Pick<Applicant, "fullName" | "email" | "phone" | "source" | "notes" | "rating" | "jobId">>) =>
      request<Applicant>("PUT", `/applicants/${id}`, b),
    setStage: (id: number, stage: ApplicantStage, note?: string) =>
      request<Applicant>("POST", `/applicants/${id}/stage`, { stage, note }),
    hire: (id: number, b: HireInput) => request<Employee>("POST", `/applicants/${id}/hire`, b),
    downloadCv: (id: number, name: string) => downloadFile(`/applicants/${id}/cv`, `${name} CV`),
    interviews: async (id: number) => norm(await request<Interview[]>("GET", `/applicants/${id}/interviews`)),
    addInterview: (
      id: number,
      b: { scheduledAt: string; mode: string; panel: string; notes?: string; score?: number | null },
    ) => request<Interview>("POST", `/applicants/${id}/interviews`, b),
  },

  signoffs: {
    list: async (q: { box: string; category?: string; q?: string; employeeId?: number }) => norm(await request<SignOff[]>("GET", "/signoffs", undefined, q)),
    get: (id: number) => request<SignOff>("GET", `/signoffs/${id}`),
    summary: () => request<{ awaiting: number }>("GET", "/signoffs/summary"),
    signers: async () => norm(await request<{ employeeId: number; name: string; email: string }[]>("GET", "/signoffs/signers")),
    create: (form: FormData) => upload<SignOff>("/signoffs", form),
    resubmit: (id: number, form: FormData) => upload<SignOff>(`/signoffs/${id}/resubmit`, form),
    sign: (id: number, b: { page: number; x: number; y: number }) => request<SignOff>("POST", `/signoffs/${id}/sign`, b),
    reject: (id: number, reason: string) => request<SignOff>("POST", `/signoffs/${id}/reject`, { reason }),
    returnForCorrection: (id: number, reason: string) => request<SignOff>("POST", `/signoffs/${id}/return`, { reason }),
    remove: (id: number) => request<void>("DELETE", `/signoffs/${id}`),
    filePath: (id: number) => `/signoffs/${id}/file`,
  },
  notifications: {
    list: () => request<{ unread: number; items: AppNotification[] }>("GET", "/notifications"),
    read: (id: number) => request<void>("POST", `/notifications/${id}/read`),
    readAll: () => request<void>("POST", "/notifications/read-all"),
  },
  training: {
    mine: async () => norm(await request<Training[]>("GET", "/me/training")),
    create: (b: Omit<TrainingInput, "endDate"> & { endDate?: string }) => request<Training>("POST", "/me/training", b),
    list: async (q: { sponsorship?: string; status?: string }) => norm(await request<Training[]>("GET", "/training", undefined, q)),
    update: (id: number, b: Partial<TrainingInput> & { status?: TrainingStatus }) => request<Training>("PUT", `/training/${id}`, b),
    addUpdate: (id: number, b: { note: string; sponsorship: Sponsorship; amount?: number; status?: TrainingStatus }) =>
      request<Training>("POST", `/training/${id}/updates`, b),
    remove: (id: number) => request<void>("DELETE", `/training/${id}`),
  },
  tasks: {
    list: async (q: { employeeId?: number; kind?: TaskKind; status?: string; ownerRole?: string; mine?: boolean }) =>
      norm(await request<Task[]>("GET", "/tasks", undefined, { ...q, mine: q.mine ? 1 : undefined })),
    create: (b: TaskInput) => request<Task>("POST", "/tasks", b),
    update: (id: number, b: Partial<TaskInput> & { status?: TaskStatus }) => request<Task>("PUT", `/tasks/${id}`, b),
    remove: (id: number) => request<void>("DELETE", `/tasks/${id}`),
  },

  changeRequests: {
    list: async (status?: string) =>
      norm(await request<ChangeRequest[]>("GET", "/change-requests", undefined, { status })),
    decide: (id: number, approve: boolean, note?: string) =>
      request<ChangeRequest>("POST", `/change-requests/${id}/decide`, { approve, note }),
  },

  announcements: {
    list: async () => norm(await request<Announcement[]>("GET", "/announcements")),
    create: (b: { title: string; body: string; pinned?: boolean }) =>
      request<Announcement>("POST", "/announcements", b),
    remove: (id: number) => request<void>("DELETE", `/announcements/${id}`),
  },
  policies: {
    list: async () => norm(await request<Policy[]>("GET", "/policies")),
    create: (b: { title: string; version: string; effectiveDate: string; file: File }) => {
      const f = new FormData();
      f.append("title", b.title);
      f.append("version", b.version);
      f.append("effectiveDate", b.effectiveDate);
      f.append("file", b.file);
      return upload<Policy>("/policies", f);
    },
    download: (p: Policy) => downloadFile(`/policies/${p.id}/download`, p.fileName),
  },

  dashboard: () => request<DashboardData>("GET", "/dashboard"),
  reports: {
    download: (name: "employees" | "documents-compliance" | "headcount") =>
      downloadFile(`/reports/${name}.csv`, `${name}.csv`),
  },

  users: {
    list: async () => norm(await request<AdminUser[]>("GET", "/users")),
    create: (b: { email: string; name: string; role: Role; employeeId?: number | null; password?: string }) =>
      request<AdminUser>("POST", "/users", b),
    update: (id: number, b: { role?: Role; active?: boolean; name?: string }) =>
      request<AdminUser>("PUT", `/users/${id}`, b),
    resetPassword: (id: number) => request<{ temporaryPassword: string }>("POST", `/users/${id}/reset-password`),
  },
  audit: async (q: { entity?: string; actor?: string; action?: string } & ListQuery) =>
    normPaged(await request<Paged<AuditEntry>>("GET", "/audit", undefined, q)),
};
