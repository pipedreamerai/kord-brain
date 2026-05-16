---
title: RO Unit Description — Evoqua Vantage M284R
type: document
doc_kind: pdf
---

# [[bid_firm_quote]] — RO Unit Description

Evoqua Water Technologies product specification sheet for the Vantage® M284R-044 two-pass reverse osmosis unit. Document 68/S8921-020, Rev. 7, Jan 23, 2017.

## Unit configuration

- Model: M284R-044-D-M-S-D (44 membranes, Deluxe VFD trim, Hydranautics CPA5-34 / ESPA2-MAX, Siemens PLC, 460VAC)
- Nominal product: 100 GPM at 75% system recovery
- Feed: 128 GPM; Reject: 28 GPM
- 1st pass staging: 4:2:1; 2nd pass staging: 2:1:1
- 11 pressure vessels (Protec PRO-8-450, 8" FRP, 450 PSIG ASME)

## Pump / motor

- Manufacturer: Grundfos CRNE32-8 (Deluxe, integral VFD)
- Motor: TEFC, 40 HP × 2 passes = 460VAC / 3PH / 60Hz
- VFD maintains constant product flow; avoids across-the-line starting

## Control system

- PLC: Siemens S7-1215C (TIA Portal)
- HMI: Siemens TP700 Comfort Panel with Ethernet
- Shutdown alarms: high product conductivity, low feed pressure [[lsl-201]], low feed flow [[ft-301]], high product pressure [[pit-312]], high pump discharge pressure [[pit-305]]

## Shutdown interlocks relevant to instruments

- Low feed flow: triggers on [[ft-301]] or [[ft-303]] below setpoint
- High pump discharge: [[pit-305]] (1st pass) and [[pit-312]] (2nd pass)
- Low suction: [[lsl-201]] closes feed valve and stops pump
- High product pressure: prevents membrane damage

## Cross-references

- [[dd_instrument_list]] — full instrument schedule
- [[bid_pid]] — process drawing showing instrument placement
- [[process_narrative]] — operational description
