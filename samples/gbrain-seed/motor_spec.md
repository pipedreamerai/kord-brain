---
type: document
title: Motor Specification — M-101
discipline: electrical
source_file: motor_spec.docx
---

# Motor Specification — [[m-101]]

Vendor datasheet for the feedwater pump motor.

## Nameplate

| Field | Value |
|---|---|
| Tag | [[m-101]] |
| Service | Feedwater pump drive ([[p-101]]) |
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

[[m-101]] is fed from [[mcc-1]] via breaker [[cb-101]]. Starter is across-the-line with overload protection.

Interlocks are wired through PLC input rack [[ir-2]]:

- [[lsl-201]] — low-low level on [[t-101]], must be satisfied to start
- [[cv-301]] — discharge valve must be in AUTO position

Across-the-line starting inrush is approximately 6× FLA. Coordinate [[cb-101]] overload protection accordingly.
