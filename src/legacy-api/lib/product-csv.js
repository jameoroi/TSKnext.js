/**
 * Products in and out of a spreadsheet.
 *
 * The shop had one way to get its data out — `admin.backup.export`, which dumps
 * every key in the store as one JSON object and is restorable only in full. It
 * is a backup, not a working tool: a merchant who wants to reprice forty items
 * or fix the brand on a hundred rows cannot open it in Excel, and could not put
 * it back if they did.
 *
 * This is the other half. A merchant picks the columns they care about, edits
 * them, and sends the file back. The rule that makes that safe is that an
 * import only writes the columns the file actually contains: a price sheet
 * carries `id`, `name` and `price`, so it changes prices and cannot silently
 * blank a description that was never in the file. That is also why every group
 * carries `id` and `name` — `id` is how a row finds its product, and `name` is
 * how a person reading the file knows which row they are looking at.
 */

/**
 * What a column is, and how it survives the round trip.
 *
 * `to` renders a stored value as a cell; `from` reads a cell back. A column
 * with no `from` is read-only — `id` is the join key and the two computed
 * columns are there so the file is readable by a human, not so it can be
 * written back.
 */
const COLUMNS = {
  id: { label: 'id', help: 'รหัสสินค้า — ห้ามแก้ ใช้จับคู่ตอนนำเข้า', readOnly: true },
  name: { label: 'name', help: 'ชื่อสินค้า' },
  slug: { label: 'slug', help: 'ลิงก์สินค้า' },
  category: { label: 'category', help: 'หมวดหมู่' },
  brand: { label: 'brand', help: 'ชื่อแบรนด์' },
  sku: { label: 'sku', help: 'รหัส SKU — ใช้จับคู่แทน id ได้' },
  barcode: { label: 'barcode', help: 'บาร์โค้ด' },
  price: { label: 'price', help: 'ราคาขาย (บาท)', number: true },
  oldPrice: { label: 'oldPrice', help: 'ราคาก่อนลด เว้นว่างถ้าไม่ลด', number: true, nullable: true },
  cost_price: { label: 'cost_price', help: 'ราคาทุน', number: true },
  stock: { label: 'stock', help: 'จำนวนคงเหลือ', number: true },
  low_stock_threshold: { label: 'low_stock_threshold', help: 'แจ้งเตือนเมื่อเหลือน้อยกว่า', number: true },
  state: { label: 'state', help: 'active / hidden / discontinued' },
  status: { label: 'status', help: 'ป้ายสถานะ คั่นด้วย |', list: true },
  home_featured: { label: 'home_featured', help: 'สินค้าแนะนำ: true / false', boolean: true },
  home_featured_order: { label: 'home_featured_order', help: 'ลำดับบนหน้าแรก 1–999', number: true, nullable: true },
  img: { label: 'img', help: 'ลิงก์รูปหน้าปก' },
  images: { label: 'images', help: 'ลิงก์รูปเพิ่มเติม คั่นด้วย |', list: true },
  detailImages: { label: 'detailImages', help: 'ลิงก์รูปในรายละเอียด คั่นด้วย |', list: true },
  desc: { label: 'desc', help: 'รายละเอียดสินค้า' },
  review_video: { label: 'review_video', help: 'ลิงก์คลิปรีวิว (YouTube)' },
  specs: { label: 'specs', help: 'ข้อมูลจำเพาะ รูปแบบ คีย์=ค่า คั่นด้วย |', specs: true },

  /*
   * The parcel.
   *
   * Delivery is a flat fee today, so none of these four change what a shopper
   * is charged yet. They are here because the number cannot be recovered
   * later: a courier bills the greater of actual weight and volumetric weight
   * (L×W×H÷5000 in Thailand), and nobody is going back to weigh three thousand
   * items by hand. The moment to capture it is while the rows are in a
   * spreadsheet anyway.
   */
  weight_kg: { label: 'weight_kg', help: 'น้ำหนักรวมกล่อง (กก.) เช่น 1.5 — ใช้คำนวณค่าส่งในอนาคต เว้นว่าง = ยังไม่ได้ชั่ง', number: true },
  length_cm: { label: 'length_cm', help: 'ความยาวกล่อง (ซม.) ใช้คำนวณน้ำหนักตามปริมาตร', number: true },
  width_cm: { label: 'width_cm', help: 'ความกว้างกล่อง (ซม.)', number: true },
  height_cm: { label: 'height_cm', help: 'ความสูงกล่อง (ซม.)', number: true },

  /*
   * What a catalogue is expected to say about a thing it sells. `unit` is not
   * optional in Thai: ท่อ is sold by the metre and ข้อต่อ by the piece, and a
   * price with no unit beside it is a question rather than an offer.
   */
  unit: { label: 'unit', help: 'หน่วยนับ เช่น ชิ้น / เมตร / กล่อง / ชุด — ขึ้นต่อท้ายราคาบนหน้าสินค้า' },
  model: { label: 'model', help: 'รุ่นของผู้ผลิต เช่น DHS680Z — คนละอย่างกับ SKU ซึ่งเป็นรหัสของร้านเอง' },
  warranty: { label: 'warranty', help: 'การรับประกัน เช่น 1 ปี / 6 เดือน' },
  origin: { label: 'origin', help: 'ประเทศผู้ผลิต เช่น ญี่ปุ่น / จีน / ไทย' },
  min_order_qty: { label: 'min_order_qty', help: 'จำนวนขั้นต่ำที่สั่งได้ ปกติ 1 — แสดงบนหน้าสินค้า ยังไม่ได้บังคับในตะกร้า', number: true },
  supplier_name: { label: 'supplier_name', help: 'ชื่อผู้จัดจำหน่ายที่รับของมา ใช้ในรายงาน ลูกค้าไม่เห็น' },
};

/**
 * The topics a merchant actually works in.
 *
 * Chosen by the job rather than by the shape of the record: someone repricing
 * does not want to scroll past image URLs, and someone fixing brand names does
 * not want to risk a stray edit to a price. `all` exists because sometimes the
 * answer really is everything.
 */
const GROUPS = [
  { key: 'basic', label: 'ข้อมูลพื้นฐาน', note: 'ชื่อ หมวดหมู่ แบรนด์ SKU บาร์โค้ด', columns: ['id', 'name', 'slug', 'category', 'brand', 'sku', 'barcode'] },
  { key: 'price', label: 'ราคา', note: 'ราคาขาย ราคาก่อนลด ราคาทุน', columns: ['id', 'name', 'sku', 'price', 'oldPrice', 'cost_price'] },
  { key: 'stock', label: 'สต็อกและสถานะ', note: 'จำนวนคงเหลือ จุดแจ้งเตือน สถานะการขาย', columns: ['id', 'name', 'sku', 'stock', 'low_stock_threshold', 'state'] },
  { key: 'images', label: 'รูปภาพ', note: 'รูปหน้าปก รูปเพิ่มเติม รูปในรายละเอียด', columns: ['id', 'name', 'img', 'images', 'detailImages'] },
  { key: 'content', label: 'รายละเอียดและคลิป', note: 'คำอธิบาย ข้อมูลจำเพาะ คลิปรีวิว', columns: ['id', 'name', 'desc', 'specs', 'review_video'] },
  { key: 'featured', label: 'สินค้าแนะนำ', note: 'ธงแนะนำ ลำดับ และป้ายสถานะ', columns: ['id', 'name', 'home_featured', 'home_featured_order', 'status'] },
  { key: 'shipping', label: 'น้ำหนักและขนาดกล่อง', note: 'สำหรับคำนวณค่าจัดส่ง', columns: ['id', 'name', 'sku', 'weight_kg', 'length_cm', 'width_cm', 'height_cm'] },
  { key: 'commercial', label: 'ข้อมูลการขาย', note: 'หน่วยนับ รุ่น ประกัน แหล่งผลิต ขั้นต่ำ', columns: ['id', 'name', 'sku', 'unit', 'model', 'warranty', 'origin', 'min_order_qty'] },
  { key: 'supplier', label: 'ผู้จัดจำหน่าย', note: 'ใครเป็นคนส่งของให้ร้าน', columns: ['id', 'name', 'sku', 'supplier_name'] },
];

/** Every column, in the order the groups introduce them. */
const ALL_COLUMNS = (() => {
  const seen = [];
  for (const group of GROUPS) for (const column of group.columns) if (!seen.includes(column)) seen.push(column);
  for (const column of Object.keys(COLUMNS)) if (!seen.includes(column)) seen.push(column);
  return seen;
})();

/** The join keys, which no export may drop and no import may write. */
const ANCHOR_COLUMNS = ['id', 'name'];

function groupColumns(keys) {
  if (!keys || !keys.length || keys.includes('all')) return [...ALL_COLUMNS];
  const chosen = [];
  for (const key of keys) {
    const group = GROUPS.find((row) => row.key === key);
    if (!group) continue;
    for (const column of group.columns) if (!chosen.includes(column)) chosen.push(column);
  }
  // Asked for nothing recognisable, given everything: an empty file is never
  // the answer somebody wanted.
  if (!chosen.length) return [...ALL_COLUMNS];
  for (const anchor of ANCHOR_COLUMNS) if (!chosen.includes(anchor)) chosen.unshift(anchor);
  return chosen;
}

/** A single cell, rendered. */
function renderCell(product, key) {
  const spec = COLUMNS[key];
  const value = product?.[key];
  if (value === undefined || value === null) return '';
  if (spec?.list) return Array.isArray(value) ? value.join(' | ') : String(value);
  if (spec?.specs) {
    if (!value || typeof value !== 'object') return '';
    return Object.entries(value).map(([label, entry]) => `${label}=${entry}`).join(' | ');
  }
  if (spec?.boolean) return value === true ? 'true' : 'false';
  return String(value);
}

/**
 * A cell, quoted only when it has to be.
 *
 * Excel and Google Sheets both read RFC 4180, and both will mangle a field
 * containing a comma, a quote or a newline unless it is quoted with its quotes
 * doubled. A leading `=`, `+`, `-` or `@` is prefixed with a single quote: a
 * bare one is executed as a formula when the file is opened, which is how a
 * product called "-40% SALE" becomes a spreadsheet error — and how a hostile
 * product name becomes a spreadsheet exploit.
 */
function escapeCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * The whole file.
 *
 * Prefixed with a byte-order mark because Excel on Windows opens a UTF-8 CSV as
 * the system code page without one, and the entire catalogue is in Thai: the
 * difference is a readable file and a screen of mojibake. CRLF for the same
 * reason.
 */
export function productsToCsv(products, columns) {
  const keys = columns && columns.length ? columns : ALL_COLUMNS;
  const lines = [keys.map(escapeCell).join(',')];
  for (const product of products) lines.push(keys.map((key) => escapeCell(renderCell(product, key))).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/**
 * Back from a file.
 *
 * Written as a character loop rather than a split, because a product
 * description legitimately contains commas and newlines and both of those are
 * inside quotes in a valid file. A split on "," would tear such a row apart and
 * an import would then write the second half of a description into the price
 * column.
 */
export function parseCsv(text) {
  const input = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let started = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') { cell += '"'; index++; }
        else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"' && !cell) { quoted = true; started = true; continue; }
    if (char === ',') { row.push(cell); cell = ''; started = true; continue; }
    if (char === '\r') continue;
    if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; started = false; continue; }
    cell += char;
    started = true;
  }
  if (started || cell || row.length) { row.push(cell); rows.push(row); }
  // A file that ends with a newline leaves one empty row behind, and a merchant
  // who left blank lines in the middle should not be told they have errors.
  return rows.filter((entry) => entry.some((value) => String(value).trim() !== ''));
}

/** Undo the formula guard, so a value survives export → import unchanged. */
function unguard(value) {
  const text = String(value ?? '').trim();
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

/**
 * One cell, read back into the shape the product record wants.
 *
 * Returns `{ ok, value }` rather than throwing: a bad cell should cost that one
 * row a clear message in the preview, not abort a file of nine hundred.
 */
export function parseCell(key, raw) {
  const spec = COLUMNS[key];
  if (!spec) return { ok: false, error: `ไม่รู้จักคอลัมน์ ${key}` };
  const text = unguard(raw);
  if (spec.list) return { ok: true, value: text ? text.split('|').map((entry) => entry.trim()).filter(Boolean) : [] };
  if (spec.specs) {
    if (!text) return { ok: true, value: {} };
    const specs = {};
    for (const pair of text.split('|')) {
      const at = pair.indexOf('=');
      if (at < 1) return { ok: false, error: `ข้อมูลจำเพาะต้องเป็น คีย์=ค่า — พบ "${pair.trim()}"` };
      specs[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
    }
    return { ok: true, value: specs };
  }
  if (spec.boolean) {
    const lowered = text.toLowerCase();
    if (['true', '1', 'yes', 'y', 'ใช่'].includes(lowered)) return { ok: true, value: true };
    if (['false', '0', 'no', 'n', '', 'ไม่ใช่'].includes(lowered)) return { ok: true, value: false };
    return { ok: false, error: `${key} ต้องเป็น true หรือ false — พบ "${text}"` };
  }
  if (spec.number) {
    if (!text) return spec.nullable ? { ok: true, value: null } : { ok: true, value: 0 };
    // Merchants paste "1,290" and "฿1290" out of habit, and both mean 1290.
    const numeric = Number(text.replace(/[,\s฿]/g, ''));
    if (!Number.isFinite(numeric)) return { ok: false, error: `${key} ต้องเป็นตัวเลข — พบ "${text}"` };
    return { ok: true, value: numeric };
  }
  return { ok: true, value: text };
}

/** True when the file would change this product in this column. */
export function cellChanged(product, key, value) {
  const before = renderCell(product, key);
  const after = renderCell({ [key]: value }, key);
  return before !== after;
}

export { COLUMNS, GROUPS, ALL_COLUMNS, ANCHOR_COLUMNS, groupColumns, renderCell };
