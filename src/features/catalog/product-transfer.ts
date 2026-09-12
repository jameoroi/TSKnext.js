import { LegacyApiError } from '@/lib/legacy-api.client';

export type ProductTransferColumn = {
  key: string;
  help?: string;
  read_only?: boolean;
};

export type ProductTransferGroup = {
  key: string;
  label?: string;
  note?: string;
};

export type ProductTransferSchema = {
  columns?: ProductTransferColumn[];
  groups?: ProductTransferGroup[];
  samples?: Record<string, { columns?: string[] }>;
  sample_row?: Record<string, unknown>;
  blank_form?: { csv?: string };
};

const ERRORS: Record<string, string> = {
  unauthorized: 'ไม่มีสิทธิ์ใช้งานส่วนนี้',
  invalid_csrf: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง',
  csv_needs_header_and_one_row: 'ไฟล์ต้องมีบรรทัดหัวตารางและข้อมูลอย่างน้อยหนึ่งแถว',
  unknown_columns: 'มีคอลัมน์ที่ระบบไม่รู้จัก — ลบคอลัมน์นั้นออก หรือแก้ชื่อให้ตรงกับตารางคำอธิบาย',
  need_id_or_sku_column: 'ไฟล์ต้องมีคอลัมน์ id หรือ sku อย่างน้อยหนึ่งอัน เพื่อจับคู่กับสินค้าในระบบ',
  no_writable_columns: 'ไฟล์มีแต่คอลัมน์ที่แก้ไม่ได้ ยังไม่มีอะไรให้นำเข้า',
  need_name_column: 'การนำเข้าสินค้าใหม่ต้องมีคอลัมน์ name อย่างน้อยหนึ่งอัน',
};

export const ROW_PROBLEMS: Record<string, string> = {
  not_found: 'ไม่พบสินค้า',
  duplicate_row: 'สินค้าซ้ำในไฟล์',
  invalid_cell: 'ข้อมูลไม่ถูกต้อง',
  name_required: 'ไม่มีชื่อสินค้า',
  already_exists: 'มีสินค้านี้อยู่แล้ว',
  duplicate_sku: 'SKU ซ้ำ',
  duplicate_name: 'ชื่อสินค้านี้มีในร้านแล้ว (หรือซ้ำกันเองในไฟล์)',
  invalid_input: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง',
};

export function explainProductTransferError(error: unknown) {
  const api = error instanceof LegacyApiError ? error : null;
  const code = api?.code || (error instanceof Error ? error.message : '') || 'unknown';
  const body = api?.detail && typeof api.detail === 'object' ? api.detail as Record<string, unknown> : {};
  const extra = Array.isArray(body.columns) ? body.columns.map(String).filter(Boolean) : [];
  const base = ERRORS[code] || (code.startsWith('http_') ? 'เซิร์ฟเวอร์ตอบกลับไม่สำเร็จ' : code) || 'ดำเนินการไม่สำเร็จ';
  return extra.length ? `${base} (${extra.join(', ')})` : base;
}

export function transferColumnHelp(schema?: ProductTransferSchema) {
  const out: Record<string, { help: string; read_only: boolean }> = {};
  for (const row of schema?.columns || []) {
    if (!row?.key) continue;
    out[row.key] = { help: String(row.help || ''), read_only: Boolean(row.read_only) };
  }
  return out;
}

export function transferExample(schema: ProductTransferSchema | undefined, key: string) {
  const value = schema?.sample_row?.[key];
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.join(' | ');
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([name, item]) => `${name}=${String(item ?? '')}`).join(' | ');
  return String(value);
}
