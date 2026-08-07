"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdf } from "@/lib/pdf";

// Renders a single page of a Blob-hosted PDF deck onto a canvas, scaled to the
// container width. Pure renderer: the current `page` is driven from outside
// (the facilitator's prev/next, synced to participants). pdf.js is lazy-loaded
// via lib/pdf so it never ships to non-slide views.
export default function SlidePlayer({
  url,
  page,
  presentation = false,
}: {
  url: string;
  page: number;
  presentation?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const docUrlRef = useRef<string | null>(null);
  const renderIdRef = useRef(0);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const myId = ++renderIdRef.current;
    (async () => {
      setError(false);
      setLoading(true);
      try {
        if (docUrlRef.current !== url || !docRef.current) {
          void docRef.current?.destroy();
          docRef.current = await loadPdf(url);
          docUrlRef.current = url;
        }
        const doc = docRef.current;
        if (cancelled || myId !== renderIdRef.current) return;
        const p = Math.min(Math.max(1, page), doc.numPages);
        const pdfPage = await doc.getPage(p);
        if (cancelled || myId !== renderIdRef.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = (presentation ? 1800 : 1200) / base.width;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled || myId !== renderIdRef.current) return;
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, page, presentation]);

  // Release the document when the player unmounts (activity closed).
  useEffect(
    () => () => {
      void docRef.current?.destroy();
      docRef.current = null;
      docUrlRef.current = null;
    },
    []
  );

  if (error) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        Couldn&apos;t render this slide.{" "}
        <a href={url} target="_blank" rel="noreferrer" className="underline">
          Open the PDF
        </a>
      </div>
    );
  }
  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        className="w-full h-auto rounded-lg border border-slate-200 bg-white shadow-sm"
      />
      {loading && (
        <div className="absolute inset-0 grid place-items-center text-xs text-slate-400">
          Loading slide…
        </div>
      )}
    </div>
  );
}
