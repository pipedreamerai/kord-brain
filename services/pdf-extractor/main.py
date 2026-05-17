"""
PDF extraction sidecar for kord-brain.

Renders each page to a base64 JPEG, returns the embedded text layer, and
returns word-level spans (bboxes) from the text layer when present.

The Node side (src/lib/ingestion/pdf.ts) decides per page whether to read the
text layer or to send the image to Claude vision via AI Gateway
(src/lib/ingestion/vision-extractor.ts). Spans drive the bbox-overlay UI on
text-layer PDFs (no spans for raster pages — Claude doesn't return bboxes).

This replaced the prior Tesseract OCR pipeline, which couldn't read engineering
tags inside instrument balloons on low-DPI raster P&IDs.
"""
from __future__ import annotations

import base64
import os
import time
from typing import Any

import fitz  # PyMuPDF
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

RENDER_LONG_EDGE_PX = int(os.environ.get("PDF_RENDER_LONG_EDGE_PX", "4800"))
RENDER_JPEG_QUALITY = int(os.environ.get("PDF_RENDER_JPEG_QUALITY", "82"))
MAX_PDF_BYTES = int(os.environ.get("PDF_MAX_BYTES", str(100 * 1024 * 1024)))

app = FastAPI(title="kord-brain pdf-extractor", version="0.3.0")


class Span(BaseModel):
    text: str
    bbox: list[float]  # [x0, y0, x1, y1] in PDF user-space points


class PageOut(BaseModel):
    number: int
    width: float          # PDF user-space points
    height: float
    image_b64: str        # JPEG, long-edge RENDER_LONG_EDGE_PX, base64
    image_mime: str
    text_layer: str       # may be empty for raster pages
    spans: list[Span]     # word-level bboxes from the text layer; empty for raster
    vector_paths: int


class ExtractOut(BaseModel):
    page_count: int
    pages: list[PageOut]
    elapsed_ms: int


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {
        "ok": True,
        "pymupdf": fitz.__version__,
        "render_long_edge_px": RENDER_LONG_EDGE_PX,
        "render_jpeg_quality": RENDER_JPEG_QUALITY,
    }


def _render_page(page: fitz.Page) -> PageOut:
    rect = page.rect
    long_edge_pt = max(rect.width, rect.height)
    # Scale so the longest edge in pixels lands near RENDER_LONG_EDGE_PX.
    scale = RENDER_LONG_EDGE_PX / long_edge_pt if long_edge_pt > 0 else 1.0
    matrix = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    jpeg = pix.tobytes("jpeg", jpg_quality=RENDER_JPEG_QUALITY)

    try:
        vector_paths = len(page.get_drawings())
    except Exception:
        vector_paths = 0

    text_layer = page.get_text("text") or ""

    # Word-level spans from the text layer. Free — no OCR. Empty list when
    # the page is raster (no text layer). The Node side uses these to build
    # tag bbox overlays in the PDF viewer.
    spans: list[Span] = []
    try:
        words = page.get_text("words")
        for w in words:
            txt = w[4] if isinstance(w[4], str) else ""
            if not txt.strip():
                continue
            spans.append(
                Span(
                    text=txt,
                    bbox=[float(w[0]), float(w[1]), float(w[2]), float(w[3])],
                )
            )
    except Exception:
        spans = []

    return PageOut(
        number=page.number + 1,
        width=float(rect.width),
        height=float(rect.height),
        image_b64=base64.b64encode(jpeg).decode("ascii"),
        image_mime="image/jpeg",
        text_layer=text_layer,
        spans=spans,
        vector_paths=vector_paths,
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
        pages = [_render_page(p) for p in doc]
    finally:
        doc.close()

    return ExtractOut(
        page_count=len(pages),
        pages=pages,
        elapsed_ms=int((time.perf_counter() - t0) * 1000),
    )
