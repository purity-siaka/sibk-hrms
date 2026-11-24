import { AlertTriangle, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import type { ApiError } from "@/lib/api";
import { Button } from "./Button";

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-[#C5CEEA] bg-white px-6 py-10 text-center">
      <Inbox className="h-8 w-8 text-gold" aria-hidden />
      <p className="text-base font-semibold text-ink">{title}</p>
      {text && <p className="max-w-md text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError | Error; onRetry?: () => void }) {
  const status = "status" in error ? error.status : 0;
  const text =
    status === 403 ? "You do not have access to this information." : status === 404 ? "We could not find what you asked for." : error.message;
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-[14px] border border-[#E7B7AF] bg-danger-soft px-6 py-8 text-center">
      <AlertTriangle className="h-7 w-7 text-danger" aria-hidden />
      <p className="text-base font-semibold text-danger">Something went wrong</p>
      <p className="max-w-md text-sm text-ink">{text}</p>
      {onRetry && status !== 403 && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
