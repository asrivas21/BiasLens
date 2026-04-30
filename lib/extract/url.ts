import 'server-only';
import { lookup } from 'node:dns/promises';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { ApiException } from '@/lib/api/errors';
import { logger } from '@/lib/observability/logger';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const USER_AGENT = 'BiasLens/0.1 (+https://github.com/asrivas21/BiasLens)';

export type ExtractedArticle = {
  text: string;
  title: string | null;
  siteName: string | null;
  finalUrl: string;
};

// Block private/loopback/link-local/multicast/CGNAT ranges. Prevents the
// trivial SSRF cases (e.g., http://127.0.0.1, http://169.254.169.254 metadata
// endpoint). Note: this check happens before fetch, so a DNS-rebinding
// attacker could still race us between the check and the fetch's own
// resolution. Acceptable for v1 against public news sites.
function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    if (ip === '::1' || ip === '::') return true;
    const lower = ip.toLowerCase();
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

async function assertSafeHostname(hostname: string): Promise<void> {
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new ApiException('BAD_REQUEST', `Could not resolve hostname: ${hostname}`);
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new ApiException('BAD_REQUEST', 'URL resolves to a private network address.');
    }
  }
}

async function fetchHtml(url: URL): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) {
      throw new ApiException('BAD_REQUEST', `Source returned HTTP ${res.status}.`);
    }
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.startsWith('text/html') && !contentType.startsWith('application/xhtml')) {
      throw new ApiException('BAD_REQUEST', `Source is not HTML (content-type: ${contentType || 'unknown'}).`);
    }
    if (!res.body) {
      throw new ApiException('BAD_REQUEST', 'Source returned an empty body.');
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        controller.abort();
        throw new ApiException('PAYLOAD_TOO_LARGE', 'Source page exceeds 5 MB.');
      }
      chunks.push(value);
    }
    const html = new TextDecoder('utf-8').decode(Buffer.concat(chunks));
    return { html, finalUrl: res.url || url.toString() };
  } catch (err) {
    if (err instanceof ApiException) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiException('BAD_REQUEST', `Source took longer than ${FETCH_TIMEOUT_MS / 1000}s to respond.`);
    }
    throw new ApiException('BAD_REQUEST', err instanceof Error ? err.message : 'Failed to fetch source URL.');
  } finally {
    clearTimeout(timer);
  }
}

function extractFromHtml(html: string, baseUrl: string): Omit<ExtractedArticle, 'finalUrl'> {
  const dom = new JSDOM(html, { url: baseUrl });
  const article = new Readability(dom.window.document).parse();
  if (!article || !article.textContent) {
    throw new ApiException('BAD_REQUEST', 'Could not extract readable article text from the source page.');
  }
  return {
    text: article.textContent.replace(/\s+/g, ' ').trim(),
    title: article.title?.trim() || null,
    siteName: article.siteName?.trim() || null,
  };
}

export async function fetchAndExtractArticle(rawUrl: string): Promise<ExtractedArticle> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ApiException('BAD_REQUEST', 'Invalid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ApiException('BAD_REQUEST', `Unsupported URL scheme: ${parsed.protocol}`);
  }
  await assertSafeHostname(parsed.hostname);

  const startedAt = Date.now();
  const { html, finalUrl } = await fetchHtml(parsed);
  const extracted = extractFromHtml(html, finalUrl);
  logger.info('url_extract_completed', {
    durationMs: Date.now() - startedAt,
    host: parsed.hostname,
    bytes: html.length,
    extractedChars: extracted.text.length,
    title: extracted.title?.slice(0, 80) ?? null,
  });
  return { ...extracted, finalUrl };
}
