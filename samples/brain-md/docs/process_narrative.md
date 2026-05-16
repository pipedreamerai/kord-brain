---
title: Process Narrative — Hydrogen Feedwater Skid
type: document
source_file: process_narrative.docx
discipline: process
---

# Process Narrative — Hydrogen Feedwater Skid

## 1. Overview

The feedwater skid supplies deionized water to the electrolyzer stack inlet under positive head pressure. The skid comprises a suction tank, a feedwater pump, a discharge control valve, and a low-low level interlock.

## 2. Suction Tank

Tank [[T-101]] is a 500-gallon stainless-steel vessel. Level switch [[LSL-201]] trips the motor on low-low condition to protect [[P-101]] from dry running.

## 3. Feedwater Supply

### 3.1 Operation

Pump [[P-101]] draws from [[T-101]] and discharges through control valve [[CV-301]] into the stack inlet header.

### 3.2 Feedwater Supply Conditions

[[P-101]] supplies DI water at 5 bar to the electrolyzer stack inlet. Suction is taken from [[T-101]]; discharge is regulated by [[CV-301]] in AUTO. [[LSL-201]] must be satisfied for the motor to start.

## 4. Interlocks

The motor will not start unless [[LSL-201]] is satisfied and [[CV-301]] is in AUTO. Both interlocks are wired through the PLC input rack [[IR-2]].
