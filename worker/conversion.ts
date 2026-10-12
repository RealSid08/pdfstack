import mammoth from 'mammoth';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import * as XLSX from 'xlsx';
import { unzipSync } from 'fflate';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const SERVER_EXTENSIONS = ['docx', 'xlsx', 'csv', 'html', 'htm', 'md', 'markdown', 'txt', 'json', 'log', 'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'sql', 'yaml', 'yml', 'xml', 'toml', 'ini', 'conf'];
export class ConversionError extends Error {}
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Inspect archive metadata without inflating it, before handing it to an Office parser.
function checkArchive(bytes: Uint8Array, required: string) {
  let total = 0;
  let count = 0;
  let found = false;
  unzipSync(bytes, { filter(entry) {
    total += entry.originalSize;
    count++;
    if (entry.name === required) found = true;
    if (total > 40 * 1024 * 1024 || count > 5000) throw new ConversionError('This document is too complex to convert.');
    return false;
  } });
  if (!found) throw new ConversionError('This document is damaged or is not a valid Office file.');
}

function spreadsheet(bytes: Uint8Array, csv: boolean): string {
  const book = XLSX.read(csv ? decodeText(bytes) : bytes, { type: csv ? 'string' : 'array', cellHTML: false, cellFormula: false, sheetRows: 10001 });
  let cells = 0;
  return book.SheetNames.map((name) => {
    const sheet = book.Sheets[name]!;
    if (!sheet['!ref']) return `<section class="sheet"><h1>${escapeHtml(name)}</h1><p>Empty sheet</p></section>`;
    const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref']);
    cells += (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
    if (range.e.r >= 10000 || range.e.c >= 200 || cells > 100000) throw new ConversionError('This spreadsheet is too complex to convert.');
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
    return `<section class="sheet"><h1>${escapeHtml(name)}</h1><table><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
  }).join('');
}

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true, ignoreBOM: false }).decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true, ignoreBOM: false }).decode(bytes);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  if (text.includes('\0')) throw new ConversionError('This file does not contain readable text.');
  return text;
}

export async function toHtml(file: File, extension: string): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let body: string;
  if (extension === 'docx') {
    checkArchive(bytes, 'word/document.xml');
    body = (await mammoth.convertToHtml({ arrayBuffer: bytes.buffer })).value;
  } else if (extension === 'xlsx' || extension === 'csv') {
    if (extension === 'xlsx') checkArchive(bytes, 'xl/workbook.xml');
    body = spreadsheet(bytes, extension === 'csv');
  } else {
    let text = decodeText(bytes);
    if (extension === 'html' || extension === 'htm') body = text;
    else if (extension === 'md' || extension === 'markdown') body = await marked.parse(text);
    else {
      if (extension === 'json') text = JSON.stringify(JSON.parse(text), null, 2);
      body = `<pre>${escapeHtml(text)}</pre>`;
    }
  }
  // Remove active content, frames, CSS, external assets, and unsafe links. The
  // browser also disables JS, uses CSP, and aborts every network request.
  body = sanitizeHtml(body, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ['src', 'alt', 'width', 'height'], section: ['class'] },
    allowedSchemes: ['data'], allowedSchemesByTag: { a: ['https', 'http', 'mailto'], img: ['data'] },
    allowProtocolRelative: false,
    exclusiveFilter: (frame) => frame.tag === 'img' && !/^data:image\/(png|jpeg|gif|webp);base64,/i.test(frame.attribs.src || ''),
  });
  if (body.length > 12 * 1024 * 1024) throw new ConversionError('This document is too complex to convert.');
  if (!body.replace(/<[^>]*>/g, '').trim() && !body.includes('<img')) throw new ConversionError('This file has no printable content.');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; frame-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>
    body { font: 11pt/1.5 Arial, sans-serif; color: #17202a; overflow-wrap: anywhere; }
    h1,h2,h3 { line-height: 1.2; break-after: avoid; } h1 { font-size: 20pt; } h2 { font-size: 16pt; }
    table { border-collapse: collapse; width: 100%; font-size: 10pt; table-layout: fixed; }
    td,th { border: 1px solid #bcc4cc; padding: 5px 7px; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #eef1f5; } thead { display: table-header-group; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 10pt/1.5 monospace; }
    img { max-width: 100%; height: auto; } .sheet + .sheet { break-before: page; } a { color: inherit; }
  </style></head><body>${body}</body></html>`;
}
