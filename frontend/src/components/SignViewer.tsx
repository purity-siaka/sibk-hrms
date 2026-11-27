"use client";

import { useEffect, useRef, useState } from "react";
import { fetchBlob } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

export interface Stamp {
  page: number;
  x: number;
  y: number;
  name: string;
  at: string;
  pending?: boolean;
}

/** Signature box sits inside the page: left/top are clamped so it never runs off the edge. */
export const STAMP_MAX_X = 0.7;
export const STAMP_MAX_Y = 0.93;

function StampBox({ s }: { s: Stamp }) {
  return (
    <div
      className={`pointer-events-none absolute w-[30%] rounded-md border px-2 py-1 leading-tight ${s.pending ? "border-dashed border-gold-deep bg-gold-soft/90 text-gold-deep" : "border-navy bg-white/90 text-navy"}`}
      style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, fontSize: "clamp(8px, 1.15vw, 12px)" }}
    >
      <div className="font-bold">{s.pending ? "Sign here" : "Signed"} ✓</div>
      <div className="truncate font-semibold">{s.name}</div>
      <div className="truncate">{fmtDateTime(s.at)}</div>
    </div>
  );
}

function PageShell({ page, stamps, onPlace, children }: { page: number; stamps: Stamp[]; onPlace?: (p: { page: number; x: number; y: number }) => void; children: React.ReactNode }) {
  return (
    <div
      className={`relative mx-auto w-full overflow-hidden rounded-md border border-line bg-white shadow-card ${onPlace ? "cursor-crosshair" : ""}`}
      onClick={(e) => {
        if (!onPlace) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = Math.min(STAMP_MAX_X, Math.max(0, (e.clientX - r.left) / r.width));
        const y = Math.min(STAMP_MAX_Y, Math.max(0, (e.clientY - r.top) / r.height));
        onPlace({ page, x, y });
      }}
    >
      {children}
      {stamps.filter((s) => s.page === page).map((s, i) => (
        <StampBox key={i} s={s} />
      ))}
      <span className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-muted">Page {page}</span>
    </div>
  );
}

// Minimal structural types so pdf.js is only loaded in the browser.
interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
  }>;
}

function PdfPage({ doc, n }: { doc: PdfDoc; n: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1.6 });
      const c = ref.current;
      if (!c || !live) return;
      c.width = viewport.width;
      c.height = viewport.height;
      const ctx = c.getContext("2d");
      if (ctx) await page.render({ canvasContext: ctx, viewport }).promise;
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [doc, n]);
  return <canvas ref={ref} className="block h-auto w-full" />;
}

/**
 * Shows an uploaded PDF or image page by page. With `onPlace` the reader can click where
 * a signature should go; `stamps` are drawn on top of the pages.
 */
export function SignViewer({ path, contentType, stamps, onPlace }: { path: string; contentType: string; stamps: Stamp[]; onPlace?: (p: { page: number; x: number; y: number }) => void }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    let url: string | null = null;
    setDoc(null);
    setImg(null);
    setError("");
    (async () => {
      const blob = await fetchBlob(path, { inline: "1" });
      if (!live) return;
      if (contentType === "application/pdf") {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
        const d = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        if (live) setDoc(d as unknown as PdfDoc);
      } else {
        url = URL.createObjectURL(blob);
        setImg(url);
      }
    })().catch(() => live && setError("The document could not be loaded."));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, contentType]);

  if (error) return <p className="py-10 text-center text-sm text-danger">{error}</p>;
  if (!doc && !img) return <p className="py-10 text-center text-sm text-muted">Loading document...</p>;
  return (
    <div className="space-y-3">
      {doc
        ? Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
            <PageShell key={n} page={n} stamps={stamps} onPlace={onPlace}>
              <PdfPage doc={doc} n={n} />
            </PageShell>
          ))
        : img && (
            <PageShell page={1} stamps={stamps} onPlace={onPlace}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="Document" className="block h-auto w-full" />
            </PageShell>
          )}
    </div>
  );
}
