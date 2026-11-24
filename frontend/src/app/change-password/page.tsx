"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Monogram } from "@/components/Brand";
import { Button } from "@/components/Button";
import { Input } from "@/components/Fields";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, api } from "@/lib/api";
import { homeFor } from "@/lib/access";

export default function ChangePasswordPage() {
  const { user, loading, setUser, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (next.length < 10) errs.newPassword = "Use at least 10 characters.";
    else if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) errs.newPassword = "Include at least one letter and one digit.";
    if (confirm !== next) errs.confirm = "The two passwords do not match.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api.auth.changePassword(current, next);
      if (user) {
        const updated = { ...user, mustChangePassword: false };
        setUser(updated);
        toast.success("Password updated");
        router.replace(homeFor(updated));
      }
    } catch (err) {
      if (err instanceof ApiError) setErrors({ ...err.fields, ...(Object.keys(err.fields).length ? {} : { currentPassword: err.message }) });
      else setErrors({ currentPassword: "Could not update the password" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <form onSubmit={submit} noValidate className="w-full max-w-md space-y-5 rounded-[14px] border border-line bg-white p-7 shadow-card">
        <Monogram size={44} />
        <div>
          <h1 className="text-xl font-bold text-ink">{user?.mustChangePassword ? "Choose a new password" : "Change password"}</h1>
          <p className="mt-1 text-sm text-muted">
            {user?.mustChangePassword ? "For your security, replace the temporary password HR gave you before continuing." : "Pick something only you know."}
          </p>
        </div>
        <Input label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.currentPassword} required />
        <Input label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={errors.newPassword} hint="At least 10 characters with a letter and a digit." required />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} required />
        <div className="flex gap-3">
          <Button type="submit" loading={busy} className="flex-1">
            Save password
          </Button>
          <Button variant="ghost" onClick={logout}>
            Sign out
          </Button>
        </div>
      </form>
    </main>
  );
}
