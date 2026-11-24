"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/Brand";
import { Button } from "@/components/Button";
import { Input } from "@/components/Fields";
import { useAuth } from "@/hooks/useAuth";
import { homeFor } from "@/lib/access";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(user.mustChangePassword ? "/change-password" : homeFor(user));
  }, [loading, user, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      router.replace(u.mustChangePassword ? "/change-password" : homeFor(u));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-navy p-12 text-white lg:flex">
        <div className="w-fit rounded-2xl bg-white p-3 shadow-lift">
          <Logo width={260} />
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">
            SIBK HR <span className="text-gold">Management System</span>
          </h1>
          <p className="mt-4 max-w-md text-[#DCE3FA]">
            One secure home for employee records, documents, recruitment and onboarding. Replacing paper files with a clear, auditable record.
          </p>
          <div className="mt-8 h-1 w-24 rounded-full bg-gold" aria-hidden />
        </div>
        <p className="text-xs text-[#AEB9E3]">Access is logged. Personal data is visible to HR and the employee only.</p>
      </section>
      <main className="flex items-center justify-center bg-white p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" noValidate>
          <div className="lg:hidden">
            <Logo width={200} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-ink">Sign in</h2>
            <p className="mt-1 text-sm text-muted">Use your work email address.</p>
          </div>
          {error && (
            <p role="alert" className="rounded-[10px] border border-[#E7B7AF] bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Input label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" loading={busy} className="w-full" disabled={!email || !password}>
            Sign in
          </Button>
          <p className="text-xs text-muted">Forgot your password? Ask HR to reset it for you.</p>
        </form>
      </main>
    </div>
  );
}
