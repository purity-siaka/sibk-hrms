import { readFileSync } from "node:fs";
// Development-only mock of the SIBK HRMS API (docs/API.md) so the UI can be run without Go/Postgres.
// Usage: node dev/mock-api.mjs   (listens on :8080). Not used in production.
import http from "node:http";

const PORT = Number(process.env.PORT || 8080);
const iso = (d) => d.toISOString().slice(0, 10);
const ago = (n) => iso(new Date(Date.now() - n * 864e5));
const ahead = (n) => iso(new Date(Date.now() + n * 864e5));

const deptNames = ["Executive Management", "Legal & Compliance", "Finance", "Risk & AML", "ICT", "Public Relations & Communications", "Human Resources", "Administration"];
const people = [
  ["Saad Rahman", "CEO", 0, "saad.rahman", 1700, "active"], ["Saadia Omar Shurie", "Legal & Compliance Manager", 1, "saadia.omar", 1200, "active"],
  ["Daniel Mwenga", "Paralegal", 1, "daniel.mwenga", 520, "active"], ["Geoffrey Aricha", "Accountant", 2, "geoffrey.michael", 900, "active"],
  ["Lucy Wairimu", "Risk & AML Manager", 3, "lucy.wairimu", 1000, "active"], ["Nicholas Kiganya", "Finance Manager", 2, "nicholas.kiganya", 1300, "active"],
  ["Dennis Muasya", "Software Developer", 4, "dennis.muasya", 400, "active"], ["Purity Siaka", "Intern, Software Developer", 4, "purity.siaka", 75, "probation"],
  ["Moses Ngige", "Junior Analyst", null, "moses.ngige", 40, "probation"], ["Abdirahman Mohamed", "ICT Manager", 4, "murshid", 1500, "active"],
  ["Mohamed Abdullahi", "Public Relations & Communications Manager", 5, "mohamed.ali", 800, "active"], ["Caroline Mathai", "HR/Operations Officer", 6, "carol.mathai", 1100, "active"],
  ["Oscar Namawa", "Senior Cleaning & Hospitality Officer", 7, "", 1400, "active"], ["Peter Odhiambo", "Cleaning & Hospitality Officer", 7, "", 700, "active"],
  ["Juma Ismail", "Admin Assistant", 7, "", 350, "active"], ["Gerishon Chanzu", "Admin, Salaam 45", 7, "", 200, "active"],
];
const departments = deptNames.map((name, i) => ({ id: i + 1, name, headId: null, headName: "", employeeCount: people.filter((p) => p[2] === i).length }));
const employees = people.map((p, i) => {
  const [first, ...rest] = p[0].split(" ");
  return {
    id: i + 1, employeeNo: `SIBK-${String(i + 1).padStart(4, "0")}`, fullName: p[0], firstName: first, lastName: rest.join(" "),
    email: p[3] ? `${p[3]}@salaaminvestments.com` : "", phone: "+254 700 000 0" + String(10 + i), jobTitle: p[1],
    departmentId: p[2] === null ? null : p[2] + 1, departmentName: p[2] === null ? "" : deptNames[p[2]], status: p[5],
    employmentType: "permanent", startDate: ago(p[4]), hasPhoto: i % 2 === 0, managerId: i === 0 ? null : 1, managerName: i === 0 ? "" : "Saad Rahman",
    probationEndDate: p[5] === "probation" ? ahead(20) : null, probationExtended: false, contractEndDate: null, exitDate: null, gender: i % 3 ? "female" : "male",
    nationality: "Kenyan", address: "Nairobi", emergencyContactName: "Next of kin", emergencyContactPhone: "+254 711 000 000", emergencyContactRelation: "Spouse",
    documentsVerified: i % 5, documentsRequired: 7, createdAt: new Date().toISOString(), dateOfBirth: "1992-04-12",
    nationalIdNo: "3" + String(1000000 + i * 7919), kraPin: "A00" + (1234567 + i) + "Z", nssfNo: "NSSF" + (700 + i), shaNo: "SHA" + (900 + i), bankName: "Salaam Bank", bankAccount: "0100" + (55500 + i),
  };
});
const docTypes = [["cv", "Curriculum Vitae (CV)", 1], ["academic_certificate", "Academic Certificate", 1], ["professional_certificate", "Professional Certificate", 0], ["good_conduct", "Certificate of Good Conduct", 1], ["national_id", "National ID / Passport", 1], ["kra_pin", "KRA PIN Certificate", 1], ["passport_photo", "Passport Photo", 1], ["contract", "Employment Contract", 1], ["nssf", "NSSF Registration", 0], ["sha", "SHA Registration", 0], ["other", "Other", 0]];
const docs = [];
let did = 1;
for (const e of employees.slice(0, 8)) {
  docTypes.slice(0, 3 + (e.id % 4)).forEach(([key, label], k) => docs.push({ id: did++, employeeId: e.id, employeeName: e.fullName, type: key, typeLabel: label, fileName: `${key}.pdf`, contentType: "application/pdf", size: 180000 + k * 9000, status: k % 3 === 0 ? "verified" : k % 3 === 1 ? "pending" : "rejected", expiryDate: key === "good_conduct" ? ahead(25 + e.id) : null, uploadedAt: new Date(Date.now() - k * 864e5 * 3).toISOString(), verifiedByName: k % 3 === 0 ? "Caroline Mathai" : "", verifiedAt: null, rejectionReason: k % 3 === 2 ? "The scan is blurred, please upload a clearer copy." : "" }));
}
const jobs = [
  { id: 1, title: "Investment Analyst", departmentId: 3, departmentName: "Finance", headcount: 1, status: "open", location: "Nairobi", description: "Support fund analysis.", closingDate: ahead(20), applicantCount: 3, createdAt: new Date().toISOString() },
  { id: 2, title: "Compliance Officer", departmentId: 2, departmentName: "Legal & Compliance", headcount: 1, status: "open", location: "Nairobi", description: "", closingDate: null, applicantCount: 2, createdAt: new Date().toISOString() },
];
const stages = ["applied", "screening", "interview", "assessment", "offer", "hired", "rejected"];
const applicants = [["Amina Hassan", 1, "interview", 4], ["Brian Otieno", 1, "screening", 3], ["Faith Wanjiru", 1, "applied", 0], ["Kevin Mutua", 2, "offer", 5], ["Zainab Ali", 2, "assessment", 4]].map((a, i) => ({ id: i + 1, jobId: a[1], jobTitle: jobs[a[1] - 1].title, fullName: a[0], email: a[0].toLowerCase().replace(" ", ".") + "@example.com", phone: "", stage: a[2], source: "LinkedIn", rating: a[3], notes: "", hasCv: i % 2 === 0, createdAt: new Date().toISOString(), stageChangedAt: new Date().toISOString(), employeeId: null }));
const mkTask = (id, e, t, owner, due, status) => ({ id, employeeId: e.id, employeeName: e.fullName, kind: "onboarding", title: t, ownerRole: owner, mandatory: true, dueDate: due, status, completedAt: null, completedByName: "", notes: "", overdue: false });
const tasks = [
  { id: 1, employeeId: 8, employeeName: "Purity Siaka", kind: "onboarding", title: "Issue laptop", ownerRole: "it", dueDate: "2026-12-05", status: "pending", completedAt: null, completedByName: "", notes: "" },
  { id: 2, employeeId: 4, employeeName: "Geoffrey Aricha", kind: "offboarding", title: "Return access card", ownerRole: "hr", dueDate: "2026-11-20", status: "pending", completedAt: null, completedByName: "", notes: "" },
];
const notes = [];
const notify = (employeeId, title, body, soId) => notes.push({ id: notes.length + 1, employeeId, kind: "signoff_turn", title, body, link: "/signoffs?open=" + soId, readAt: null, createdAt: new Date().toISOString() });
const signoffs = [];
const soView = (so, me) => { const cur = so.status === "in_progress" ? so.steps.find((t) => t.status === "pending") : null; return { ...so, waitingForId: cur ? cur.employeeId : null, waitingForName: cur ? cur.name : "", myTurn: !!cur && cur.employeeId === me.employeeId, myStepId: cur && cur.employeeId === me.employeeId ? cur.id : null, isPreparer: so.preparerId === me.employeeId }; };
const TV = (id, employeeId, title, startDate, sponsorship, provider) => ({ id, employeeId, employeeName: (employees.find((e) => e.id === employeeId) || {}).fullName || "", title, provider, startDate, endDate: null, sponsorship, status: "upcoming", notes: "", sibkAmount: 0, selfAmount: 0, updates: [], canEdit: true });
const trainings = [];
employees.slice(7, 9).forEach((e, k) => ["Create email and system accounts", "Issue laptop and access card", "Register for payroll, NSSF and SHA", "Induction and team introduction"].forEach((t, i) => tasks.push(mkTask(tasks.length + 1, e, t, ["it", "it", "finance", "line_manager"][i], ago(10 - i * 5), i < 2 ? "done" : "pending"))));
const users = [
  { id: 1, email: "carol.mathai@salaaminvestments.com", name: "Caroline Mathai", role: "hr_admin", employeeId: 12, active: true, mustChangePassword: false, lastLoginAt: new Date().toISOString() },
  { id: 2, email: "saadia.omar@salaaminvestments.com", name: "Saadia Omar Shurie", role: "manager", employeeId: 2, active: true, mustChangePassword: false, lastLoginAt: null },
  { id: 3, email: "dennis.muasya@salaaminvestments.com", name: "Dennis Muasya", role: "employee", employeeId: 7, active: true, mustChangePassword: false, lastLoginAt: null },
  { id: 4, email: "nicholas.kiganya@salaaminvestments.com", name: "Nicholas Kiganya", role: "manager", employeeId: 6, active: true, mustChangePassword: false, lastLoginAt: null },
];
const anns = [{ id: 1, title: "Welcome to the SIBK HR Management System", body: "Please sign in, check your profile and upload your required documents.", createdByName: "Caroline Mathai", createdAt: new Date().toISOString(), pinned: true }];

const bal = { 8: [21, 0, 6], 7: [7, 0, 0], 12: [11, 0, 0], 6: [11, 0, 0], 4: [8, 0, 2], 9: [4, 0, 2], 10: [8, 0, 0], 11: [0, 0, 0] };
const L = (id, emp, type, from, to, days, status, approver, by, comment, extra = {}) => ({ id, employeeId: emp, employeeName: employees[emp - 1].fullName, type, typeLabel: type[0].toUpperCase() + type.slice(1), fromDate: from, toDate: to, days, reason: "Personal matters", status, approverType: "manager", approverName: approver, daysRemainingAtRequest: 8, decidedByName: by, decidedAt: by ? new Date().toISOString() : null, comment, hasNote: false, needsNote: false, createdAt: new Date().toISOString(), canDecide: false, canCancel: status === "pending", canAttach: false, ...extra });
trainings.push(TV(1, 5, "AML/CFT Refresher Course", "2026-12-01", "sibk", "Kenya Bankers Association"));
const leaves = [
  L(1, 8, "study", "2026-11-04", "2026-11-11", 6, "rejected", "Nicholas Kiganya", "Nicholas Kiganya", "Request under the normal annual leave."),
  L(2, 8, "annual", "2026-11-04", "2026-11-11", 6, "approved", "Nicholas Kiganya", "Nicholas Kiganya", "Ok"),
  L(3, 12, "annual", "2026-11-09", "2026-11-16", 6, "pending", "Saad Rahman", "", "", { approverType: "ceo" }),
  L(4, 10, "annual", "2026-11-18", "2026-11-18", 1, "pending", "HR", "", "", { approverType: "hr" }),
  L(5, 4, "annual", "2026-11-13", "2026-11-16", 2, "approved", "Nicholas Kiganya", "Nicholas Kiganya", "ok"),
  L(6, 9, "annual", "2026-11-20", "2026-11-23", 2, "approved", "Nicholas Kiganya", "Nicholas Kiganya", "ok"),
  L(7, 7, "study", "2026-11-23", "2026-11-26", 4, "approved", "Nicholas Kiganya", "Nicholas Kiganya", "Approved."),
  L(8, 9, "sick", "2026-12-01", "2026-12-04", 4, "pending", "Nicholas Kiganya", "", "", { needsNote: true, canAttach: true }),
];
const balanceOf = (id) => { const b = bal[id] || [0, 0, 0]; const pend = leaves.filter((l) => l.employeeId === id && l.type === "annual" && l.status === "pending").reduce((a, l) => a + l.days, 0); return { accruedDays: b[0], carriedForwardDays: b[1], takenDays: b[2], pendingDays: pend, remainingDays: b[0] + b[1] - b[2], availableDays: b[0] + b[1] - b[2] - pend, doesNotApprove: false }; };
const forMe = (me, l) => ({ ...l, canDecide: l.status === "pending" && ((l.approverType === "hr" && me.role.startsWith("hr")) || l.approverName === me.name) && l.employeeId !== me.employeeId });
const wdays = (a, b) => { let n = 0; for (let d = new Date(a); d <= new Date(b); d.setDate(d.getDate() + 1)) if (d.getDay() % 6) n++; return n; };
const holidaysList = [["Mashujaa Day", "2026-10-20", true], ["Jamhuri Day", "2026-12-12", true], ["Christmas Day", "2026-12-25", true], ["Boxing Day", "2026-12-26", true]].map((h, i) => ({ id: i + 1, name: h[0], date: h[1], repeatsYearly: h[2] }));
const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Allow-Headers": "Authorization,Content-Type", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const userFor = (req) => { const m = /^Bearer mock-(\d+)$/.exec(req.headers.authorization || ""); return m ? users.find((u) => u.id === Number(m[1])) : null; };
const summary = (e) => e;
const checklist = (id) => docTypes.map(([key, label, req]) => ({ type: key, label, required: !!req, document: docs.filter((d) => d.employeeId === id && d.type === key)[0] || null }));
const svg = (e) => `<svg xmlns="http://www.w3.org/2000/svg" width="148" height="184"><rect width="148" height="184" fill="${e.id % 4 ? "#E3E9FB" : "#F6EDD6"}"/><circle cx="74" cy="72" r="32" fill="#1B2F7A" opacity=".85"/><path d="M14 184c0-40 26-62 60-62s60 22 60 62z" fill="#1B2F7A" opacity=".85"/></svg>`;

http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body = {};
    try { body = raw && !String(req.headers["content-type"]).startsWith("multipart") ? JSON.parse(raw) : {}; } catch { /* ignore */ }
    if (p === "/healthz") return send(res, 200, { status: "ok" });
    if (p === "/api/auth/login") {
      const u = users.find((x) => x.email === String(body.email).toLowerCase());
      if (!u || !body.password) return send(res, 401, { error: "incorrect email or password" });
      return send(res, 200, { token: `mock-${u.id}`, user: u });
    }
    const me = userFor(req);
    if (!me) return send(res, 401, { error: "sign in to continue" });
    const q = (k) => url.searchParams.get(k) || "";
    let m;
    if (p === "/api/me/leave" && req.method === "POST") { leaves.push(L(leaves.length + 1, me.employeeId, "annual", "2026-12-14", "2026-12-15", 2, "pending", "Nicholas Kiganya", "", "")); return send(res, 201, leaves[leaves.length - 1]); }
    if (p === "/api/me/leave") { const approvals = leaves.filter((l) => forMe(me, l).canDecide); return send(res, 200, { balance: balanceOf(me.employeeId), requests: leaves.filter((l) => l.employeeId === me.employeeId).map((l) => forMe(me, l)), canApprove: me.role !== "employee", pendingApprovals: approvals.length, upcomingHolidays: holidaysList.slice(1, 3) }); }
    if ((m = /^\/api\/employees\/(\d+)\/leave$/.exec(p)) && req.method === "GET") return send(res, 200, { balance: balanceOf(+m[1]), requests: leaves.filter((l) => l.employeeId === +m[1]).map((l) => forMe(me, l)), canApprove: false, pendingApprovals: 0 });
    if (p === "/api/leave/staff") { const mine = me.role === "manager" ? employees.filter((e) => e.managerId === me.employeeId) : employees; return send(res, 200, mine.map((e) => { const b = balanceOf(e.id); const mineL = leaves.filter((l) => l.employeeId === e.id); const sum = (t, st) => mineL.filter((l) => l.type === t && l.status === st).reduce((n, l) => n + l.days, 0); const pend = mineL.filter((l) => l.status === "pending"); return { employeeId: e.id, fullName: e.fullName, jobTitle: e.jobTitle, managerName: e.managerName, broughtForwardDays: 2, accruedDays: b.accruedDays, takenDays: b.takenDays, remainingDays: b.remainingDays, sickDays: sum("sick", "approved"), otherDays: 0, pendingRequests: pend.length, pendingDays: pend.reduce((n, l) => n + l.days, 0), outNow: e.id === 7, outNowReason: e.id === 7 ? "Study" : "", carriedForwardDays: Math.max(0, b.remainingDays) }; })); }
    if (p === "/api/leave-reports") return send(res, 200, (me.role === "manager" ? ["full", "pending", "upcoming", "out-now", "balances"] : ["full", "pending", "upcoming", "out-now", "balances", "audit", "sick-no-note"]).map((k) => ({ key: k, title: { full: "Full leave report", pending: "Pending approvals", upcoming: "Upcoming leave (90 days)", "out-now": "Who's out now", balances: "Leave balances", audit: "Approval audit trail", "sick-no-note": "Sick leave without note" }[k] })));
    if ((m = /^\/api\/leave-reports\/([a-z-]+)$/.exec(p))) { if (q("format")) { res.writeHead(200, { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename=leave-${m[1]}.xlsx`, "Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Expose-Headers": "Content-Disposition" }); return res.end("PK"); } if (m[1] === "full") return send(res, 200, { key: "full", title: "Full leave report", columns: ["Employee", "Position", "Manager", "Type", "From", "To", "Days", "Status", "Employee's reason", "Decided by", "Manager's comment", "Decided on", "Requested on", "Days left before request"], rows: leaves.map((l) => [l.employeeName, "Intern", l.approverName, l.typeLabel, l.fromDate, l.toDate, String(l.days), l.status, l.reason || "", l.decidedByName || "", l.comment || "", "", "2026-11-19", "15"]) }); if (m[1] === "balances") return send(res, 200, { key: "balances", title: "Leave balances", columns: ["Employee", "Position", "Manager", "Brought forward", "Accrued", "Annual taken", "Annual remaining", "Sick days", "Other leave days", "Pending days", "Carried forward to 2027"], rows: employees.slice(0, 6).map((e) => [e.fullName, e.jobTitle, e.managerName || "", "2", "21", "6", "17", "0", "0", "0", "17"]) }); const cols = { "out-now": ["Employee", "Type", "From", "To", "Days", "Back on"], pending: ["Employee", "Type", "From", "To", "Days", "Employee's reason", "Waiting for", "Requested on"] }[m[1]] || ["Employee", "Type", "From", "To", "Days"]; const rows = leaves.filter((l) => m[1] !== "pending" || l.status === "pending").map((l) => [l.employeeName, l.typeLabel, l.fromDate, l.toDate, String(l.days), ...(m[1] === "pending" ? [l.reason || "", l.approverName, "2026-11-19"] : m[1] === "out-now" ? ["2026-11-27"] : [])].slice(0, cols.length)); return send(res, 200, { key: m[1], title: m[1], columns: cols, rows }); }
    if (p === "/api/leave/calc") return send(res, 200, { days: wdays(q("from"), q("to")), holidays: [] });
    if (p === "/api/leave/approvals") return send(res, 200, { canApprove: me.role !== "employee", items: leaves.map((l) => forMe(me, l)).filter((l) => l.canDecide) });
    if (p === "/api/leave" && req.method === "GET") { const l = leaves.filter((x) => (!q("status") || x.status === q("status")) && (!q("type") || x.type === q("type")) && (!q("q") || x.employeeName.toLowerCase().includes(q("q").toLowerCase()))).map((x) => forMe(me, x)); return send(res, 200, { items: l, total: l.length }); }
    if ((m = /^\/api\/leave\/(\d+)\/(decide|cancel|attachment)$/.exec(p)) && req.method === "POST") { const l = leaves.find((x) => x.id === +m[1]); if (m[2] === "decide") { l.status = body.decision === "approve" ? "approved" : "rejected"; l.decidedByName = me.name; l.comment = body.comment || ""; l.decidedAt = new Date().toISOString(); } if (m[2] === "cancel") l.status = "cancelled"; if (m[2] === "attachment") { l.hasNote = true; l.needsNote = false; l.noteFileName = "note.pdf"; } return send(res, 200, forMe(me, l)); }
    if (p === "/api/leave/year-end") return send(res, 200, { employees: 16 });
    if (p === "/api/holidays") return send(res, 200, holidaysList);
    if (p === "/api/auth/me") return send(res, 200, me);
    if (p === "/api/reference") return send(res, 200, { documentTypes: docTypes.map(([key, label, required]) => ({ key, label, required: !!required })), employmentTypes: ["permanent", "fixed_term", "temporary", "intern"], employeeStatuses: ["probation", "active", "on_notice", "exited"], applicantStages: stages, ownerRoles: ["hr", "it", "finance", "line_manager"], leaveTypes: ["annual", "sick", "study", "maternity", "paternity", "compassionate", "unpaid"].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1) })) });
    if (p === "/api/departments") return send(res, 200, departments);
    if (p === "/api/employees") {
      let list = employees.filter((e) => (!q("q") || (e.fullName + e.jobTitle + e.email).toLowerCase().includes(q("q").toLowerCase())) && (!q("departmentId") || String(e.departmentId) === q("departmentId")) && (!q("status") || e.status === q("status")));
      if (me.role === "manager") list = list.filter((e) => e.managerId === me.employeeId);
      return send(res, 200, { items: list.map(summary), total: list.length });
    }
    if ((m = /^\/api\/employees\/(\d+)$/.exec(p))) { const e = employees.find((x) => x.id === +m[1]); return e ? send(res, 200, e) : send(res, 404, { error: "employee not found" }); }
    if ((m = /^\/api\/employees\/(\d+)\/photo$/.exec(p))) { const e = employees.find((x) => x.id === +m[1]); if (e && e.hasPhoto) { res.writeHead(200, { "Content-Type": "image/svg+xml", "Access-Control-Allow-Origin": "http://localhost:3000" }); return res.end(svg(e)); } return send(res, 404, { error: "photo not found" }); }
    if ((m = /^\/api\/employees\/(\d+)\/documents\/checklist$/.exec(p))) return send(res, 200, checklist(+m[1]));
    if ((m = /^\/api\/employees\/(\d+)\/tasks$/.exec(p))) return send(res, 200, tasks.filter((t) => t.employeeId === +m[1]));
    if ((m = /^\/api\/employees\/(\d+)\/direct-reports$/.exec(p))) return send(res, 200, employees.filter((e) => e.managerId === +m[1]));
    if (p === "/api/me/dashboard") { const e = employees.find((x) => x.id === me.employeeId) || employees[0]; return send(res, 200, { employee: e, documentsUploaded: 4, documentsRequired: 7, documentsPending: 2, openTasks: 1, announcements: anns }); }
    if (p === "/api/me/profile") return send(res, 200, employees.find((x) => x.id === me.employeeId) || employees[0]);
    if (p === "/api/me/documents") return send(res, 200, checklist(me.employeeId || 1));
    if (p === "/api/me/change-requests") return send(res, 200, []);
    if (p === "/api/documents") { let l = docs.filter((d) => (!q("status") || d.status === q("status")) && (!q("type") || d.type === q("type")) && (!q("expiring") || d.expiryDate)); return send(res, 200, { items: l, total: l.length }); }
    if (p === "/api/jobs") return send(res, 200, jobs);
    if (p === "/api/applicants") return send(res, 200, applicants.filter((a) => !q("jobId") || String(a.jobId) === q("jobId")));
    if (/^\/api\/applicants\/\d+\/interviews$/.test(p)) return send(res, 200, []);
    if ((m = /^\/api\/signoffs\/(\d+)\/file$/.exec(p))) { res.writeHead(200, { "Content-Type": "application/pdf", "Access-Control-Allow-Origin": "http://localhost:3000" }); return res.end(readFileSync(new URL("./sample.pdf", import.meta.url))); }
    if (p === "/api/notifications" ) { const mine = notes.filter((n) => n.employeeId === me.employeeId).reverse(); return send(res, 200, { unread: mine.filter((n) => !n.readAt).length, items: mine }); }
    if (p === "/api/notifications/read-all") { notes.forEach((n) => { if (n.employeeId === me.employeeId) n.readAt = new Date().toISOString(); }); res.writeHead(204, { "Access-Control-Allow-Origin": "http://localhost:3000" }); return res.end(); }
    if ((m = /^\/api\/notifications\/(\d+)\/read$/.exec(p))) { const n = notes.find((x) => x.id === +m[1]); if (n) n.readAt = new Date().toISOString(); res.writeHead(204, { "Access-Control-Allow-Origin": "http://localhost:3000" }); return res.end(); }
    if (p === "/api/signoffs/summary") return send(res, 200, { awaiting: signoffs.filter((x) => soView(x, me).myTurn).length });
    if (p === "/api/signoffs/signers") return send(res, 200, users.filter((u) => u.employeeId).map((u) => ({ employeeId: u.employeeId, name: u.name, email: u.email })));
    if (p === "/api/signoffs" && req.method === "POST") {
      const field = (k) => { const r = new RegExp(`name="${k}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`).exec(raw); return r ? r[1] : ""; };
      const signers = JSON.parse(field("signers") || "[]").map((g, i) => { const u = users.find((x) => x.email === g.email); return { id: i + 1, position: i + 1, employeeId: u.employeeId, name: u.name, email: u.email, label: g.label, status: "pending", signedAt: null, page: 0, x: 0, y: 0 }; });
      const dept = departments.find((d) => String(d.id) === field("categoryDepartmentId"));
      const so = { id: signoffs.length + 1, title: field("title"), processName: field("processName"), processId: field("processId"), processDepartment: field("processDepartment"), processOwner: field("processOwner"), processManager: field("processManager"), version: field("version"), effectiveDate: field("effectiveDate") || null, reviewDate: field("reviewDate") || null, documentStatus: field("documentStatus"), classification: field("classification"), categoryDepartmentId: dept ? dept.id : null, categoryName: dept ? dept.name : "", preparerId: me.employeeId, preparerName: me.name, fileName: "document.pdf", contentType: "application/pdf", status: "in_progress", returnNote: "", cycle: 1, createdAt: new Date().toISOString(), completedAt: null, steps: signers };
      signoffs.push(so); notify(signers[0].employeeId, "Please sign: " + so.title, "From " + me.name, so.id); return send(res, 201, soView(so, me));
    }
    if (p === "/api/signoffs") { const box = q("box"); const l = signoffs.map((x) => soView(x, me)).filter((x) => box === "all" ? true : box === "inbox" ? x.myTurn : box === "sent" ? x.isPreparer && x.status !== "completed" : x.status === "completed" && (x.isPreparer || x.steps.some((t) => t.employeeId === me.employeeId && t.status === "signed")) || false).filter((x) => !q("category") || x.categoryName === q("category")); return send(res, 200, l); }
    if ((m = /^\/api\/signoffs\/(\d+)\/(sign|reject|return|resubmit)$/.exec(p)) && req.method === "POST") {
      const so = signoffs.find((x) => x.id === +m[1]); const v = soView(so, me); if (!v.myTurn && m[2] !== "resubmit") return send(res, 409, { error: "it is not your turn to sign this document" });
      const step = so.steps.find((t) => t.status === "pending");
      if (m[2] === "sign") { Object.assign(step, { status: "signed", signedAt: new Date().toISOString(), page: body.page, x: body.x, y: body.y }); const next = so.steps.find((t) => t.status === "pending"); if (next) notify(next.employeeId, "Please sign: " + so.title, "From " + so.preparerName, so.id); else { so.status = "completed"; so.completedAt = new Date().toISOString(); notify(so.preparerId, "Everyone has signed: " + so.title, "The document has been archived.", so.id); } }
      if (m[2] === "reject" || m[2] === "return") { so.status = m[2] === "reject" ? "rejected" : "returned"; so.returnNote = step.name + ": " + body.reason; notify(so.preparerId, step.name + " " + (m[2] === "reject" ? "rejected" : "returned for correction") + ": " + so.title, body.reason, so.id); }
      return send(res, 200, soView(so, me));
    }
    if ((m = /^\/api\/signoffs\/(\d+)$/.exec(p))) { const i = signoffs.findIndex((x) => x.id === +m[1]); if (req.method === "DELETE") { signoffs.splice(i, 1); res.writeHead(204, { "Access-Control-Allow-Origin": "http://localhost:3000" }); return res.end(); } return send(res, 200, soView(signoffs[i], me)); }
    if (p === "/api/tasks" && req.method === "POST") { const e = employees.find((x) => x.id === body.employeeId); const t = { id: tasks.length + 1, employeeId: body.employeeId, employeeName: e ? e.fullName : "", kind: body.kind, title: body.title, ownerRole: body.ownerRole || "hr", dueDate: body.dueDate || null, status: "pending", completedAt: null, completedByName: "", notes: body.notes || "" }; tasks.push(t); return send(res, 201, t); }
    if ((m = /^\/api\/tasks\/(\d+)$/.exec(p))) { const i = tasks.findIndex((x) => x.id === +m[1]); if (req.method === "DELETE") { tasks.splice(i, 1); res.writeHead(204, { "Access-Control-Allow-Origin": "http://localhost:3000" }); return res.end(); } if (req.method === "PUT") { Object.assign(tasks[i], body); if (body.employeeId) { const e = employees.find((x) => x.id === body.employeeId); if (e) tasks[i].employeeName = e.fullName; } if (body.status === "done") tasks[i].completedByName = me.name; return send(res, 200, tasks[i]); } }
    if ((m = /^\/api\/leave\/(\d+)$/.exec(p)) && req.method === "DELETE") { const i = leaves.findIndex((x) => x.id === +m[1]); if (i >= 0) leaves.splice(i, 1); res.writeHead(204, { "Access-Control-Allow-Origin": "http://localhost:3000" }); return res.end(); }
    if (p === "/api/me/training" && req.method === "POST") { const t = TV(trainings.length + 1, me.employeeId, body.title, body.startDate, body.sponsorship, body.provider || ""); trainings.push(t); return send(res, 201, t); }
    if (p === "/api/me/training") return send(res, 200, trainings.filter((t) => t.employeeId === me.employeeId));
    if ((m = /^\/api\/employees\/(\d+)\/training$/.exec(p))) return send(res, 200, trainings.filter((t) => t.employeeId === +m[1]));
    if (p === "/api/training") return send(res, 200, trainings.filter((t) => (!q("sponsorship") || t.sponsorship === q("sponsorship")) && (!q("status") || t.status === q("status"))));
    if ((m = /^\/api\/training\/(\d+)\/updates$/.exec(p))) { const t = trainings.find((x) => x.id === +m[1]); t.sponsorship = body.sponsorship; if (body.status) t.status = body.status; if (body.amount) t[body.sponsorship === "sibk" ? "sibkAmount" : "selfAmount"] += body.amount; t.updates.push({ id: t.updates.length + 1, note: body.note, sponsorship: body.sponsorship, amount: body.amount ?? null, byName: me.name, createdAt: new Date().toISOString() }); return send(res, 200, t); }
    if ((m = /^\/api\/training\/(\d+)$/.exec(p))) { const i = trainings.findIndex((x) => x.id === +m[1]); if (req.method === "DELETE") { trainings.splice(i, 1); res.writeHead(204, { "Access-Control-Allow-Origin": "http://localhost:3000" }); return res.end(); } Object.assign(trainings[i], body); return send(res, 200, trainings[i]); }
    if (p === "/api/tasks") return send(res, 200, tasks.filter((t) => !q("kind") || t.kind === q("kind")));
    if (p === "/api/change-requests") return send(res, 200, [{ id: 1, employeeId: 3, employeeName: "Daniel Mwenga", field: "bankName", oldValue: "Salaam Bank", newValue: "KCB", reason: "Changed bank", status: "pending", isBankChange: true, decidedByName: "", decidedAt: null, decisionNote: "", createdAt: new Date().toISOString() }]);
    if (p === "/api/announcements") return send(res, 200, anns);
    if (p === "/api/policies") return send(res, 200, [{ id: 1, title: "SIBK HR Policy", version: "1.0", effectiveDate: "2026-02-13", fileName: "HR_POLICY.docx", uploadedAt: new Date().toISOString() }]);
    if (p === "/api/users") return send(res, 200, users);
    if (p === "/api/audit") return send(res, 200, { items: [{ id: 1, at: new Date().toISOString(), actorName: "Caroline Mathai", actorRole: "hr_admin", action: "employee_view", entity: "employee", entityId: "7", summary: "viewed profile incl. sensitive fields of Dennis Muasya", ip: "10.0.0.5" }], total: 1 });
    if (p === "/api/dashboard") return send(res, 200, { headcount: 16, byDepartment: deptNames.map((name, i) => ({ name, count: people.filter((x) => x[2] === i).length })).filter((d) => d.count).sort((a, b) => b.count - a.count), byStatus: [{ status: "active", count: 14 }, { status: "probation", count: 2 }], pendingDocuments: 5, employeesMissingDocuments: 13, expiringDocuments: 3, probationEnding: [{ employeeId: 8, fullName: "Purity Siaka", date: ahead(20), daysLeft: 20 }, { employeeId: 9, fullName: "Moses Ngige", date: ahead(52), daysLeft: 52 }], contractsEnding: [{ employeeId: 14, fullName: "Peter Odhiambo", date: ahead(45), daysLeft: 45 }], openJobs: 2, activeApplicants: 5, pendingChangeRequests: 1, openTasks: 4, overdueTasks: 1, recentUploads: docs.slice(0, 5), anniversaries: [{ employeeId: 3, fullName: "Daniel Mwenga", date: ahead(12), years: 2 }] });
    if (req.method !== "GET") return send(res, 200, { ok: true });
    return send(res, 404, { error: "not found" });
  });
}).listen(PORT, () => console.log(`mock API on :${PORT}`));
