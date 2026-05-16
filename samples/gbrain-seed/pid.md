---
type: document
title: P&ID — Hydrogen Feedwater Skid
discipline: process
source_file: pid.pdf
---

# P&ID — Hydrogen Feedwater Skid

Single-page Piping & Instrumentation Diagram for the feedwater skid. ISA-5.1 conventions, drawing scale 1:1 page.

## Components shown

- [[t-101]] — suction tank (500 gal, SS316), positioned upstream of the pump
- [[lsl-201]] — low-low level switch mounted on [[t-101]], wired to the motor start interlock
- [[p-101]] — feedwater pump, draws from [[t-101]] and discharges through [[cv-301]]
- [[cv-301]] — discharge control valve, regulates flow into the electrolyzer stack inlet header

## Flow path

[[t-101]] → [[p-101]] → [[cv-301]] → electrolyzer stack inlet.

Suction line runs from the bottom of [[t-101]] to the pump inlet flange of [[p-101]]. Discharge line from [[p-101]] passes through [[cv-301]] before joining the stack inlet header.

## Instrumentation

[[lsl-201]] is the only instrument shown on this drawing. The interlock signal from [[lsl-201]] is wired off-drawing to the motor circuit shown on the electrical single-line.
