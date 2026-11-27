"use client";

import { Check, Eraser, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api, downloadFile } from "@/lib/api";
import { isHR } from "@/lib/access";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { SignOff, SignOffStatus } from "@/lib/types";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { NewSignOffModal } from "./NewSignOffModal";
import { Pill } from "./Pill";
import { ReasonModal } from "./ReasonModal";
import { SignViewer, type Stamp } from "./SignViewer";
import { useToast } from "./Toast";

export const SO_STATUS: Record<SignOffStatus, { label: string; tone: "ok" | "wait" | "bad" | "info" }> = {
  in_progress: { label: "Waiting for signatures", tone: "wait" },
  completed: { label: "Signed and archived", tone: "ok" },
  rejected: { label: "Rejected", tone: "bad" },
  returned: { label: "Returned for correction", tone: "info" },
};

function Line({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="text-sm">
      <dt className="inline font-bold uppercase">{label}:</dt> <dd className="inline text-ink">{value}</dd>
    </div>
  );
}

/** Full view of one sign-off: preview, details, the signing order and the actions the viewer may take. */
export function SignOffDetail({ id, onClose, onChanged }: { id: number | null; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [so, setSo] = useState<SignOff | null>(null);
  const [error, setError] = useState("");
  const [place, setPlace] = useState<{ page: number; x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reject, setReject] = useState(false);
  const [ret, setRet] = useState(false);
  const [again, setAgain] = useState(false);

  const load = useCallback(() => {
    if (id === null) return;
    api.signoffs.get(id).then(setSo).catch(() => setError("This sign-off could not be opened."));
  }, [id]);
  useEffect(() => {
    setSo(null);
    setError("");
    setPlace(null);
    load();
  }, [id, load]);

  if (id === null) return null;
  const hr = isHR(user);
  const stamps: Stamp[] = (so?.steps ?? []).filter((s) => s.status === "signed" && s.signedAt).map((s) => ({ page: s.page, x: s.x, y: s.y, name: s.name, at: s.signedAt as string }));
  if (so?.myTurn && place) stamps.push({ ...place, name: user?.name ?? "You", at: new Date().toISOString(), pending: true });

  const done = (s: SignOff, msg: string) => {
    setSo(s);
    setPlace(null);
    toast.success(msg);
    onChanged();
  };
  const approve = async () => {
    if (!so || !place) return;
    setBusy(true);
    try {
      done(await api.signoffs.sign(so.id, place), "Signed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign");
    } finally {
      setBusy(false);
    }
  };
  const st = so ? SO_STATUS[so.status] : null;
  const canWithdraw = so && ((so.isPreparer && so.status !== "completed") || hr);

  return (
    <>
      <Modal
        open
        size="2xl"
        title={so?.title ?? "Sign-off"}
        onClose={onClose}
        footer={
          so && (
            <>
              {canWithdraw && (
                <Button
                  variant="danger"
                  icon={<Trash2 className="h-4 w-4" aria-hidden />}
                  onClick={async () => {
                    if (!window.confirm(`Delete "${so.title}"? This cannot be undone.`)) return;
                    try {
                      await api.signoffs.remove(so.id);
                      toast.success("Deleted");
                      onChanged();
                      onClose();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not delete");
                    }
                  }}
                >
                  {so.status === "completed" ? "Delete" : "Withdraw"}
                </Button>
              )}
              <Button variant="ghost" onClick={() => void downloadFile(api.signoffs.filePath(so.id), so.fileName)}>Download original</Button>
              {so.isPreparer && (so.status === "returned" || so.status === "rejected") && (
                <Button icon={<RotateCcw className="h-4 w-4" aria-hidden />} onClick={() => setAgain(true)}>Correct and send again</Button>
              )}
              {so.myTurn && (
                <>
                  <Button variant="danger" icon={<X className="h-4 w-4" aria-hidden />} onClick={() => setReject(true)}>Reject</Button>
                  <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" aria-hidden />} onClick={() => setRet(true)}>Return to preparer</Button>
                  {place && <Button variant="quiet" icon={<Eraser className="h-4 w-4" aria-hidden />} onClick={() => setPlace(null)}>Clear signature</Button>}
                  <Button variant="gold" loading={busy} disabled={!place} icon={<Check className="h-4 w-4" aria-hidden />} onClick={approve}>Approve and sign</Button>
                </>
              )}
            </>
          )
        }
      >
        {error ? (
          <p className="py-10 text-center text-sm text-danger">{error}</p>
        ) : !so ? (
          <p className="py-10 text-center text-sm text-muted">Loading...</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="min-w-0">
              {so.myTurn && (
                <p role="status" className="mb-3 rounded-[10px] border border-gold bg-gold-soft px-3 py-2 text-sm text-gold-deep">
                  {place ? "Signature placed. Press Approve and sign, or Clear signature to pick another spot." : "Read the document, then click on the page where you want to sign."}
                </p>
              )}
              <SignViewer path={api.signoffs.filePath(so.id)} contentType={so.contentType} stamps={stamps} onPlace={so.myTurn ? setPlace : undefined} />
            </div>
            <aside className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {st && <Pill tone={st.tone}>{st.label}</Pill>}
                {so.categoryName && <Pill tone="info">{so.categoryName}</Pill>}
                {so.cycle > 1 && <Pill tone="neutral">Round {so.cycle}</Pill>}
              </div>
              {so.returnNote && (so.status === "returned" || so.status === "rejected") && (
                <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-sm text-danger">
                  <strong>{so.status === "rejected" ? "Rejected" : "Correction needed"}: </strong>
                  {so.returnNote}
                </p>
              )}
              <dl className="space-y-1">
                <Line label="Prepared by" value={so.preparerName} />
                <Line label="Process name" value={so.processName} />
                <Line label="Process ID" value={so.processId} />
                <Line label="Department" value={so.processDepartment} />
                <Line label="Process owner" value={so.processOwner} />
                <Line label="Process manager" value={so.processManager} />
                <Line label="Version" value={so.version} />
                <Line label="Effective date" value={so.effectiveDate ? fmtDate(so.effectiveDate) : ""} />
                <Line label="Review date" value={so.reviewDate ? fmtDate(so.reviewDate) : ""} />
                <Line label="Document status" value={so.documentStatus} />
                <Line label="Classification" value={so.classification} />
              </dl>
              <div>
                <h3 className="mb-2 text-sm font-bold text-navy">Signing order</h3>
                <ol className="space-y-2">
                  {so.steps.map((s) => {
                    const current = so.status === "in_progress" && so.waitingForId === s.employeeId && s.status === "pending";
                    return (
                      <li key={s.id} className={`flex items-start gap-2 rounded-[10px] border px-3 py-2 text-sm ${current ? "border-gold bg-gold-soft" : "border-line"}`}>
                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.status === "signed" ? "bg-ok text-white" : "bg-navy text-white"}`}>{s.status === "signed" ? "✓" : s.position}</span>
                        <span className="min-w-0">
                          <strong className="block text-ink">{s.name}</strong>
                          {s.label && <span className="block text-xs text-muted">{s.label}</span>}
                          <span className="block text-xs text-muted">{s.status === "signed" ? `Signed ${fmtDateTime(s.signedAt)}` : current ? "Waiting to sign" : "Not yet"}</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </aside>
          </div>
        )}
      </Modal>
      <ReasonModal
        open={reject}
        title="Reject (do not sign)"
        label="Why are you not signing?"
        confirmLabel="Reject"
        tone="danger"
        required
        intro="The preparer is told, and the document stops here."
        onClose={() => setReject(false)}
        onSubmit={async (t) => {
          if (so) done(await api.signoffs.reject(so.id, t), "Rejected");
        }}
      />
      <ReasonModal
        open={ret}
        title="Return to preparer for correction"
        label="What must be corrected?"
        confirmLabel="Return"
        required
        intro="The preparer corrects the document and sends it round again from number 1."
        onClose={() => setRet(false)}
        onSubmit={async (t) => {
          if (so) done(await api.signoffs.returnForCorrection(so.id, t), "Returned to the preparer");
        }}
      />
      <NewSignOffModal open={again} again={so} onClose={() => setAgain(false)} onSaved={(s) => done(s, "Sent again")} />
    </>
  );
}
