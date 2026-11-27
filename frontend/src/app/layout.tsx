import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/Toast";
import { AuthProvider } from "@/hooks/useAuth";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SIBK Management System", template: "%s | SIBK" },
  description: "Employee records, documents, recruitment and onboarding for Salaam Investment Bank Kenya.",
};
export const viewport: Viewport = { themeColor: "#1D3B84", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
