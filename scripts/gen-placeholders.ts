import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Document, Packer, Paragraph, HeadingLevel } from 'docx';
import * as XLSX from 'xlsx';
import { TAG_DESCRIPTIONS } from '../src/lib/docs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.resolve(__dirname, '..', 'samples');

const PAGE_W = 612;
const PAGE_H = 792;

async function makePid() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText('P&ID - Hydrogen Feedwater Skid', { x: 50, y: 750, size: 16, font: bold });
  page.drawText('Placeholder - replace with the real drawing.', { x: 50, y: 732, size: 9, font, color: rgb(0.5, 0.5, 0.5) });

  // Coordinates must match samples/pid.bboxes.json
  const items: { tag: string; x: number; y: number; note: string }[] = [
    { tag: 'T-101',   x: 90,  y: 624, note: 'suction tank' },
    { tag: 'LSL-201', x: 90,  y: 555, note: 'low-low level switch' },
    { tag: 'P-101',   x: 280, y: 482, note: 'feedwater pump' },
    { tag: 'CV-301',  x: 460, y: 482, note: 'discharge control valve' },
  ];

  for (const { tag, x, y, note } of items) {
    page.drawRectangle({ x: x - 10, y: y - 8, width: 110, height: 36, borderColor: rgb(0.18, 0.36, 0.72), borderWidth: 1.5, color: rgb(0.94, 0.97, 1) });
    page.drawText(tag, { x, y, size: 13, font: bold });
    page.drawText(note, { x, y: y - 14, size: 7.5, font, color: rgb(0.35, 0.35, 0.35) });
  }

  page.drawLine({ start: { x: 145, y: 600 }, end: { x: 145, y: 530 }, thickness: 1 });
  page.drawLine({ start: { x: 145, y: 500 }, end: { x: 280, y: 500 }, thickness: 1 });
  page.drawLine({ start: { x: 390, y: 500 }, end: { x: 460, y: 500 }, thickness: 1 });
  page.drawLine({ start: { x: 570, y: 500 }, end: { x: 570, y: 610 }, thickness: 1 });
  page.drawText('-> to electrolyzer stack inlet', { x: 460, y: 615, size: 8, font, color: rgb(0.35, 0.35, 0.35) });

  await writeFile(path.join(samplesDir, 'pid.pdf'), await pdf.save());
  console.log('✓ pid.pdf');
}

async function makeElectrical() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText('Electrical Single-Line - Feedwater Skid', { x: 50, y: 750, size: 16, font: bold });
  page.drawText('Placeholder - replace with the real drawing.', { x: 50, y: 732, size: 9, font, color: rgb(0.5, 0.5, 0.5) });

  // Coordinates must match samples/electrical.bboxes.json
  const items: { tag: string; x: number; y: number; w: number; h: number; note: string }[] = [
    { tag: 'MCC-1',   x: 80,  y: 680, w: 460, h: 40, note: 'motor control center bus' },
    { tag: 'CB-101',  x: 120, y: 540, w: 120, h: 60, note: 'motor breaker' },
    { tag: 'M-101',   x: 120, y: 380, w: 120, h: 60, note: '100 HP induction motor' },
    { tag: 'IR-2',    x: 360, y: 540, w: 120, h: 60, note: 'PLC input rack' },
    { tag: 'LSL-201', x: 360, y: 440, w: 120, h: 40, note: 'interlock contact' },
    { tag: 'CV-301',  x: 360, y: 380, w: 120, h: 40, note: 'interlock contact' },
  ];

  for (const { tag, x, y, w, h, note } of items) {
    page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.18, 0.36, 0.72), borderWidth: 1.5, color: rgb(0.94, 0.97, 1) });
    page.drawText(tag, { x: x + 8, y: y + h - 18, size: 12, font: bold });
    page.drawText(note, { x: x + 8, y: y + 6, size: 7.5, font, color: rgb(0.35, 0.35, 0.35) });
  }

  page.drawLine({ start: { x: 180, y: 680 }, end: { x: 180, y: 600 }, thickness: 1.5 });
  page.drawLine({ start: { x: 180, y: 540 }, end: { x: 180, y: 440 }, thickness: 1.5 });
  page.drawLine({ start: { x: 240, y: 570 }, end: { x: 360, y: 460 }, thickness: 0.8, color: rgb(0.55, 0.55, 0.55) });
  page.drawLine({ start: { x: 240, y: 410 }, end: { x: 360, y: 400 }, thickness: 0.8, color: rgb(0.55, 0.55, 0.55) });

  await writeFile(path.join(samplesDir, 'electrical.pdf'), await pdf.save());
  console.log('✓ electrical.pdf');
}

async function makeEquipmentList() {
  const header = ['Tag', 'Description', 'Rating', 'Vendor', 'Lead Time', 'P.O.#'];
  const rows = [
    ['P-101',   TAG_DESCRIPTIONS['P-101'],   '50 GPM, 100 PSI',     'Goulds',          '4 weeks',                  'PO-2026-0042'],
    ['M-101',   TAG_DESCRIPTIONS['M-101'],   '100 HP, 480V',         'Baldor Reliance', '6 weeks',                  'PO-2026-0042'],
    ['CB-101',  TAG_DESCRIPTIONS['CB-101'],  '150 AF, 480V',         'Eaton',           '14 weeks (LONG LEAD)',     'PO-2026-0019'],
    ['MCC-1',   TAG_DESCRIPTIONS['MCC-1'],   '480V, 2000A',          'ABB',             '20 weeks',                 'PO-2026-0008'],
    ['LSL-201', TAG_DESCRIPTIONS['LSL-201'], '24VDC SPDT',           'Endress+Hauser',  '2 weeks',                  'PO-2026-0055'],
    ['CV-301',  TAG_DESCRIPTIONS['CV-301'],  '4" CV, 5 bar',         'Emerson',         '8 weeks',                  'PO-2026-0033'],
    ['T-101',   TAG_DESCRIPTIONS['T-101'],   '500 gal, SS316',       'Local Fab',       '6 weeks',                  'PO-2026-0011'],
    ['IR-2',    TAG_DESCRIPTIONS['IR-2'],    '16-pt DI, 24VDC',      'Rockwell',        '4 weeks',                  'PO-2026-0008'],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{ wch: 10 }, { wch: 38 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Equipment');
  XLSX.writeFile(wb, path.join(samplesDir, 'equipment_list.xlsx'));
  console.log('✓ equipment_list.xlsx');
}

const p = (text: string, heading?: typeof HeadingLevel[keyof typeof HeadingLevel]) =>
  new Paragraph(heading ? { text, heading } : { text });

async function makeNarrative() {
  const doc = new Document({
    sections: [{
      children: [
        p('Process Narrative - Hydrogen Feedwater Skid', HeadingLevel.HEADING_1),
        p('Placeholder narrative for the hackathon demo. Replace with the real document when ready.'),
        p('1. Overview', HeadingLevel.HEADING_2),
        p('The feedwater skid supplies deionized water to the electrolyzer stack inlet under positive head pressure. The skid comprises a suction tank, a feedwater pump, a discharge control valve, and a low-low level interlock.'),
        p('2. Suction Tank', HeadingLevel.HEADING_2),
        p('Tank T-101 is a 500-gallon stainless-steel vessel. Level switch LSL-201 trips the motor on low-low condition to protect P-101 from dry running.'),
        p('3. Feedwater Supply', HeadingLevel.HEADING_2),
        p('3.1 Operation', HeadingLevel.HEADING_3),
        p('Pump P-101 draws from T-101 and discharges through control valve CV-301 into the stack inlet header.'),
        p('3.2 Feedwater Supply Conditions', HeadingLevel.HEADING_3),
        p('P-101 supplies DI water at 5 bar to the electrolyzer stack inlet. Suction is taken from T-101; discharge is regulated by CV-301 in AUTO. LSL-201 must be satisfied for the motor to start.'),
        p('4. Interlocks', HeadingLevel.HEADING_2),
        p('The motor will not start unless LSL-201 is satisfied and CV-301 is in AUTO. Both interlocks are wired through the PLC input rack.'),
      ],
    }],
  });
  await writeFile(path.join(samplesDir, 'process_narrative.docx'), await Packer.toBuffer(doc));
  console.log('✓ process_narrative.docx');
}

async function makeMotorSpec() {
  const doc = new Document({
    sections: [{
      children: [
        p('Motor Specification - M-101', HeadingLevel.HEADING_1),
        p('Placeholder datasheet. Replace with the vendor-supplied spec when available.'),
        p('Tag: M-101'),
        p('Service: Feedwater pump drive (P-101)'),
        p('Rated Power: 100 HP (75 kW)'),
        p('Voltage: 480V, 3-phase, 60 Hz'),
        p('Rated Speed: 1780 RPM'),
        p('Frame: 405T'),
        p('Enclosure: TEFC'),
        p('Insulation Class: F'),
        p('Service Factor: 1.15'),
        p('Vendor: Baldor Reliance'),
        p('P.O.#: PO-2026-0042'),
        p('Notes', HeadingLevel.HEADING_2),
        p('M-101 is fed from MCC-1 via breaker CB-101. Starter is across-the-line with overload protection. Interlocks are wired through PLC input rack IR-2 (LSL-201, CV-301).'),
      ],
    }],
  });
  await writeFile(path.join(samplesDir, 'motor_spec.docx'), await Packer.toBuffer(doc));
  console.log('✓ motor_spec.docx');
}

async function main() {
  await mkdir(samplesDir, { recursive: true });
  await makePid();
  await makeElectrical();
  await makeEquipmentList();
  await makeNarrative();
  await makeMotorSpec();
  console.log(`\nAll placeholders written to ${samplesDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
