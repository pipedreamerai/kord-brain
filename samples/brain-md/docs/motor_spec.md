---
title: Motor Specification — M-101
type: document
source_file: motor_spec.docx
discipline: electrical
---

# Motor Specification — [[M-101]]

Vendor datasheet for the feedwater pump motor.

## Nameplate

| Field | Value |
|---|---|
| Tag | [[M-101]] |
| Service | Feedwater pump drive ([[P-101]]) |
| Rated Power | 100 HP (75 kW) |
| Voltage | 480V, 3-phase, 60 Hz |
| Rated Speed | 1780 RPM |
| Frame | 405T |
| Enclosure | TEFC |
| Insulation Class | F |
| Service Factor | 1.15 |
| Vendor | Baldor Reliance |
| P.O.# | PO-2026-0042 |

## Notes

[[M-101]] is fed from [[MCC-1]] via breaker [[CB-101]]. Starter is across-the-line with overload protection.

Interlocks are wired through PLC input rack [[IR-2]]:

- [[LSL-201]] — low-low level on [[T-101]], must be satisfied to start
- [[CV-301]] — discharge valve must be in AUTO position

Across-the-line starting inrush is approximately 6× FLA. Coordinate [[CB-101]] overload protection accordingly.
