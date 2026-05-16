# samples/

This directory holds supporting assets for the demo. The actual engineering documents are in `demo_docs/`.

## brain-md/ — gbrain knowledge graph seed

13 markdown files that seed the gbrain knowledge graph (PGLite at `~/.gbrain/brain.pglite`). These are human-written summaries of what's in the engineering documents, with `[[wikilink]]` references that become graph edges.

### Document pages (slugs match DocSlug in src/lib/docs.ts)

| File | gbrain slug | Corresponding doc |
|---|---|---|
| `bid_pid.md` | `bid_pid` | `demo_docs/Bid/PID.pdf` |
| `dd_instrument_list.md` | `dd_instrument_list` | `demo_docs/Detailed Design/Instrument List.pdf` |
| `bid_firm_quote.md` | `bid_firm_quote` | `demo_docs/Bid/Firm Quote.pdf` |
| `equipment_list.md` | `equipment_list` | `demo_docs/equipment_list.xlsx` |
| `process_narrative.md` | `process_narrative` | `demo_docs/process_narrative.docx` |

### Tag pages (slugs match lowercase tag name)

| File | gbrain slug | Tag |
|---|---|---|
| `ft-301.md` | `ft-301` | `FT-301` |
| `ft-302.md` | `ft-302` | `FT-302` |
| `ft-303.md` | `ft-303` | `FT-303` |
| `pit-305.md` | `pit-305` | `PIT-305` |
| `pit-312.md` | `pit-312` | `PIT-312` |
| `lsl-201.md` | `lsl-201` | `LSL-201` |
| `lit-501.md` | `lit-501` | `LIT-501` |
| `hv-507.md` | `hv-507` | `HV-507` |

### Re-seeding the brain

After editing any file in `brain-md/`:

```bash
export PATH="$HOME/.bun/bin:$PATH"

# Delete stale pages first (gbrain import is upsert-by-slug)
for s in bid_pid dd_instrument_list bid_firm_quote equipment_list process_narrative \
          ft-301 ft-302 ft-303 pit-305 pit-312 lsl-201 lit-501 hv-507; do
  gbrain delete "$s" 2>/dev/null
done

gbrain import samples/brain-md --no-embed
gbrain extract links --source fs --dir samples/brain-md
gbrain stats   # expect Pages: 13, Links: ~90
```

**Gotchas:**
- Slug is derived from the filename (lowercase, no extension). `bid_pid.md` → slug `bid_pid`. Never add `slug:` to frontmatter — gbrain will skip the file.
- Always use `--source fs --dir samples/brain-md` for link extraction. `--source db` returns 0 edges (gbrain bug).
- Wikilinks must use the exact slug: `[[bid_pid]]` not `[[Bid PID]]`.

## bboxes.schema.json — bbox sidecar schema

JSON Schema for hand-annotated PDF bounding box files (e.g. `demo_docs/Detailed Design/Instrument List.bboxes.json`). Validate sidecars against this before committing.

Format: `bbox` is `[x0, y0, x1, y1]` in PDF user-space coordinates (origin bottom-left). `kind` ∈ `symbol | instrument | label | wire`.
