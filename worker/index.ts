import { events, traced, conversionResult } from './telemetry';
import puppeteer from '@cloudflare/puppeteer';
import type { Browser, Page } from '@cloudflare/puppeteer';
import {
  ConversionError,
  UnsupportedType,
  MAX_FILE_BYTES,
  SERVER_EXTENSIONS,
  toHtml,
} from './conversion';

export interface Env {
  ASSETS: Fetcher;
  EVENT_LIMITER: RateLimit;
  BROWSER: Fetcher;
  CONVERT_LIMITER: RateLimit;
  VERSION: WorkerVersionMetadata;
}
type Code =
  | 'UNSUPPORTED_TYPE'
  | 'TOO_LARGE'
  | 'CONVERSION_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL';
class UploadTooLarge extends Error {}
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...headers,
    },
  });
const failure = (
  code: Code,
  message: string,
  status: number,
  headers?: HeadersInit,
) => json({ error: { code, message } }, status, headers);

// Bound the entire multipart body, including chunked uploads, before formData
// allocates memory. File limit is 25 MiB; 64 KiB is reserved for form headers.
async function readUpload(
  request: Request,
  signal: AbortSignal,
): Promise<FormData> {
  const limit = MAX_FILE_BYTES + 64 * 1024;
  if (Number(request.headers.get('content-length')) > limit)
    throw new UploadTooLarge();
  if (!request.body) throw new ConversionError('Choose a file to convert.');
  const reader = request.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new UploadTooLarge();
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new Response(bytes, {
    headers: { 'content-type': request.headers.get('content-type') || '' },
  }).formData();
}

async function convert(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (
    !(
      await env.CONVERT_LIMITER.limit({
        key: `pdf:${request.headers.get('cf-connecting-ip') || 'local'}`,
      })
    ).success
  )
    return failure(
      'RATE_LIMITED',
      'Too many conversions. Please try again in a minute.',
      429,
      { 'retry-after': '60' },
    );
  let browser: Browser | undefined;
  let page: Page | undefined;
  const abort = new AbortController();
  let expired = false;
  let stage: 'input' | 'browser' | 'render' = 'input';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const close = async () => {
    try {
      if (page && !page.isClosed()) await page.close();
    } catch {
      /* Browser close below releases the session too. */
    }
    try {
      if (browser) await browser.close();
    } catch {
      /* Browser service also expires idle sessions. */
    }
  };
  const job = async (): Promise<Response> => {
    try {
      const form = await readUpload(request, abort.signal);
      const file = form.get('file');
      if (!(file instanceof File))
        throw new ConversionError('Choose a file to convert.');
      if (file.size > MAX_FILE_BYTES) throw new UploadTooLarge();
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      let options: { pageSize?: 'A4' | 'Letter'; landscape?: boolean } = {};
      const rawOptions = form.get('options');
      if (rawOptions !== null) {
        if (typeof rawOptions !== 'string' || rawOptions.length > 1024)
          throw new ConversionError('The conversion options are invalid.');
        options = JSON.parse(rawOptions);
        if (
          !options ||
          typeof options !== 'object' ||
          Array.isArray(options) ||
          (options.pageSize !== undefined &&
            !['A4', 'Letter'].includes(options.pageSize)) ||
          (options.landscape !== undefined &&
            typeof options.landscape !== 'boolean')
        )
          throw new ConversionError('The conversion options are invalid.');
      }
      const converted = await traced('conversion.parse', () =>
        toHtml(file, extension),
      );
      if (converted.pdf)
        return new Response(new Uint8Array(converted.pdf), {
          headers: {
            'content-type': 'application/pdf',
            'cache-control': 'no-store',
            'content-disposition': 'attachment; filename="converted.pdf"',
            'x-content-type-options': 'nosniff',
          },
        });
      if (expired)
        throw new ConversionError(
          'Conversion took too long. Try a smaller file.',
        );
      stage = 'browser';
      browser = await puppeteer.launch(env.BROWSER, { keep_alive: 60000 });
      if (expired)
        throw new ConversionError(
          'Conversion took too long. Try a smaller file.',
        );
      page = await browser.newPage();
      stage = 'render';
      page.setDefaultTimeout(25000);
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (intercepted) => {
        void intercepted.abort('blockedbyclient').catch(() => {});
      });
      await traced('conversion.layout', () =>
        page!.setContent(converted.html!, {
          waitUntil: 'load',
          timeout: 25000,
        }),
      );
      const pdf = await traced('conversion.render', () =>
        page!.pdf({
          format: options.pageSize || 'A4',
          landscape: options.landscape ?? converted.landscape ?? false,
          preferCSSPageSize: true,
          printBackground: true,
          margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
          timeout: 25000,
        }),
      );
      if (
        pdf.length < 5 ||
        new TextDecoder().decode(pdf.subarray(0, 4)) !== '%PDF'
      )
        throw new ConversionError(
          'This file could not be converted into a PDF.',
        );
      return new Response(new Uint8Array(pdf), {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="converted.pdf"',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch (error) {
      if (stage === 'browser' && !expired) {
        if (
          error instanceof Error &&
          /429|rate limit|too many|concurrent/i.test(error.message)
        )
          return failure(
            'RATE_LIMITED',
            'The conversion service is busy. Please try again in a minute.',
            429,
            { 'retry-after': '60' },
          );
        return failure(
          'INTERNAL',
          'The conversion service is temporarily unavailable. Please try again.',
          500,
        );
      }
      if (error instanceof UnsupportedType)
        return failure('UNSUPPORTED_TYPE', error.message, 400);
      if (error instanceof UploadTooLarge)
        return failure('TOO_LARGE', 'The maximum file size is 25 MB.', 413);
      // Log categories only, never document contents, filenames, IPs or library error messages.
      console.warn('Conversion failed', {
        category:
          error instanceof ConversionError ? 'validation' : 'conversion',
        stage,
        name: error instanceof Error ? error.name : 'unknown',
      });
      return failure(
        'CONVERSION_FAILED',
        error instanceof ConversionError
          ? error.message
          : 'This file could not be converted. It may be damaged, encrypted, or too complex.',
        422,
      );
    } finally {
      await close();
    }
  };
  const pending = job();
  // Keep the job alive after the deadline so a late browser launch is closed by
  // its finally block. Race only controls the response, not resource ownership.
  ctx.waitUntil(pending.then(() => {}));
  try {
    return await Promise.race([
      pending,
      new Promise<Response>((resolve) => {
        timer = setTimeout(() => {
          expired = true;
          abort.abort();
          ctx.waitUntil(close());
          resolve(
            failure(
              'CONVERSION_FAILED',
              'Conversion took too long. Try a smaller file.',
              422,
            ),
          );
        }, 30000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/health' && request.method === 'GET')
        return json({ ok: true, version: env.VERSION.id });
      if (url.pathname === '/api/capabilities' && request.method === 'GET')
        return json({
          serverExtensions: SERVER_EXTENSIONS,
          textFallback: true,
          maxFileBytes: MAX_FILE_BYTES,
          pageSizes: ['A4', 'Letter'],
        });
      if (url.pathname === '/api/events' && request.method === 'POST')
        return await events(request, env);
      if (url.pathname === '/api/convert' && request.method === 'POST') {
        const started = Date.now();
        const response = await convert(request, env, ctx);
        conversionResult(response.status, Date.now() - started);
        return response;
      }
      if (url.pathname.startsWith('/api/'))
        return failure(
          'UNSUPPORTED_TYPE',
          'This API endpoint or method is not supported.',
          400,
        );
      return env.ASSETS.fetch(request);
    } catch {
      console.error('Worker internal failure');
      return failure(
        'INTERNAL',
        'The conversion service is temporarily unavailable. Please try again.',
        500,
      );
    }
  },
} satisfies ExportedHandler<Env>;
