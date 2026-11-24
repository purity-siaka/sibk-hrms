"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { ReferenceProvider } from "@/hooks/useReference";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ReferenceProvider>
      <AppShell>{children}</AppShell>
    </ReferenceProvider>
  );
}
