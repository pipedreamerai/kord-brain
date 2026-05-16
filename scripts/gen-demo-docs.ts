/**
 * Generates synthetic demo_docs/equipment_list.xlsx and demo_docs/process_narrative.docx
 * based on the real Evoqua project 2034/001845 instrument data.
 * Run with: pnpm tsx scripts/gen-demo-docs.ts
 */
import * as XLSX from 'xlsx';
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from 'docx';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.cwd(), 'demo_docs');

// ---------------------------------------------------------------------------
// Equipment List (XLSX)
// ---------------------------------------------------------------------------

const header = ['Tag', 'Description', 'Manufacturer', 'Part Number', 'Range / Size', 'Unit Price (USD)', 'Delivery (wks)'];

const rows = [
  ['FT-301',  '1st Pass Feed Flow Transmitter',             'Georg Fischer Signet', '3-2537-6C-P0',          '0.3–20 ft/s (4-20 mA)',   '485',  '8'],
  ['FT-302',  '1st Pass Reject Flow Transmitter',           'Georg Fischer Signet', '3-2537-6C-P0',          '0.3–20 ft/s (4-20 mA)',   '485',  '8'],
  ['FT-303',  '2nd Pass Product Flow Transmitter',          'Georg Fischer Signet', '3-2537-6C-P0',          '0.3–20 ft/s (4-20 mA)',   '485',  '8'],
  ['PIT-305', '1st Pass HP Pump Discharge Transmitter',     'IFM Efector',          'PN2292',                '0–1450 psi (4-20 mA)',    '395',  '6'],
  ['PIT-312', '2nd Pass HP Pump Discharge Transmitter',     'IFM Efector',          'PN2292',                '0–1450 psi (4-20 mA)',    '395',  '6'],
  ['LSL-201', 'Pump Suction Level Switch #1',               'Grundfos Pump Corp',   '98071114',              'Digital Switch',           '310',  '10'],
  ['LIT-501', 'RODI Buffer Tank Level Transmitter',         'Rosemount – Emerson',  '3051L2AA2AD11AAM5Q4',  '±250 inH₂O (4-20 mA)',    '2850', '14'],
  ['HV-507',  'Buffer Tank Outlet Butterfly Valve 4"',      'Bray Controls',        '31-0400-11010-324LVR', '4" 175 PSI DI EPDM',      '680',  '4'],
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

// Column widths
ws['!cols'] = [
  { wch: 10 }, { wch: 42 }, { wch: 24 }, { wch: 28 }, { wch: 24 }, { wch: 18 }, { wch: 16 },
];

XLSX.utils.book_append_sheet(wb, ws, 'Instruments');
XLSX.writeFile(wb, path.join(outDir, 'equipment_list.xlsx'));
console.log('✓ demo_docs/equipment_list.xlsx');

// ---------------------------------------------------------------------------
// Process Narrative (DOCX)
// ---------------------------------------------------------------------------

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({ text, heading: level });
}

function body(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    spacing: { after: 120 },
  });
}

function taggedPara(parts: (string | { tag: string; text: string })[]) {
  return new Paragraph({
    children: parts.map(p =>
      typeof p === 'string'
        ? new TextRun({ text: p, size: 22 })
        : new TextRun({ text: p.text, bold: true, size: 22 })
    ),
    spacing: { after: 120 },
  });
}

const doc = new Document({
  sections: [
    {
      children: [
        heading('System Narrative — Evoqua Vantage M284R RO Unit', HeadingLevel.HEADING_1),
        heading('1. Project Overview', HeadingLevel.HEADING_2),
        body(
          'This document describes the operation of the Evoqua Water Technologies Vantage® M284R-044 ' +
          'two-pass reverse osmosis (RO) unit installed at the Electric Hydrogen facility in Beaumont, TX ' +
          '(Evoqua Project 2034/001845). The unit is designed to produce 100 GPM of high-purity RODI water ' +
          'for electrolyzer feedwater supply.'
        ),
        heading('2. Feed Water', HeadingLevel.HEADING_2),
        body(
          'Feed water is drawn from a deep well source (conductivity ~1276 µS/cm, pH 6.31, turbidity 57.4 NTU). ' +
          'The feed passes through pre-treatment prior to reaching the RO skid. Minimum inlet pressure is 30 psig.'
        ),
        heading('3. Flow Measurement', HeadingLevel.HEADING_2),
        taggedPara([
          'Three Georg Fischer Signet 3-2537-6C-P0 paddlewheel flow transmitters monitor system performance. ',
          { tag: 'FT-301', text: 'FT-301' },
          ' measures 1st-pass feed flow (target 128 GPM). ',
          { tag: 'FT-303', text: 'FT-303' },
          ' measures 2nd-pass product flow (target 100 GPM). Flow signals feed the Siemens S7-1215C PLC for ' +
          'recovery calculation and low-flow shutdown. All three transmitters share part number 3-2537-6C-P0.'
        ]),
        heading('4. Pressure Monitoring', HeadingLevel.HEADING_2),
        taggedPara([
          'High-pressure transmitters monitor pump discharge pressure in both passes. ',
          { tag: 'PIT-305', text: 'PIT-305' },
          ' (0–1450 psi, IFM Efector PN2292) monitors 1st-pass pump discharge and triggers high-pressure shutdown ' +
          'at the configured setpoint. ',
          { tag: 'PIT-312', text: 'PIT-312' },
          ' provides the equivalent function on the 2nd-pass pump. Both transmitters output 4-20 mA to the PLC.'
        ]),
        heading('5. Level Protection — Pump Suction', HeadingLevel.HEADING_2),
        taggedPara([
          'Three Grundfos rigid suction lance level alarms (p/n 98071114) protect the feed pumps from dry-run damage. ',
          { tag: 'LSL-201', text: 'LSL-201' },
          ' is mounted at the minimum suction level on the first-stage pump. When the suction level falls below the ' +
          'switch setpoint, the PLC initiates an immediate shutdown to prevent pump cavitation. ' +
          'LSL-202 and LSL-203 provide the same protection on subsequent pump stages.'
        ]),
        heading('6. RODI Buffer Tank', HeadingLevel.HEADING_2),
        taggedPara([
          'RO product water is stored in the RODI buffer tank before delivery to the electrolyzer. ',
          { tag: 'LIT-501', text: 'LIT-501' },
          ' (Rosemount 3051L, ±250 inH₂O differential pressure transmitter) provides continuous level monitoring ' +
          'with 4-20 mA output to the PLC. High-level standby: when LIT-501 indicates full tank, the RO enters ' +
          'standby mode and flushes periodically. ',
          { tag: 'HV-507', text: 'HV-507' },
          ' (Bray 4" 175 PSI butterfly valve) is the primary isolation valve on the tank outlet supply to the ' +
          'electrolyzer feed header. An N2 blanket (PCV-500) maintains tank pressure and a conservation vent ' +
          '(CBV-501) prevents over/under-pressure conditions.'
        ]),
        heading('7. Control System', HeadingLevel.HEADING_2),
        body(
          'The unit is controlled by a Siemens S7-1215C PLC with a Siemens TP700 Comfort Panel HMI. All instruments ' +
          'communicate via 4-20 mA analog signals to the PLC I/O cards. Shutdown alarms include: high product ' +
          'conductivity, low feed pressure, low feed flow, high product pressure, high pump discharge pressure, and ' +
          'high feed water temperature. Ethernet connectivity is provided for remote SCADA integration.'
        ),
      ],
    },
  ],
});

// docx package returns a Promise<Buffer> from Packer.toBuffer
async function main() {
  const buf = await Packer.toBuffer(doc);
  writeFileSync(path.join(outDir, 'process_narrative.docx'), buf);
  console.log('✓ demo_docs/process_narrative.docx');
}

main().catch(err => { console.error(err); process.exit(1); });
