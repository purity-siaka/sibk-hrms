"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { Button } from "./Button";
import { ReasonModal } from "./ReasonModal";

export function DecisionButtons({ onApprove, onReject, subject }: { onApprove: () => Promise<void>; onReject: (note: string) => Promise<void>; subject: string }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        icon={<Check className="h-4 w-4" aria-hidden />}
        loading={busy}
        aria-label={`Approve ${subject}`}
        onClick={async () => {
          setBusy(true);
          try {
            await onApprove();
          } finally {
            setBusy(false);
          }
        }}
      >
        Approve
      </Button>
      <Button size="sm" variant="danger" icon={<X className="h-4 w-4" aria-hidden />} aria-label={`Reject ${subject}`} onClick={() => setRejecting(true)}>
        Reject
      </Button>
      <ReasonModal open={rejecting} title={`Reject ${subject}`} label="Reason" confirmLabel="Reject" tone="danger" required onClose={() => setRejecting(false)} onSubmit={onReject} />
    </div>
  );
}
