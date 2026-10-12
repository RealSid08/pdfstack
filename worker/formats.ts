import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { unzipSync, strFromU8 } from 'fflate';
import { Buffer } from 'node:buffer';
import * as CFB from 'cfb';
import PostalMime from 'postal-mime';
import WordExtractor from 'word-extractor';

export class ConversionError extends Error {}
export class UnsupportedType extends Error {}
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export const pre = (s: string) => `<pre>${escapeHtml(s)}</pre>`;
export type Archive = Record<string, Uint8Array>;
export function archive(bytes: Uint8Array): Archive {
  let total = 0,
    count = 0;
  unzipSync(bytes, {
    filter(e) {
      total += e.originalSize;
      if (++count > 5000 || total > 40 * 1024 * 1024)
        throw new ConversionError('This archive is too complex to convert.');
      return false;
    },
  });
  return unzipSync(bytes);
}
export function decodeText(bytes: Uint8Array): string {
  const encoding =
    bytes[0] === 255 && bytes[1] === 254
      ? 'utf-16le'
      : bytes[0] === 254 && bytes[1] === 255
        ? 'utf-16be'
        : 'utf-8';
  const text = new TextDecoder(encoding, {
    fatal: true,
    ignoreBOM: false,
  }).decode(bytes);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 32 && (c < 9 || c > 13)) throw new Error('Binary data');
  }
  return text;
}
// XML objects are limited to the bounded archive/input. DTDs and custom entities
// are rejected: no entity expansion or external resolution is needed here.
export function xml(s: string): any {
  if (/<!DOCTYPE|<!ENTITY/i.test(s) || XMLValidator.validate(s) !== true)
    throw new ConversionError(
      'This document contains invalid or unsupported XML.',
    );
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: false,
  }).parse(s);
}
const list = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const txt = (v: any): string =>
  typeof v === 'string' || typeof v === 'number'
    ? String(v)
    : Array.isArray(v)
      ? v.map(txt).join('')
      : v && typeof v === 'object'
        ? Object.entries(v)
            .filter(([k]) => !k.startsWith('@'))
            .map(([, v]) => txt(v))
            .join('')
        : '';
const read = (z: Archive, path: string) => {
  if (!z[path])
    throw new ConversionError('This document is missing required content.');
  return strFromU8(z[path]);
};
function resolve(base: string, target: string): string {
  const parts = (
    target.startsWith('/')
      ? target.slice(1)
      : base.slice(0, base.lastIndexOf('/') + 1) + target
  ).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
}
function rels(z: Archive, path: string): Record<string, string> {
  const relpath = path.replace(/([^/]+)$/, '_rels/$1.rels');
  if (!z[relpath]) return {};
  return Object.fromEntries(
    list(xml(read(z, relpath)).Relationships?.Relationship)
      .filter((r) => r['@TargetMode'] !== 'External')
      .map((r) => [r['@Id'], resolve(path, r['@Target'])]),
  );
}
export function imageMime(b: Uint8Array): string | undefined {
  const h = Buffer.from(b.subarray(0, 16));
  if (h.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (h[0] === 255 && h[1] === 216 && h[2] === 255) return 'image/jpeg';
  if (h.toString().startsWith('GIF8')) return 'image/gif';
  if (h.toString().startsWith('BM')) return 'image/bmp';
  if (h.toString().startsWith('RIFF') && h.toString().slice(8, 12) === 'WEBP')
    return 'image/webp';
  if (h.toString().slice(4, 12) === 'ftypavif') return 'image/avif';
}
export function dataImage(bytes: Uint8Array): string {
  const mime = imageMime(bytes);
  return mime
    ? `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
    : '';
}
function embedded(z: Archive, path: string) {
  const uri = z[path] && dataImage(z[path]);
  return uri ? `<img src="${uri}" alt="">` : '';
}
const finite = (v: unknown, fallback = 0) =>
  Number.isFinite(Number(v))
    ? Math.max(-100000000, Math.min(100000000, Number(v)))
    : fallback;
const color = (v: any, fallback: string) =>
  /^[0-9a-f]{6}$/i.test(v?.srgbClr?.['@val'])
    ? '#' + v.srgbClr['@val']
    : fallback;
export function pptx(z: Archive): { body: string; css: string } {
  const p = xml(read(z, 'ppt/presentation.xml')).presentation;
  const width = finite(p.sldSz?.['@cx'], 12192000) / 9525,
    height = finite(p.sldSz?.['@cy'], 6858000) / 9525;
  if (width <= 0 || height <= 0 || width > 5000 || height > 5000)
    throw new ConversionError('Invalid slide size.');
  const relationships = rels(z, 'ppt/presentation.xml');
  const slides = list(p.sldIdLst?.sldId);
  if (slides.length > 300)
    throw new ConversionError('This presentation has too many slides.');
  const body = slides
    .map((s) => {
      const path = relationships[s['@id']] || relationships[s['@r:id']];
      const slide = xml(read(z, path)).sld,
        tree = slide.cSld?.spTree,
        images = rels(z, path);
      const nodes = [
        ...list(tree?.sp).map((n) => ({ n, picture: false })),
        ...list(tree?.pic).map((n) => ({ n, picture: true })),
      ];
      return `<section class="slide" style="background-color:${color(slide.cSld?.bg?.bgPr?.solidFill, '#ffffff')}">${nodes
        .map(({ n, picture }) => {
          const t = n.spPr?.xfrm,
            x = finite(t?.off?.['@x']) / 9525,
            y = finite(t?.off?.['@y']) / 9525;
          const w = finite(t?.ext?.['@cx'], 6000000) / 9525,
            h = finite(t?.ext?.['@cy'], 1000000) / 9525;
          const style = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;background-color:${color(n.spPr?.solidFill, 'transparent')}`;
          if (picture)
            return `<div class="shape" style="${style}">${embedded(z, images[n.blipFill?.blip?.['@embed']])}</div>`;
          const paragraphs = list(n.txBody?.p)
            .map(
              (p) =>
                `<p style="text-align:${({ ctr: 'center', r: 'right', l: 'left' } as Record<string, string>)[p.pPr?.['@algn']] || 'left'}">${
                  list(p.r)
                    .map((r) => {
                      const f = r.rPr || {};
                      return `<span style="font-size:${Math.max(6, Math.min(200, finite(f['@sz'], 2400) / 100))}pt;font-weight:${f['@b'] === '1' ? 'bold' : 'normal'};font-style:${f['@i'] === '1' ? 'italic' : 'normal'};color:${color(f.solidFill, '#17202a')}">${escapeHtml(txt(r.t))}</span>`;
                    })
                    .join('') || escapeHtml(txt(p.fld?.t))
                }</p>`,
            )
            .join('');
          return `<div class="shape" style="${style}">${paragraphs}</div>`;
        })
        .join('')}</section>`;
    })
    .join('');
  return {
    body,
    css: `@page{size:${width}px ${height}px;margin:0}body{margin:0}.slide{position:relative;width:${width}px;height:${height}px;overflow:hidden;break-after:page}.slide:last-child{break-after:auto}.shape{position:absolute;overflow:hidden}.shape p{margin:0;line-height:1.2}.shape img{width:100%;height:100%;object-fit:contain}`,
  };
}
export function odf(z: Archive, presentation: boolean): string {
  // Preserve mixed-content order with a narrow XML-to-HTML mapping. All content
  // subsequently passes through the shared sanitizer.
  let s = read(z, 'content.xml');
  xml(s);
  if (presentation)
    s =
      s.match(
        /<office:presentation\b[^>]*>([\s\S]*?)<\/office:presentation>/,
      )?.[1] || '';
  else s = s.match(/<office:text\b[^>]*>([\s\S]*?)<\/office:text>/)?.[1] || '';
  s = s.replace(
    /<draw:image\b[^>]*xlink:href="([^"]+)"[^>]*\/?\s*>/g,
    (_, path) => embedded(z, path),
  );
  const tags: Record<string, string> = {
    'text:p': 'p',
    'text:h': 'h2',
    'text:span': 'span',
    'text:line-break': 'br',
    'text:tab': 'span',
    'table:table': 'table',
    'table:table-row': 'tr',
    'table:table-cell': 'td',
    'draw:page': 'section',
  };
  return s.replace(
    /<(\/?)((?:text|table|draw|office):[\w-]+)\b[^>]*>/g,
    (_, end, name) =>
      tags[name]
        ? `<${end}${tags[name]}${!end && name === 'draw:page' ? ' class="sheet"' : ''}>`
        : '',
  );
}
export function epub(z: Archive): string {
  const root = xml(read(z, 'META-INF/container.xml')).container;
  const path = list(root.rootfiles?.rootfile)[0]?.['@full-path'];
  const opf = xml(read(z, path)).package;
  const items = Object.fromEntries(
    list(opf.manifest?.item).map((i) => [i['@id'], resolve(path, i['@href'])]),
  );
  return list(opf.spine?.itemref)
    .filter((i) => i['@linear'] !== 'no')
    .map((i) => {
      const chapter = items[i['@idref']];
      let html = read(z, chapter);
      html = html.replace(
        /(<img\b[^>]*\bsrc=)["']([^"']+)["']/gi,
        (_, prefix, url) =>
          `${prefix}"${dataImage(z[resolve(chapter, decodeURIComponent(url))] || new Uint8Array())}"`,
      );
      return `<section class="sheet">${html}</section>`;
    })
    .join('');
}
export function preview(
  z: Archive,
): { pdf?: Uint8Array; body?: string } | undefined {
  const pdf = Object.keys(z)
    .filter((p) => /(?:^|\/)(?:preview[^/]*|quicklook\/[^/]*)\.pdf$/i.test(p))
    .sort((a, b) => z[b].length - z[a].length)[0];
  if (pdf) return { pdf: z[pdf] };
  const candidates = Object.keys(z).filter((p) =>
    /(?:^|\/)(?:preview[^/]*|thumbnail[^/]*|quicklook\/[^/]*)\.(?:jpg|jpeg|png)$/i.test(
      p,
    ),
  );
  // PNG dimensions and JPEG SOF dimensions, not compressed byte size.
  function area(b: Uint8Array) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (imageMime(b) === 'image/png' && b.length >= 24)
      return v.getUint32(16) * v.getUint32(20);
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 255) break;
      const marker = b[i + 1];
      if ([192, 193, 194].includes(marker))
        return v.getUint16(i + 5) * v.getUint16(i + 7);
      const size = v.getUint16(i + 2);
      if (size < 2) break;
      i += 2 + size;
    }
    return 0;
  }
  candidates.sort((a, b) => area(z[b]) - area(z[a]));
  if (candidates.length) return { body: embedded(z, candidates[0]) };
}
export function iworkText(z: Archive): string {
  const files = Object.keys(z).filter((p) =>
    /(?:index|document).*\.xml$/i.test(p),
  );
  const text = files
    .map((p) => {
      const s = read(z, p);
      xml(s);
      return s.replace(/<[^>]+>/g, ' ');
    })
    .join('\n');
  if (!text.trim())
    throw new ConversionError(
      'This iWork document has no readable preview. Export it as PDF from Pages, Numbers, or Keynote.',
    );
  return `<p>Extracted document text</p>${pre(text)}`;
}
export function rtf(bytes: Uint8Array): string {
  const s = new TextDecoder('windows-1252').decode(bytes);
  type State = { skip: boolean; uc: number; bold: boolean; italic: boolean };
  let state: State = { skip: false, uc: 1, bold: false, italic: false };
  const stack: State[] = [];
  let out = '',
    fallback = 0;
  const emit = (t: string) => {
    if (!state.skip)
      out += `<span${state.bold || state.italic ? ` style="font-weight:${state.bold ? 'bold' : 'normal'};font-style:${state.italic ? 'italic' : 'normal'}"` : ''}>${escapeHtml(t)}</span>`;
  };
  for (let i = 0; i < s.length;) {
    const c = s[i++];
    if (c === '{') {
      if (stack.length > 256)
        throw new ConversionError('RTF nesting is too deep.');
      stack.push({ ...state });
    } else if (c === '}') {
      state = stack.pop() || state;
    } else if (c === '\\') {
      const rest = s.slice(i),
        hex = /^'([0-9a-f]{2})/i.exec(rest),
        word = /^([a-z]+)(-?\d+)? ?/i.exec(rest);
      if (hex) {
        i += 3;
        if (fallback) fallback--;
        else
          emit(
            new TextDecoder('windows-1252').decode(
              new Uint8Array([parseInt(hex[1], 16)]),
            ),
          );
      } else if (word) {
        i += word[0].length;
        const n = Number(word[2]),
          k = word[1];
        if (
          [
            'fonttbl',
            'colortbl',
            'stylesheet',
            'info',
            'pict',
            'object',
            'header',
            'footer',
            'fldinst',
            'datastore',
            'themedata',
          ].includes(k)
        )
          state.skip = true;
        else if (k === 'bin') {
          if (!Number.isSafeInteger(n) || n < 0 || n > s.length - i)
            throw new ConversionError('Invalid RTF binary length.');
          i += n;
        } else if (k === 'uc') state.uc = Math.max(0, Math.min(16, n));
        else if (k === 'u') {
          emit(String.fromCharCode(n < 0 ? n + 65536 : n));
          fallback = state.uc;
        } else if (k === 'par' || k === 'line') {
          if (!state.skip) out += '<br>';
        } else if (k === 'tab') emit('\t');
        else if (k === 'b') state.bold = word[2] !== '0';
        else if (k === 'i') state.italic = word[2] !== '0';
      } else {
        const sym = s[i++];
        if (sym === '*') state.skip = true;
        else if (['\\', '{', '}'].includes(sym)) {
          if (fallback) fallback--;
          else emit(sym);
        } else if (sym === '~') emit(' ');
      }
    } else if (c !== '\r' && c !== '\n') {
      if (fallback) fallback--;
      else emit(c);
    }
    if (out.length > 12 * 1024 * 1024)
      throw new ConversionError('This RTF is too complex to convert.');
  }
  return out;
}
export async function mail(bytes: Uint8Array, mhtml: boolean): Promise<string> {
  const locations: Record<string, string> = {};
  if (mhtml) {
    let index = 0;
    const raw = Buffer.from(bytes)
      .toString('latin1')
      .replace(
        /^Content-Location:[ \t]*([^\r\n]+)\r?\n/gim,
        (header: string, location: string) => {
          const id = `local-mhtml-${index++}`;
          locations[location.trim()] = id;
          return `${header}Content-ID: <${id}>\r\n`;
        },
      );
    bytes = new Uint8Array(Buffer.from(raw, 'latin1'));
  }
  const email = await PostalMime.parse(bytes, {
    maxNestingDepth: 30,
    maxPartCount: 500,
    maxHeadersSize: 262144,
  });
  let body = email.html || pre(email.text || '');
  if (mhtml)
    body = body.replace(
      /(<img\b[^>]*\bsrc=)["']([^"']+)["']/gi,
      (_, prefix, src) =>
        `${prefix}"${locations[src] ? 'cid:' + locations[src] : src}"`,
    );
  for (const a of email.attachments) {
    const b =
      typeof a.content === 'string'
        ? Buffer.from(a.content, a.encoding === 'base64' ? 'base64' : 'utf8')
        : new Uint8Array(a.content);
    const uri = dataImage(b);
    if (!uri) continue;
    const ids = [a.contentId?.replace(/^<|>$/g, ''), a.filename].filter(
      Boolean,
    ) as string[];
    for (const id of ids) body = body.split(`cid:${id}`).join(uri);
  }
  const headers = mhtml
    ? ''
    : `<h1>${escapeHtml(email.subject || 'Email')}</h1>${['from', 'to', 'date']
        .map((key) => {
          const h = email.headers.find((h) => h.key === key);
          return h ? `<p><b>${key}:</b> ${escapeHtml(h.value)}</p>` : '';
        })
        .join('')}<hr>`;
  return headers + body;
}
export async function legacyDoc(bytes: Uint8Array) {
  return pre((await new WordExtractor().extract(Buffer.from(bytes))).getBody());
}
export function compound(bytes: Uint8Array) {
  return CFB.read(bytes, { type: 'array' });
}
export function msg(c: CFB.CFB$Container): string {
  const get = (id: string) => {
    const e =
      c.FileIndex.find(
        (e) => e.name.toLowerCase() === `__substg1.0_${id}001f`,
      ) ||
      c.FileIndex.find((e) => e.name.toLowerCase() === `__substg1.0_${id}001e`);
    return e
      ? new TextDecoder(
          e.name.endsWith('001F') || e.name.endsWith('001f')
            ? 'utf-16le'
            : 'windows-1252',
        )
          .decode(new Uint8Array(e.content))
          .replace(/\0+$/, '')
      : '';
  };
  const body = get('1000');
  if (!body.trim())
    throw new ConversionError(
      'This Outlook message has no plain-text body. Export it as EML or PDF.',
    );
  return `<h1>${escapeHtml(get('0037') || 'Outlook message')}</h1><p>${escapeHtml(get('0c1a'))}</p>${pre(body)}`;
}
export function legacyPpt(c: CFB.CFB$Container): string {
  const entry = CFB.find(c, 'PowerPoint Document');
  if (!entry) throw new ConversionError('Invalid PowerPoint document.');
  const b = new Uint8Array(entry.content),
    v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let output = '',
    textCount = 0;
  const walk = (start: number, end: number, depth: number) => {
    if (depth > 40)
      throw new ConversionError('Presentation nesting is too deep.');
    for (let i = start; i + 8 <= end;) {
      const flags = v.getUint16(i, true),
        type = v.getUint16(i + 2, true),
        len = v.getUint32(i + 4, true),
        next = i + 8 + len;
      if (next > end) throw new ConversionError('Damaged PowerPoint record.');
      if ((flags & 15) === 15) {
        if (type === 1006) output += '<section class="sheet">';
        walk(i + 8, next, depth + 1);
        if (type === 1006) output += '</section>';
      } else if (type === 4000 || type === 4008) {
        const s = new TextDecoder(
          type === 4000 ? 'utf-16le' : 'windows-1252',
        ).decode(b.subarray(i + 8, next));
        output += pre(s.replace(/\0/g, ''));
        textCount += s.length;
      }
      i = next;
    }
  };
  // Older PPTs retain historical edits, masters and notes in the same stream.
  // Prefer the last Document's instance-0 SlideListWithText to avoid printing
  // deleted text, master placeholders and duplicate prior revisions.
  let document: { start: number; end: number } | undefined;
  const slideRecords: { start: number; end: number }[] = [];
  for (let i = 0; i + 8 <= b.length;) {
    const type = v.getUint16(i + 2, true),
      end = i + 8 + v.getUint32(i + 4, true);
    if (end > b.length) throw new ConversionError('Damaged PowerPoint record.');
    if (type === 1000) document = { start: i + 8, end };
    if (type === 1006) slideRecords.push({ start: i + 8, end });
    i = end;
  }
  if (document) {
    for (let i = document.start; i + 8 <= document.end;) {
      const flags = v.getUint16(i, true),
        type = v.getUint16(i + 2, true),
        end = i + 8 + v.getUint32(i + 4, true);
      if (end > document.end)
        throw new ConversionError('Damaged PowerPoint record.');
      if (type === 4080 && flags >> 4 === 0) {
        let section = false;
        for (let j = i + 8; j + 8 <= end;) {
          const kind = v.getUint16(j + 2, true),
            next = j + 8 + v.getUint32(j + 4, true);
          if (next > end)
            throw new ConversionError('Damaged PowerPoint record.');
          if (kind === 1011) {
            if (section) output += '</section>';
            output += '<section class="sheet">';
            section = true;
          } else walk(j, next, 0);
          j = next;
        }
        if (section) output += '</section>';
      }
      i = end;
    }
  }
  if (!textCount) {
    output = '';
    if (slideRecords.length)
      for (const record of slideRecords) {
        output += '<section class="sheet">';
        walk(record.start, record.end, 0);
        output += '</section>';
      }
    else if (document) walk(document.start, document.end, 0);
  }

  // Legacy image placement is unavailable; recover embedded PNG/JPEGs in a
  // separate image appendix rather than inventing slide associations.
  const pictures = CFB.find(c, 'Pictures');
  if (pictures) {
    const p = new Uint8Array(pictures.content);
    for (let i = 0; i < p.length - 8; i++) {
      if (p[i] === 255 && p[i + 1] === 216 && p[i + 2] === 255) {
        let j = i + 3;
        while (j + 1 < p.length && !(p[j] === 255 && p[j + 1] === 217)) j++;
        if (j + 1 < p.length) {
          output += `<img src="${dataImage(p.subarray(i, j + 2))}">`;
          i = j + 1;
        }
      } else if (
        p[i] === 137 &&
        p[i + 1] === 80 &&
        p[i + 2] === 78 &&
        p[i + 3] === 71
      ) {
        let j = i + 8;
        while (j + 12 <= p.length) {
          const n = new DataView(p.buffer, p.byteOffset + j, 4).getUint32(0);
          if (n > p.length - j - 12) break;
          const end =
            p[j + 4] === 73 &&
            p[j + 5] === 69 &&
            p[j + 6] === 78 &&
            p[j + 7] === 68;
          j += n + 12;
          if (end) {
            output += `<img src="${dataImage(p.subarray(i, j))}">`;
            i = j - 1;
            break;
          }
        }
      }
    }
  }
  if (!textCount && !output.includes('<img'))
    throw new ConversionError(
      'No readable slide content. Export this presentation as PPTX or PDF.',
    );
  return output;
}
export function mobi(b: Uint8Array): string {
  if (b.length < 86) throw new ConversionError('Invalid MOBI file.');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength),
    count = v.getUint16(76),
    offset = (i: number) => v.getUint32(78 + i * 8);
  if (count < 2 || 78 + count * 8 > b.length)
    throw new ConversionError('Invalid MOBI records.');
  const start = offset(0);
  if (start + 16 > b.length) throw new ConversionError('Invalid MOBI header.');
  const compression = v.getUint16(start),
    records = v.getUint16(start + 8),
    size = v.getUint32(start + 4);
  if (records >= count || size > 12 * 1024 * 1024)
    throw new ConversionError('This e-book is too complex to convert.');
  if (![1, 2].includes(compression) || v.getUint16(start + 12) !== 0)
    throw new ConversionError(
      'This MOBI uses encryption or unsupported compression. Export it as EPUB or PDF.',
    );
  const output = new Uint8Array(size);
  let written = 0;
  for (let r = 1; r <= records && written < size; r++) {
    const end = r + 1 < count ? offset(r + 1) : b.length;
    if (offset(r) > end || end > b.length)
      throw new ConversionError('Invalid MOBI record.');
    const data = b.subarray(offset(r), end),
      out = new Uint8Array(Math.min(65536, size - written));
    let used = 0;
    const emit = (n: number) => {
      if (used >= out.length)
        throw new ConversionError('This MOBI record is too large.');
      out[used++] = n;
    };
    for (let i = 0; i < data.length && written + used < size; i++) {
      const n = data[i];
      if (compression === 1 || n === 0 || (n >= 9 && n <= 127)) emit(n);
      else if (n <= 8) {
        for (let j = 0; j < n && i + 1 < data.length; j++) emit(data[++i]);
      } else if (n >= 192) {
        emit(32);
        emit(n ^ 128);
      } else {
        if (i + 1 >= data.length)
          throw new ConversionError('Invalid MOBI compression.');
        const pair = (n << 8) | data[++i],
          distance = (pair >> 3) & 2047,
          len = (pair & 7) + 3;
        if (!distance || distance > used)
          throw new ConversionError('Invalid MOBI compression.');
        for (let j = 0; j < len; j++) emit(out[used - distance]);
      }
    }
    output.set(out.subarray(0, used), written);
    written += used;
  }

  const encoding =
    start + 32 <= b.length && v.getUint32(start + 16) === 0x4d4f4249
      ? v.getUint32(start + 28)
      : 65001;
  return new TextDecoder(encoding === 1252 ? 'windows-1252' : 'utf-8').decode(
    output.subarray(0, written),
  );
}
