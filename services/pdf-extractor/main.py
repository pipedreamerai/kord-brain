"""
PDF extraction sidecar for kord-brain.

Returns per-page text + word-level bboxes + vector-path counts in one call.
Falls back to Tesseract OCR (via PyMuPDF's built-in textpage_ocr) when a page
has no text layer — that's the common case for raster-only P&IDs.
"""
from __future__ import annotations

import os
import time
from typing import Any

import fitz  # PyMuPDF
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

OCR_LANG = os.environ.get("PDF_OCR_LANG", "eng")
OCR_DPI = int(os.environ.get("PDF_OCR_DPI", "300"))
MAX_PDF_BYTES = int(os.environ.get("PDF_MAX_BYTES", str(100 * 1024 * 1024)))

app = FastAPI(title="kord-brain pdf-extractor", version="0.1.0")


class Span(BaseModel):
    text: str
    bbox: list[float]  # [x0, y0, x1, y1] in PDF user-space points


class PageOut(BaseModel):
    number: int
    width: float
    height: float
    text: str
    spans: list[Span]
    vector_paths: int
    source: str  # "text" | "ocr" | "empty"


class ExtractOut(BaseModel):
    page_count: int
    pages: list[PageOut]
    elapsed_ms: int
    any_ocr: bool


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"ok": True, "pymupdf": fitz.__version__}


def _extract_page(page: fitz.Page) -> PageOut:
    rect = page.rect
    words = page.get_text("words")
    source = "text"
    if not words:
        try:
            tp = page.get_textpage_ocr(dpi=OCR_DPI, language=OCR_LANG, full=True)
            words = page.get_text("words", textpage=tp)
            source = "ocr" if words else "empty"
        except Exception:
            source = "empty"
            words = []

    spans = [
        Span(text=w[4], bbox=[float(w[0]), float(w[1]), float(w[2]), float(w[3])])
        for w in words
        if isinstance(w[4], str) and w[4].strip()
    ]
    text = " ".join(s.text for s in spans)
    try:
        vector_paths = len(page.get_drawings())
    except Exception:
        vector_paths = 0

    return PageOut(
        number=page.number + 1,
        width=float(rect.width),
        height=float(rect.height),
        text=text,
        spans=spans,
        vector_paths=vector_paths,
        source=source,
    )


@app.post("/extract", response_model=ExtractOut)
async def extract(file: UploadFile = File(...)) -> ExtractOut:
    buf = await file.read()
    if not buf:
        raise HTTPException(400, "empty upload")
    if len(buf) > MAX_PDF_BYTES:
        raise HTTPException(413, f"pdf too large: {len(buf)} > {MAX_PDF_BYTES}")

    t0 = time.perf_counter()
    try:
        doc = fitz.open(stream=buf, filetype="pdf")
    except Exception as e:
        raise HTTPException(400, f"could not parse pdf: {e}")

    try:
        pages = [_extract_page(p) for p in doc]
    finally:
        doc.close()

    return ExtractOut(
        page_count=len(pages),
        pages=pages,
        elapsed_ms=int((time.perf_counter() - t0) * 1000),
        any_ocr=any(p.source == "ocr" for p in pages),
    )
