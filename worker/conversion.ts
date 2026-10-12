import mammoth from 'mammoth';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib';
import { Buffer } from 'node:buffer';
import {
  archive,
  decodeText,
  escapeHtml,
  ConversionError,
  UnsupportedType,
  pre,
  pptx,
  odf,
  epub,
  preview,
  iworkText,
  rtf,
  mail,
  legacyDoc,
  compound,
  msg,
  legacyPpt,
  mobi,
  imageMime,
  dataImage,
} from './formats.ts';
export { ConversionError, UnsupportedType } from './formats.ts';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const SERVER_EXTENSIONS =
  'docx doc pptx ppt odt rtf pages xlsx xls xlsb ods numbers csv tsv odp key epub mobi eml msg mhtml mht html htm md markdown txt json log js jsx ts tsx css scss py rb go rs java c h cpp hpp cs php sh bash zsh sql yaml yml xml toml ini conf'.split(
    ' ',
  );

function spreadsheet(
  bytes: Uint8Array,
  delimited: boolean,
): { body: string; wide: boolean } {
  const book = XLSX.read(delimited ? decodeText(bytes) : bytes, {
    type: delimited ? 'string' : 'array',
    cellHTML: false,
    cellFormula: false,
    sheetRows: 10001,
  });
  let cells = 0,
    wide = false;
  const body = book.SheetNames.map((name) => {
    const sheet = book.Sheets[name]!;
    if (!sheet['!ref'])
      return `<section class="sheet"><h1>${escapeHtml(name)}</h1><p>Empty sheet</p></section>`;
    const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref']);
    cells += (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
    if (range.e.r >= 10000 || range.e.c >= 200 || cells > 100000)
      throw new ConversionError('This spreadsheet is too complex to convert.');
    if (range.e.c - range.s.c >= 5) wide = true;
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    const row = (r: string[], tag: string) =>
      `<tr>${r.map((c) => `<${tag}>${escapeHtml(String(c))}</${tag}>`).join('')}</tr>`;
    return `<section class="sheet"><h1>${escapeHtml(name)}</h1><table><thead>${rows.length ? row(rows[0], 'th') : ''}</thead><tbody>${rows
      .slice(1)
      .map((r) => row(r, 'td'))
      .join('')}</tbody></table></section>`;
  }).join('');
  return { body, wide };
}
export type Converted = {
  html?: string;
  pdf?: Uint8Array;
  landscape?: boolean;
};
async function pdfResult(bytes: Uint8Array): Promise<Converted> {
  const pdf = await PDFDocument.load(bytes);
  if (!pdf.getPageCount()) throw new ConversionError('This PDF has no pages.');
  // Rebuild pages, excluding source document actions and attachments.
  const clean = await PDFDocument.create();
  for (const p of await clean.copyPages(pdf, pdf.getPageIndices()))
    clean.addPage(p);
  return { pdf: await clean.save() };
}
export async function toHtml(
  file: File,
  extension: string,
): Promise<Converted> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let body = '',
    pageCss = '',
    wide = false,
    trustedLayout = false;
  const magic = Buffer.from(bytes.subarray(0, 8)).toString('hex');
  const prefix = new TextDecoder().decode(bytes.subarray(0, 256));
  if (prefix.startsWith('%PDF-')) return pdfResult(bytes);
  if (imageMime(bytes)) body = `<img src="${dataImage(bytes)}">`;
  else if (magic.startsWith('504b0304') || magic.startsWith('504b0506')) {
    const z = archive(bytes);
    if (z['word/document.xml'])
      body = (await mammoth.convertToHtml({ arrayBuffer: bytes.buffer })).value;
    else if (z['ppt/presentation.xml']) {
      const result = pptx(z);
      body = result.body;
      pageCss = result.css;
      trustedLayout = true;
    } else if (z['xl/workbook.xml'] || z['xl/workbook.bin'])
      ({ body, wide } = spreadsheet(bytes, false));
    else if (z['META-INF/container.xml']) body = epub(z);
    else if (
      z.mimetype &&
      new TextDecoder().decode(z.mimetype).includes('opendocument.spreadsheet')
    )
      ({ body, wide } = spreadsheet(bytes, false));
    else if (z['content.xml'])
      body = odf(
        z,
        !!z.mimetype &&
          new TextDecoder().decode(z.mimetype).includes('presentation'),
      );
    else {
      const found = preview(z);
      if (found?.pdf) return pdfResult(found.pdf);
      if (found?.body) body = found.body;
      else if (
        ['pages', 'numbers', 'key'].includes(extension) ||
        Object.keys(z).some((p) => p.endsWith('.iwa'))
      )
        body = iworkText(z);
      else
        throw new UnsupportedType(
          `This .${extension || 'zip'} archive has no printable document or preview. Export it as PDF.`,
        );
    }
  } else if (magic === 'd0cf11e0a1b11ae1') {
    const c = compound(bytes),
      names = c.FileIndex.map((e) => e.name);
    if (names.includes('WordDocument')) body = await legacyDoc(bytes);
    else if (names.includes('Workbook') || names.includes('Book'))
      ({ body, wide } = spreadsheet(bytes, false));
    else if (names.includes('PowerPoint Document')) body = legacyPpt(c);
    else if (names.some((n) => n.startsWith('__substg1.0_'))) body = msg(c);
    else
      throw new UnsupportedType(
        `This .${extension || 'binary'} document has no supported content. Export it as PDF.`,
      );
  } else if (prefix.trimStart().startsWith('{\\rtf')) {
    body = rtf(bytes);
    trustedLayout = true;
  } else if (new TextDecoder().decode(bytes.subarray(60, 68)) === 'BOOKMOBI')
    body = mobi(bytes);
  else {
    let text: string;
    try {
      text = decodeText(bytes);
    } catch {
      throw new UnsupportedType(
        `This .${extension || 'binary'} file contains unrecognized binary data. Export it as PDF, an image, or plain text.`,
      );
    }
    if (!text.trim())
      throw new ConversionError('This file has no printable content.');
    if (
      ['eml', 'mhtml', 'mht'].includes(extension) ||
      (/^(?:MIME-Version|From|Subject|Content-Type):/im.test(text) &&
        /^Content-Type: (?:multipart|text\/html)/im.test(text))
    )
      body = await mail(bytes, extension !== 'eml');
    else if (['csv', 'tsv', 'xls', 'xlsb', 'xlsx', 'ods'].includes(extension))
      ({ body, wide } = spreadsheet(bytes, true));
    else if (
      extension === 'html' ||
      extension === 'htm' ||
      /^\s*<!doctype html/i.test(text)
    )
      body = text;
    else if (extension === 'md' || extension === 'markdown')
      body = await marked.parse(text);
    else {
      if (extension === 'json') {
        try {
          text = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          /* Valid text is still printable. */
        }
      }
      if (extension === 'xml') text = text.replace(/>\s*</g, '>\n<');
      body = `<h1>${escapeHtml(file.name)}</h1>${pre(text)}`;
    }
  }
  body = sanitizeHtml(body, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'width', 'height'],
      section: ['class', ...(trustedLayout ? ['style'] : [])],
      div: ['class', ...(trustedLayout ? ['style'] : [])],
      span: trustedLayout ? ['style'] : [],
      p: trustedLayout ? ['style'] : [],
    },
    allowedStyles: {
      '*': {
        left: [/^-?[\d.]+px$/],
        top: [/^-?[\d.]+px$/],
        width: [/^[\d.]+px$/],
        height: [/^[\d.]+px$/],
        'background-color': [/^(?:#[a-f0-9]{6}|transparent)$/i],
        color: [/^#[a-f0-9]{6}$/i],
        'font-size': [/^[\d.]+pt$/],
        'font-weight': [/^(?:bold|normal)$/],
        'font-style': [/^(?:italic|normal)$/],
        'text-align': [/^(?:left|right|center)$/],
      },
    },
    allowedSchemes: ['data'],
    allowedSchemesByTag: { a: ['https', 'http', 'mailto'], img: ['data'] },
    allowProtocolRelative: false,
    exclusiveFilter: (frame) =>
      frame.tag === 'img' &&
      !/^data:image\/(png|jpeg|gif|webp|bmp|avif);base64,/i.test(
        frame.attribs.src || '',
      ),
  });
  if (body.length > 12 * 1024 * 1024)
    throw new ConversionError('This document is too complex to convert.');
  if (!body.replace(/<[^>]*>/g, '').trim() && !body.includes('<img'))
    throw new ConversionError('This file has no printable content.');
  return {
    html: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; frame-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>
    body { font: 11pt/1.5 Arial, sans-serif; color: #17202a; overflow-wrap: anywhere; }
    h1,h2,h3 { line-height: 1.2; break-after: avoid; } h1 { font-size: 20pt; } h2 { font-size: 16pt; }
    table { border-collapse: collapse; width: 100%; font-size: 10pt; table-layout: fixed; }
    td,th { border: 1px solid #bcc4cc; padding: 5px 7px; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #eef1f5; } thead { display: table-header-group; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 10pt/1.5 monospace; }
    img { max-width: 100%; height: auto; } .sheet + .sheet { break-before: page; } a { color: inherit; }
  ${pageCss}</style></head><body>${body}</body></html>`,
    landscape: wide,
  };
}
