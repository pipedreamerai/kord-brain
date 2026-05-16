---
title: Electrical Single-Line — Feedwater Skid
type: document
source_file: electrical.pdf
discipline: electrical
---

# Electrical Single-Line — Feedwater Skid

Single-page single-line diagram showing the power and control wiring for the feedwater pump motor.

## Power circuit

- [[MCC-1]] — 480V motor control center bus, 2000A rated, source of power for the skid
- [[CB-101]] — motor branch circuit breaker, 150 AF, 480V, mounted in [[MCC-1]]
- [[M-101]] — 100 HP induction motor, fed from [[MCC-1]] through [[CB-101]] with across-the-line starting

Power flows: [[MCC-1]] bus → [[CB-101]] → overload → [[M-101]] stator terminals.

## Interlock circuit

The motor start permissive routes through the PLC input rack:

- [[IR-2]] — PLC input rack, receives dry-contact inputs from process instrumentation
- [[LSL-201]] — low-low level switch on [[T-101]], wired as a normally-open contact to [[IR-2]]
- [[CV-301]] — discharge control valve position contact, wired through [[IR-2]] to confirm AUTO mode

[[M-101]] will not start unless both interlock contacts at [[IR-2]] are satisfied.

## Notes

Overload is set per [[M-101]] nameplate (see motor spec). Starter is across-the-line; no VFD on this skid.
