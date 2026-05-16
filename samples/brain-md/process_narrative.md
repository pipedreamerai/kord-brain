---
title: System Narrative — Evoqua M284R RO Unit
type: document
doc_kind: docx
---

# [[process_narrative]] — System Narrative

Operational description of the Evoqua Vantage M284R two-pass RO unit for Electric Hydrogen Beaumont. Covers feed water quality, flow measurement, pressure monitoring, level protection, RODI buffer tank, and control system.

## Topics covered

1. **Project overview** — 100 GPM RODI for electrolyzer feedwater
2. **Feed water** — deep well, 1276 µS/cm, pH 6.31, 57.4 NTU turbidity
3. **Flow measurement** — [[ft-301]] (1st pass feed), [[ft-303]] (2nd pass product)
4. **Pressure monitoring** — [[pit-305]] (1st pass discharge), [[pit-312]] (2nd pass discharge)
5. **Level protection** — [[lsl-201]] dry-run protection on pump suction
6. **RODI buffer tank** — [[lit-501]] level control, [[hv-507]] outlet isolation
7. **Control system** — Siemens S7-1215C PLC + TP700 HMI, Ethernet connectivity

## Key interlock narrative

[[lsl-201]] is the primary dry-run protection for the RO feed pump. When suction tank level falls below the switch setpoint, the PLC immediately shuts the pump to prevent cavitation damage. The standby flush cycle uses RO permeate to keep membranes in optimal condition.

## Cross-references

- [[dd_instrument_list]] — instrument datasheet for all tags mentioned
- [[bid_firm_quote]] — equipment specification referenced in §7 control system
- [[bid_pid]] — P&ID showing flow path described in §3–5
