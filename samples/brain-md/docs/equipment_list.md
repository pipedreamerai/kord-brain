---
title: Equipment List — Feedwater Skid
type: document
source_file: equipment_list.xlsx
discipline: procurement
---

# Equipment List — Feedwater Skid

Procurement-side master list. One row per tag, with vendor, rating, lead time, and purchase-order reference.

| Tag | Description | Rating | Vendor | Lead Time | P.O.# |
|---|---|---|---|---|---|
| [[P-101]] | Feedwater pump | 50 GPM, 100 PSI | Goulds | 4 weeks | PO-2026-0042 |
| [[M-101]] | Pump motor (100 HP, 480V induction) | 100 HP, 480V | Baldor Reliance | 6 weeks | PO-2026-0042 |
| [[CB-101]] | Motor breaker | 150 AF, 480V | Eaton | **14 weeks (LONG LEAD)** | PO-2026-0019 |
| [[MCC-1]] | Motor control center | 480V, 2000A | ABB | 20 weeks | PO-2026-0008 |
| [[LSL-201]] | Low-low level switch (suction tank) | 24VDC SPDT | Endress+Hauser | 2 weeks | PO-2026-0055 |
| [[CV-301]] | Discharge control valve | 4" CV, 5 bar | Emerson | 8 weeks | PO-2026-0033 |
| [[T-101]] | Suction tank | 500 gal, SS316 | Local Fab | 6 weeks | PO-2026-0011 |
| [[IR-2]] | PLC input rack | 16-pt DI, 24VDC | Rockwell | 4 weeks | PO-2026-0008 |

## Long-lead flags

[[CB-101]] is flagged long-lead at 14 weeks. If [[CB-101]] fails in service there is no hot-swap; reorder pushes the system off-line for the full lead time.

[[MCC-1]] is the longest lead at 20 weeks but is not at risk for replacement (it is the bus itself, not a swappable component).

## Shared purchase orders

- PO-2026-0042: [[P-101]] and [[M-101]] (matched pump + motor set)
- PO-2026-0008: [[MCC-1]] and [[IR-2]] (Rockwell + ABB integrated control package)
