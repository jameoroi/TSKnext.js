'use client';

import { readCsv, readXlsx, writeCsv, writeXlsx, xlsxSupported } from '@/shared/xlsx.mjs';
import type { ProductTransferSchema } from './product-transfer';

const SHEET_DATA = 'สินค้า';
const SHEET_GUIDE = 'คำอธิบายคอลัมน์';
const SHEET_REFERENCE = 'รายการที่ใช้ได้';

const CHOICES: Record<string, string[]> = {
  state: ['active', 'hidden', 'discontinued'],
  home_featured: ['true', 'false'],
};

const WIDTHS: Record<string, number> = {
  id: 26,
  name: 46,
  slug: 26,
  desc: 50,
  specs: 40,
  img: 38,
  images: 38,
  detailImages: 38,
  review_video: 34,
  category: 20,
  brand: 18,
  sku: 16,
  barcode: 16,
};
const DEFAULT_WIDTH = 14;

function exampleOf(schema: ProductTransferSchema | undefined, key: string) {
  const value = schema?.sample_row?.[key];
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.join(' | ');
  if (typeof value === 'object')
    return Object.entries(value as Record<string, unknown>)
      .map(([name, item]) => `${name}=${String(item ?? '')}`)
      .join(' | ');
  return String(value);
}

function workbookSheets(schema: ProductTransferSchema | undefined, columns: string[]) {
  const help = new Map((schema?.columns || []).map((row) => [row.key, row]));
  const guide = [
    ['คอลัมน์', 'แก้ได้ไหม', 'คำอธิบาย', 'ตัวอย่างที่กรอกได้'],
    ...columns.map((key) => [
      key,
      help.get(key)?.read_only ? 'อ่านอย่างเดียว — ห้ามแก้' : 'แก้ได้',
      String(help.get(key)?.help || ''),
      exampleOf(schema, key),
    ]),
    [''],
    ['กติกาสำคัญ'],
    ['1. ห้ามแก้ชื่อคอลัมน์ในแถวแรกของชีต "สินค้า" ระบบใช้ชื่อนี้หาว่าคอลัมน์ไหนคืออะไร'],
    ['2. ห้ามแก้ค่าในคอลัมน์ id — เป็นตัวบอกว่าแถวนี้คือสินค้าชิ้นไหน'],
    ['3. ระบบจะแก้เฉพาะคอลัมน์ที่มีอยู่ในไฟล์ คอลัมน์ที่ไม่ได้ส่งมาจะไม่ถูกแตะ'],
    ['4. ลบแถวออกจากไฟล์ ไม่ได้แปลว่าลบสินค้า — ต้องไปลบที่หน้าจัดการสินค้า'],
    ['5. บันทึกกลับเป็น .xlsx แล้วอัปโหลดที่หน้า "นำเข้าสินค้า"'],
    [''],
    ['ช่อง "ตัวอย่างที่กรอกได้" ด้านบนเป็นแค่ตัวอย่างให้ดูรูปแบบ ไม่ใช่ข้อมูลจริง'],
    ['ระบบจะไม่นำเข้าอะไรจากชีตนี้ — กรอกข้อมูลจริงในชีต "สินค้า" เท่านั้น'],
  ];
  const reference = [
    ['สถานะที่ใช้ได้ (state)', 'ความหมาย'],
    ['active', 'ขายอยู่ — ลูกค้าเห็นและซื้อได้'],
    ['hidden', 'ซ่อน — ยังไม่เปิดขาย'],
    ['discontinued', 'เลิกขาย'],
  ];
  return { guide, reference };
}

export function productWorkbookSupported() {
  return xlsxSupported();
}

export async function productCsvToWorkbook(csvText: string, schema?: ProductTransferSchema) {
  const grid = readCsv(csvText) as string[][];
  const columns = (grid[0] || []).map((cell) => String(cell || ''));
  const { guide, reference } = workbookSheets(schema, columns);
  const validations = columns
    .map((key, index) => (CHOICES[key] ? { column: index, options: CHOICES[key] } : null))
    .filter(Boolean) as Array<{ column: number; options: string[] }>;

  return writeXlsx([
    { name: SHEET_DATA, rows: grid, widths: columns.map((key) => WIDTHS[key] || DEFAULT_WIDTH), validations },
    { name: SHEET_GUIDE, rows: guide, widths: [24, 22, 72, 40] },
    { name: SHEET_REFERENCE, rows: reference, widths: [28, 44] },
  ]) as Promise<Uint8Array>;
}

export async function productWorkbookToCsv(file: File) {
  const workbook = (await readXlsx(await file.arrayBuffer())) as Array<{ name: string; rows: unknown[][] }>;
  const found =
    workbook.find((sheet) => sheet.name.trim() === SHEET_DATA) ||
    workbook.find((sheet) =>
      (sheet.rows[0] || []).some((cell) => ['id', 'sku'].includes(String(cell).trim())),
    ) ||
    workbook[0];
  if (!found) throw new Error('xlsx_no_data_sheet');

  const rows = found.rows
    .map((row) => (row || []).map((cell) => String(cell ?? '')))
    .filter((row) => row.some((cell) => cell.trim() !== ''));

  return {
    csv: writeCsv(rows) as string,
    sheetName: found.name,
    rowCount: Math.max(0, rows.length - 1),
  };
}
