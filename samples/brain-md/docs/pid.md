---
title: P&ID — Hydrogen Feedwater Skid
type: document
source_file: pid.pdf
discipline: process
---

# P&ID — Hydrogen Feedwater Skid

Single-page Piping & Instrumentation Diagram for the feedwater skid. ISA-5.1 conventions, drawing scale 1:1 page.

## Components shown

- [[T-101]] — suction tank (500 gal, SS316), positioned upstream of the pump
- [[LSL-201]] — low-low level switch mounted on [[T-101]], wired to the motor start interlock
- [[P-101]] — feedwater pump, draws from [[T-101]] and discharges through [[CV-301]]
- [[CV-301]] — discharge control valve, regulates flow into the electrolyzer stack inlet header

## Flow path

[[T-101]] → [[P-101]] → [[CV-301]] → electrolyzer stack inlet.

Suction line runs from the bottom of [[T-101]] to the pump inlet flange of [[P-101]]. Discharge line from [[P-101]] passes through [[CV-301]] before joining the stack inlet header.

## Instrumentation

[[LSL-201]] is the only instrument shown on this drawing. The interlock signal from [[LSL-201]] is wired off-drawing to the motor circuit shown on the electrical single-line.
