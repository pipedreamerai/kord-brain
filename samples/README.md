# Samples

This directory holds the 5 documents the demo reasons over. Until Chris ships the real drawings, `pnpm placeholders` regenerates working stubs.

## Files

| File | Owner | Status | What |
|---|---|---|---|
| `pid.pdf` | Chris | placeholder | Single-page P&ID for the feedwater skid |
| `pid.bboxes.json` | Chris | placeholder | Hand-annotated tag bboxes for `pid.pdf` |
| `electrical.pdf` | Chris | placeholder | Single-line: MCC-1 / CB-101 / M-101 / interlocks |
| `electrical.bboxes.json` | Chris | placeholder | Hand-annotated bboxes for `electrical.pdf` |
| `equipment_list.xlsx` | Chris | placeholder | One sheet, 8 rows keyed to the tag schema |
| `process_narrative.docx` | Chris | placeholder | 1 page; §3.2 covers feedwater supply |
| `motor_spec.docx` | Chris | placeholder | 1 page motor datasheet for M-101 |

## Replacing a placeholder with the real file

1. Drop the real `*.pdf` / `*.docx` / `*.xlsx` into this directory with the exact filename above.
2. For PDFs: hand-annotate the matching `<filename>.bboxes.json` against the real drawing coordinates. Validate it against `bboxes.schema.json` with any JSON-Schema tool.
3. Restart the dev server. The tag index rebuilds from disk on every boot.

## Regenerating placeholders

```bash
pnpm placeholders
```

Re-run this whenever `src/lib/tags.ts` changes. Safe to run repeatedly — the script is deterministic.

## bboxes sidecar format

- `bbox` is `[x0, y0, x1, y1]` in PDF user-space coordinates (origin bottom-left). Same coordinate system PDF.js reports.
- `kind` ∈ `symbol | instrument | label | wire` — drives highlight styling.
- Schema: [`bboxes.schema.json`](./bboxes.schema.json).

For text-heavy PDFs the sidecar is optional; the tag-index builder falls back to scanning the PDF text layer.
