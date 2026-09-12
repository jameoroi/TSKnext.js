/**
 * Read and write .xlsx, with nothing installed.
 *
 * The shop's bulk product edit was a CSV, and CSV is where Thai text goes to
 * die: Excel on Windows reads a UTF-8 file as the system codepage unless it
 * finds a byte-order mark, so ชื่อสินค้า opens as mojibake, someone "fixes" it by
 * re-saving, and the file comes back with the encoding baked in wrong. There is
 * also no such thing as a column type, a dropdown, or a second sheet of
 * instructions in a CSV. Everyone who is not the person who wrote the exporter
 * finds it confusing, which is exactly the report that prompted this.
 *
 * .xlsx has none of those problems — it is XML in a ZIP, and the XML is UTF-8
 * by definition — but every library that reads it is between 300 kB and a
 * megabyte, and this project deploys into a one megabyte Cloudflare Worker
 * whose current bundle is already 496 kB gzipped. So the format is implemented
 * here, in about the space one such library's licence header takes up.
 *
 * The two things that usually make this hard are already in the platform:
 * `CompressionStream('deflate-raw')` and `DecompressionStream('deflate-raw')`
 * are in every browser this shop supports and in Node 22. What is left is the
 * ZIP container, which is a documented byte layout, and the small subset of
 * SpreadsheetML that spreadsheets actually agree on.
 *
 * Deliberately narrow. It reads and writes a grid of strings and numbers with a
 * header row, several sheets, frozen headers and dropdown validation. It does
 * not do formulas, merged cells, images, pivot tables or styling beyond bold —
 * a product sheet needs none of them, and every one of them is a way for this
 * file to grow into the library it exists to avoid.
 *
 * Dates: written and read as text in ISO form, never as Excel serial numbers.
 * A serial number is a number until something decides it is a date, and that
 * decision differs between Excel, Google Sheets and LibreOffice — the 1900 leap
 * year bug is still in the format. Text means what it says everywhere.
 */

// ---------------------------------------------------------------- ZIP plumbing

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

async function through(bytes, stream) {
  const written = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(written).arrayBuffer());
}

/** Whether this runtime can deflate. Without it, .xlsx is not on the menu. */
export function xlsxSupported() {
  try {
    return typeof CompressionStream === 'function'
      && typeof DecompressionStream === 'function'
      && Boolean(new CompressionStream('deflate-raw'));
  } catch {
    return false;
  }
}

/**
 * Pack named byte arrays into a ZIP.
 *
 * Entries are deflated unless deflating makes them bigger, which happens with
 * the tiny relationship files — a stored entry is the honest choice there and
 * every reader accepts a mixed archive.
 */
async function zip(files) {
  const chunks = [];
  const directory = [];
  let offset = 0;

  for (const [name, bytes] of files) {
    const nameBytes = utf8.encode(name);
    const deflated = await through(bytes, new CompressionStream('deflate-raw'));
    const stored = deflated.length >= bytes.length;
    const body = stored ? bytes : deflated;
    const method = stored ? 0 : 8;
    const sum = crc32(bytes);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);      // version needed
    local.setUint16(6, 0x0800, true);  // flag: names and comments are UTF-8
    local.setUint16(8, method, true);
    local.setUint16(10, 0, true);      // time — fixed, see the note below
    local.setUint16(12, 0x21, true);   // date: 1980-01-01
    local.setUint32(14, sum, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, body);

    directory.push({ name: nameBytes, method, sum, packed: body.length, raw: bytes.length, offset });
    offset += 30 + nameBytes.length + body.length;
  }

  const central = [];
  let centralSize = 0;
  for (const entry of directory) {
    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(8, 0x0800, true);
    header.setUint16(10, entry.method, true);
    header.setUint16(12, 0, true);
    header.setUint16(14, 0x21, true);
    header.setUint32(16, entry.sum, true);
    header.setUint32(20, entry.packed, true);
    header.setUint32(24, entry.raw, true);
    header.setUint16(28, entry.name.length, true);
    header.setUint32(42, entry.offset, true);
    central.push(new Uint8Array(header.buffer), entry.name);
    centralSize += 46 + entry.name.length;
  }

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, directory.length, true);
  end.setUint16(10, directory.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  central.push(new Uint8Array(end.buffer));

  const all = [...chunks, ...central];
  const size = all.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of all) { out.set(part, at); at += part.length; }
  return out;
}

/** Unpack a ZIP into a name → bytes map. Reads the central directory, not the stream. */
async function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // The end-of-directory record is last, but a comment may follow it, so it is
  // found by scanning back for its signature rather than assumed to be at -22.
  let end = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 65558; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('xlsx_not_a_zip');

  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map();

  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('xlsx_bad_directory');
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = fromUtf8.decode(bytes.subarray(at + 46, at + 46 + nameLength));

    // The local header repeats the name and extra fields, and its extra field
    // is not always the same length as the central one — read its own.
    const localNameLength = view.getUint16(localAt + 26, true);
    const localExtraLength = view.getUint16(localAt + 28, true);
    const bodyAt = localAt + 30 + localNameLength + localExtraLength;
    const body = bytes.subarray(bodyAt, bodyAt + packed);

    if (method === 0) files.set(name, body);
    else if (method === 8) files.set(name, await through(body, new DecompressionStream('deflate-raw')));
    else throw new Error(`xlsx_unsupported_compression_${method}`);

    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// ------------------------------------------------------------- SpreadsheetML

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/**
 * Escape a string for XML, and drop what XML cannot carry.
 *
 * Control characters below 0x20 are not representable in XML 1.0 at all — not
 * even escaped — and product descriptions scraped from supplier sites do
 * contain them. A file with a raw 0x1F in it is not a corrupt spreadsheet, it
 * is not a spreadsheet: Excel refuses to open it and says nothing useful about
 * why. Dropping them is the only option that produces a file.
 */
function xml(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

/** 0 → A, 25 → Z, 26 → AA. Spreadsheet columns are bijective base-26. */
export function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** "BC12" → { column: 54, row: 11 }, both zero-based. */
function cellAddress(reference) {
  const match = /^([A-Z]+)(\d+)$/.exec(String(reference || '').toUpperCase());
  if (!match) return null;
  let column = 0;
  for (const letter of match[1]) column = column * 26 + (letter.charCodeAt(0) - 64);
  return { column: column - 1, row: Number(match[2]) - 1 };
}

/**
 * Every match of a tag, with its attributes and inner text.
 *
 * A regular expression, because the alternative is an XML parser and the input
 * is a document this file's counterpart wrote or a spreadsheet exported — not
 * arbitrary XML. It handles the two forms that appear: `<c .../>` and
 * `<c ...>…</c>`.
 */
function* tags(source, name) {
  const pattern = new RegExp(`<${name}(\\s[^>]*?)?(/>|>([\\s\\S]*?)</${name}>)`, 'g');
  for (const match of source.matchAll(pattern)) {
    yield { attributes: match[1] || '', body: match[3] ?? '' };
  }
}

function attribute(attributes, name) {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(attributes);
  return match ? match[1] : '';
}

const UNESCAPES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unxml(value) {
  return String(value ?? '').replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (whole, code) => {
    if (UNESCAPES[code] !== undefined) return UNESCAPES[code];
    if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
    return whole;
  });
}

/** The text of a cell that holds a string: `<is>` and `<si>` both wrap `<t>` runs. */
function richText(body) {
  let text = '';
  for (const run of tags(body, 't')) text += unxml(run.body);
  return text;
}

// ------------------------------------------------------------------- writing

/**
 * @typedef {object} SheetSpec
 * @property {string} name          Tab name, as the reader will see it.
 * @property {string[][]} rows      Cells, row-major. Row 0 is the header.
 * @property {boolean} [header]     Bold and freeze the first row. Default true.
 * @property {number[]} [widths]    Column widths in characters.
 * @property {Validation[]} [validations]
 */

/**
 * @typedef {object} Validation
 * @property {number} column        Zero-based column the dropdown applies to.
 * @property {string[]} options     The permitted values.
 * @property {boolean} [strict]     Refuse anything else. Default false — warn only.
 */

function sheetXml(sheet) {
  const rows = sheet.rows || [];
  const header = sheet.header !== false;
  const width = rows.reduce((n, row) => Math.max(n, row.length), 0);

  const columns = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';

  const body = rows.map((row, r) => {
    const cells = (row || []).map((value, c) => {
      const reference = `${columnName(c)}${r + 1}`;
      const style = header && r === 0 ? ' s="1"' : '';
      if (value === null || value === undefined || value === '') return `<c r="${reference}"${style}/>`;
      // A number only when it is unambiguously one. "0812345678" is a phone
      // number and "01" is a code; both lose their meaning as numbers, so
      // anything with a leading zero stays text.
      const isNumber = typeof value === 'number'
        || (typeof value === 'string' && /^-?(0|[1-9]\d*)(\.\d+)?$/.test(value) && value.length < 15);
      if (isNumber) return `<c r="${reference}"${style}><v>${xml(value)}</v></c>`;
      return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');

  // Dropdowns. `showErrorMessage="0"` warns without refusing: a supplier's
  // brand that is not in the shop's list yet is a normal thing to type, and a
  // spreadsheet that will not let you type it is worse than one that flags it.
  const validations = (sheet.validations || []).filter((v) => v.options?.length).map((v) => {
    const column = columnName(v.column);
    const list = v.options.map((option) => xml(option).replace(/,/g, ' ')).join(',');
    // Excel refuses an inline list over 255 characters. Longer lists are left
    // to the reference sheet and the import preview rather than truncated into
    // a dropdown that silently omits half the brands.
    if (list.length > 250) return '';
    return `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="${v.strict ? 1 : 0}" sqref="${column}2:${column}5000"><formula1>"${list}"</formula1></dataValidation>`;
  }).filter(Boolean);

  const frozen = header
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '';
  const autoFilter = header && rows.length > 1 && width > 0
    ? `<autoFilter ref="A1:${columnName(width - 1)}${rows.length}"/>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + frozen + columns
    + `<sheetData>${body}</sheetData>`
    + autoFilter
    + (validations.length ? `<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>` : '')
    + `</worksheet>`;
}

/**
 * Build an .xlsx workbook.
 *
 * @param {SheetSpec[]} sheets
 * @returns {Promise<Uint8Array>}
 */
export async function writeXlsx(sheets) {
  if (!sheets?.length) throw new Error('xlsx_no_sheets');
  if (!xlsxSupported()) throw new Error('xlsx_unsupported_runtime');

  const parts = [];
  const rels = [];
  sheets.forEach((sheet, index) => {
    const n = index + 1;
    parts.push([`xl/worksheets/sheet${n}.xml`, utf8.encode(sheetXml(sheet))]);
    rels.push(`<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`);
  });

  // Two fonts and two formats: plain, and bold for the header row. Anything
  // more is a styling engine, and this file is not one.
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
    + `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>`
    + `<borders count="1"><border/></borders>`
    + `<cellStyleXfs count="1"><xf/></cellStyleXfs>`
    + `<cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs>`
    // Without a named Normal style, readers report the workbook as having no
    // default and substitute their own. It costs one line to be correct.
    + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
    + `</styleSheet>`;

  const sheetTags = sheets.map((sheet, index) =>
    // Tab names cannot hold : \ / ? * [ ] and cannot exceed 31 characters.
    `<sheet name="${xml(String(sheet.name || `Sheet${index + 1}`).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
  ).join('');

  const files = [
    ['[Content_Types].xml', utf8.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
      + `<Default Extension="xml" ContentType="application/xml"/>`
      + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
      + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + `</Types>`)],
    ['_rels/.rels', utf8.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
      + `</Relationships>`)],
    ['xl/workbook.xml', utf8.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheets>${sheetTags}</sheets></workbook>`)],
    ['xl/_rels/workbook.xml.rels', utf8.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + rels.join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + `</Relationships>`)],
    ['xl/styles.xml', utf8.encode(styles)],
    ...parts,
  ];

  return zip(files);
}

// ------------------------------------------------------------------- reading

/**
 * Read an .xlsx into sheets of string cells.
 *
 * Everything comes back as a string. A spreadsheet column holds whatever
 * somebody typed, and deciding that "5" is a number and "5 ชิ้น" is not belongs
 * to the code that knows what the column means — not here.
 *
 * @param {Uint8Array|ArrayBuffer} input
 * @returns {Promise<{name: string, rows: string[][]}[]>}
 */
export async function readXlsx(input) {
  if (!xlsxSupported()) throw new Error('xlsx_unsupported_runtime');
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const files = await unzip(bytes);

  const text = (name) => {
    const found = files.get(name);
    return found ? fromUtf8.decode(found) : '';
  };

  // Excel keeps every string in one table and puts an index in the cell.
  // Google Sheets and this writer use inline strings instead. Both appear.
  const shared = [];
  for (const item of tags(text('xl/sharedStrings.xml'), 'si')) shared.push(richText(item.body));

  // Sheets are named in the workbook and located through its relationships;
  // the file names are conventional, not guaranteed.
  const targets = new Map();
  for (const rel of tags(text('xl/_rels/workbook.xml.rels'), 'Relationship')) {
    const target = attribute(rel.attributes, 'Target').replace(/^\/?(xl\/)?/, '');
    targets.set(attribute(rel.attributes, 'Id'), `xl/${target}`);
  }

  const workbook = text('xl/workbook.xml');
  const sheets = [];
  let index = 0;
  for (const tag of tags(workbook, 'sheet')) {
    index += 1;
    const name = unxml(attribute(tag.attributes, 'name')) || `Sheet${index}`;
    const relationship = attribute(tag.attributes, 'r:id');
    const path = targets.get(relationship) || `xl/worksheets/sheet${index}.xml`;
    const source = text(path);
    if (!source) continue;

    const rows = [];
    for (const row of tags(source, 'row')) {
      // The row's own r= is authoritative: a sheet may skip empty rows
      // entirely, and reading them in document order would shift everything up.
      const declared = Number(attribute(row.attributes, 'r'));
      const cells = [];
      let column = 0;
      for (const cell of tags(row.body, 'c')) {
        const reference = attribute(cell.attributes, 'r');
        const at = reference ? cellAddress(reference) : null;
        if (at) column = at.column;
        const type = attribute(cell.attributes, 't');
        let value = '';
        if (type === 's') {
          const pointer = Number(richTextValue(cell.body));
          value = shared[pointer] ?? '';
        } else if (type === 'inlineStr') {
          value = richText(cell.body);
        } else {
          value = unxml(richTextValue(cell.body));
        }
        while (cells.length < column) cells.push('');
        cells[column] = value;
        column += 1;
      }
      const at = Number.isFinite(declared) && declared > 0 ? declared - 1 : rows.length;
      while (rows.length < at) rows.push([]);
      rows[at] = cells;
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

/** The `<v>` of a cell, which is its value for every type but the inline string. */
function richTextValue(body) {
  for (const v of tags(body, 'v')) return v.body;
  return '';
}

// ----------------------------------------------------------------------- CSV
// Kept because a spreadsheet is not always what somebody has: an accountant's
// system exports CSV, and so does every marketplace. The BOM is not decoration
// — without it Excel on Windows reads UTF-8 as the system codepage and every
// Thai character in the file becomes a question mark.

export function writeCsv(rows) {
  const escape = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  // Terminated, not separated: a text file ends with a newline, every CSV
  // writer worth the name emits one, and matching that is what lets a workbook
  // unwrap to the byte-for-byte file the exporter would have produced.
  return `\uFEFF${rows.map((row) => `${(row || []).map(escape).join(',')}\r\n`).join('')}`;
}

/** Handles quoted fields, embedded commas, quotes and newlines. */
export function readCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');

  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* handled by the \n that follows */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ''));
}
