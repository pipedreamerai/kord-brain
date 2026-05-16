---
type: document
title: Electrical Single-Line — Feedwater Skid
discipline: electrical
source_file: electrical.pdf
---

# Electrical Single-Line — Feedwater Skid

Single-page single-line diagram showing the power and control wiring for the feedwater pump motor.

## Power circuit

- [[mcc-1]] — 480V motor control center bus, 2000A rated, source of power for the skid
- [[cb-101]] — motor branch circuit breaker, 150 AF, 480V, mounted in [[mcc-1]]
- [[m-101]] — 100 HP induction motor, fed from [[mcc-1]] through [[cb-101]] with across-the-line starting

Power flows: [[mcc-1]] bus → [[cb-101]] → overload → [[m-101]] stator terminals.

## Interlock circuit

The motor start permissive routes through the PLC input rack:

- [[ir-2]] — PLC input rack, receives dry-contact inputs from process instrumentation
- [[lsl-201]] — low-low level switch on [[t-101]], wired as a normally-open contact to [[ir-2]]
- [[cv-301]] — discharge control valve position contact, wired through [[ir-2]] to confirm AUTO mode

[[m-101]] will not start unless both interlock contacts at [[ir-2]] are satisfied.

## Notes

Overload is set per [[m-101]] nameplate (see motor spec). Starter is across-the-line; no VFD on this skid.
