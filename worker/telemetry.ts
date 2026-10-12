import { tracing } from 'cloudflare:workers';

export interface TelemetryEnv {
  EVENT_LIMITER: RateLimit;
}
const EVENTS = new Set(
  'page_view files_added file_ready file_failed file_removed files_cleared files_reordered page_size_changed pdf_downloaded pdf_shared pdf_build_failed'.split(
    ' ',
  ),
);
const NUMBERS: Record<string, number> = {
  count: 10000,
  bytes: 1024 * 1024 * 1024,
  pages: 100000,
  durationMs: 86400000,
};
const ENUMS: Record<string, string[]> = {
  route: ['image', 'pdf', 'server'],
  outcome: ['success', 'error'],
  viewport: ['mobile', 'desktop'],
};
const response = (status: number) =>
  new Response(null, {
    status,
    headers: {
      'cache-control': 'no-store',
      ...(status === 429 ? { 'retry-after': '60' } : {}),
    },
  });

// Use manually ended spans so parser exceptions (which can contain user data)
// are never automatically attached as exception events.
export async function traced<T>(
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  const span = tracing.startSpan(name);
  try {
    const result = await operation();
    span.setAttribute('outcome', 'success');
    return result;
  } catch (error) {
    span.setAttribute('outcome', 'error');
    throw error;
  } finally {
    span.end();
  }
}
export function conversionResult(status: number, durationMs: number) {
  const span = tracing.startSpan('conversion.result');
  const data = {
    event: 'conversion_result',
    outcome: status === 200 ? 'success' : 'error',
    status,
    durationMs,
  };
  span.setAttributes(data);
  span.end();
  console.log({ kind: 'conversion', ...data });
}
export async function events(
  request: Request,
  env: TelemetryEnv,
): Promise<Response> {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return response(403);
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    return response(403);
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    return response(415);
  if (
    !(
      await env.EVENT_LIMITER.limit({
        key: request.headers.get('cf-connecting-ip') || 'unknown',
      })
    ).success
  )
    return response(429);
  if (Number(request.headers.get('content-length')) > 2048)
    return response(413);
  if (!request.body) return response(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let expired = false;
  const deadline = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, 3000);
  let value: unknown;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2048) return response(413);
      chunks.push(value);
    }
    if (expired) return response(400);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
    );
  } catch {
    return response(400);
  } finally {
    clearTimeout(deadline);
    await reader.cancel().catch(() => {});
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return response(400);
  const input = value as Record<string, unknown>;
  if (typeof input.event !== 'string' || !EVENTS.has(input.event))
    return response(400);
  const data: Record<string, string | number> = { event: input.event };
  for (const [key, max] of Object.entries(NUMBERS)) {
    const n = input[key];
    if (n === undefined) continue;
    if (
      typeof n !== 'number' ||
      !Number.isFinite(n) ||
      n < 0 ||
      n > max ||
      (key !== 'durationMs' && !Number.isInteger(n))
    )
      return response(400);
    data[key] = n;
  }
  for (const [key, allowed] of Object.entries(ENUMS)) {
    const v = input[key];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !allowed.includes(v)) return response(400);
    data[key] = v;
  }
  // Unknown fields are dropped before all logging and span creation.
  const span = tracing.startSpan('product.event');
  span.setAttributes(data);
  span.end();
  console.log({ kind: 'product_event', ...data });
  return response(204);
}
