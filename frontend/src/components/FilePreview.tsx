"use client";

import { Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { downloadFile, fetchBlob } from "@/lib/api";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

export interface PreviewTarget {
  /** API path of the protected file, e.g. /documents/4/download */
  path: string;
  fileName: string;
  title?: string;
}

type Kind = "image" | "pdf" | "other";

function kindOf(name: string): Kind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

/** Preview window for a protected file: PDFs and images show inline, anything else offers a download. */
export function FilePreview({ target, onClose }: { target: PreviewTarget | null; onClose: () => void }) {
  const toast = useToast();
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState("");
  const kind = target ? kindOf(target.fileName) : "other";

  useEffect(() => {
    setSrc(null);
    setError("");
    if (!target || kind === "other") return;
    let cancelled = false;
    let url: string | null = null;
    fetchBlob(target.path, { inline: "1" })
      .then((b) => {
        if (cancelled) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setError("The file could not be loaded.");
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [target, kind]);

  return (
    <Modal
      open={target !== null}
      title={target?.title || target?.fileName || "Preview"}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {target && (
            <Button icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void toast.run(downloadFile(target.path, target.fileName), "Download started")}>
              Download
            </Button>
          )}
        </>
      }
    >
      {kind === "other" ? (
        <p className="py-8 text-center text-sm text-muted">Word files cannot be previewed in the browser. Use Download to open {target?.fileName}.</p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-danger">{error}</p>
      ) : !src ? (
        <p className="py-8 text-center text-sm text-muted">Loading preview...</p>
      ) : kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={target?.fileName ?? "Preview"} className="mx-auto max-h-[70vh] max-w-full rounded-md object-contain" />
      ) : (
        <iframe src={src} title={target?.fileName ?? "Preview"} className="h-[70vh] w-full rounded-md border border-line" />
      )}
    </Modal>
  );
}

/** Convenience hook: `const { preview, node } = usePreview();` then render {node} and call preview(target). */
export function usePreview() {
  const [target, setTarget] = useState<PreviewTarget | null>(null);
  const close = useCallback(() => setTarget(null), []);
  return { preview: setTarget, node: <FilePreview target={target} onClose={close} /> };
}
