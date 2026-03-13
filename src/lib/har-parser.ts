import type {
  RawHar,
  RawEntry,
  ParsedEntry,
  NormalizedTimings,
  ResourceType,
  RequestTag,
  DomainStats,
  AnalysisSummary,
} from '@/types/har';
import { getHostname, getPath, getProtocol } from './utils';

// ─────────────────────────────────────────────────────────────────
// Thresholds - every number used in classification lives here
// so the logic is auditable and tunable in one place.
// ─────────────────────────────────────────────────────────────────

export const THRESHOLDS = {
  SLOW_TOTAL_MS: 2000,
  HIGH_TTFB_MS: 800,
  LARGE_BYTES: 500_000,
  LARGE_JS_BYTES: 300_000,
  LARGE_CSS_BYTES: 200_000,
  LARGE_IMAGE_BYTES: 500_000,
  SLOW_DNS_MS: 100,
  SLOW_CONNECT_MS: 200,
  SLOW_SSL_MS: 200,
  SLOW_DOWNLOAD_MS: 1000,
  LONG_BLOCKED_MS: 500,
  SERIAL_GAP_TOLERANCE_MS: 50,
  POLLING_MIN_REPEATS: 4,
} as const;

// ─────────────────────────────────────────────────────────────────
// Known third-party domain patterns
// Each entry: [regex, category label]
// ─────────────────────────────────────────────────────────────────

const KNOWN_THIRD_PARTIES: [RegExp, string][] = [
  [/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/, 'Analytics'],
  [/doubleclick\.net|googlesyndication\.com|googleadservices\.com/, 'Advertising'],
  [/facebook\.net|facebook\.com|fbcdn\.net|fbsbx\.com/, 'Social'],
  [/twitter\.com|twimg\.com|t\.co/, 'Social'],
  [/linkedin\.com|licdn\.com/, 'Social'],
  [/hotjar\.com|mouseflow\.com|fullstory\.com|clarity\.ms/, 'Session Recording'],
  [/sentry\.io|bugsnag\.com|rollbar\.com/, 'Error Tracking'],
  [/intercom\.io|drift\.com|zendesk\.com|zdassets\.com/, 'Customer Support'],
  [/stripe\.com|paypal\.com|braintreegateway\.com/, 'Payments'],
  [/cloudflare\.com|cdn\.cloudflare\.net/, 'CDN'],
  [/amazonaws\.com|cloudfront\.net/, 'CDN/Cloud'],
  [/akamai\.net|akamaized\.net|akadns\.net/, 'CDN'],
  [/fastly\.net|fastlylb\.net/, 'CDN'],
  [/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com/, 'CDN'],
  [/newrelic\.com|nr-data\.net/, 'Monitoring'],
  [/datadoghq\.com|dd-cdn\.net/, 'Monitoring'],
  [/segment\.com|segment\.io|cdn\.segment\.com/, 'Analytics'],
  [/mixpanel\.com/, 'Analytics'],
  [/amplitude\.com/, 'Analytics'],
  [/optimizely\.com|optimizelyapis\.com/, 'A/B Testing'],
  [/launchdarkly\.com/, 'Feature Flags'],
  [/fonts\.googleapis\.com|fonts\.gstatic\.com/, 'Fonts'],
  [/maps\.googleapis\.com|maps\.google\.com/, 'Maps'],
  [/recaptcha\.net|gstatic\.com\/recaptcha/, 'Security'],
  [/hcaptcha\.com/, 'Security'],
  [/youtube\.com|ytimg\.com/, 'Media'],
  [/vimeo\.com|vimeocdn\.com/, 'Media'],
  [/tiktok\.com/, 'Social'],
  [/pinterest\.com|pinimg\.com/, 'Social'],
  [/hubspot\.com|hs-analytics\.net|hsforms\.com/, 'Marketing'],
  [/marketo\.com|mktoresp\.com/, 'Marketing'],
  [/salesforce\.com|force\.com/, 'CRM'],
];

// URL patterns that strongly indicate an API request
const API_PATH_PATTERNS = [
  /\/api\//i,
  /\/graphql/i,
  /\/rest\//i,
  /\/v[0-9]+\//i,
  /\/rpc\//i,
  /\/_api\//i,
  /\/ajax\//i,
  /\/ws\//i,
  /\/query/i,
  /\/mutation/i,
];

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

export function validateHar(text: string): { valid: boolean; error?: string; har?: RawHar } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { valid: false, error: 'Could not parse file as JSON. Is this a valid HAR file?' };
  }

  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Parsed JSON is not an object.' };
  }

  const obj = data as Record<string, unknown>;
  if (!obj.log || typeof obj.log !== 'object') {
    return { valid: false, error: 'Invalid HAR: missing "log" property. A valid HAR file must have { "log": { ... } }.' };
  }

  const log = obj.log as Record<string, unknown>;
  if (!Array.isArray(log.entries)) {
    return { valid: false, error: 'Invalid HAR: "log.entries" must be an array.' };
  }
  if (log.entries.length === 0) {
    return { valid: false, error: 'HAR file contains no entries. Nothing to analyze.' };
  }

  // Spot-check the first entry has the minimum fields
  const first = log.entries[0] as Record<string, unknown>;
  if (!first.request || !first.response || !first.startedDateTime) {
    return { valid: false, error: 'HAR entries are malformed - missing request, response, or startedDateTime.' };
  }

  return { valid: true, har: data as RawHar };
}

export function parseHar(raw: RawHar): {
  entries: ParsedEntry[];
  domains: DomainStats[];
  summary: AnalysisSummary;
} {
  const rawEntries = raw.log.entries;
  const firstPage = raw.log.pages?.[0];

  const earliestTime = Math.min(
    ...rawEntries.map((e) => new Date(e.startedDateTime).getTime())
  );

  // ── Pass 1: count URL occurrences for duplicate detection ──
  const urlCounts = new Map<string, number>();
  for (const e of rawEntries) {
    const key = e.request.method + ' ' + e.request.url;
    urlCounts.set(key, (urlCounts.get(key) ?? 0) + 1);
  }

  // ── Determine the primary document hostname ──
  // The document hostname is derived from the first `document` type entry,
  // or failing that, the first entry. We also consider its eTLD+1 for
  // subdomain-tolerant first-party matching.
  const docEntry = rawEntries.find(
    (e) => inferResourceType(e) === 'document' && (e.response?.status ?? 0) >= 200 && (e.response?.status ?? 0) < 400
  ) ?? rawEntries[0];
  const docHostname = getHostname(docEntry.request.url);
  const docRootDomain = extractRootDomain(docHostname);

  // ── Pass 2: normalize every entry ──
  const entries: ParsedEntry[] = rawEntries.map((raw, index) => {
    const url = raw.request.url;
    const hostname = getHostname(url);
    const timings = normalizeTimings(raw.timings);
    const content = raw.response.content ?? { size: 0, mimeType: '' };
    const responseSize = Math.max(content.size ?? 0, 0);
    const transferSize = raw.response.bodySize > 0 ? raw.response.bodySize : responseSize;
    const totalDuration = raw.time > 0 ? raw.time : timings.total;
    const startTimeMs = new Date(raw.startedDateTime).getTime() - earliestTime;
    const resourceType = inferResourceType(raw);

    // ── First-party vs third-party ──
    const thirdPartyResult = classifyThirdParty(hostname, docHostname, docRootDomain);

    // ── API detection ──
    const isApi = classifyAsApi(url, raw, resourceType);

    // ── Render-blocking detection ──
    const rbResult = classifyRenderBlocking(resourceType, raw, index, startTimeMs);

    // ── Status classification ──
    const isFailed = raw.response.status >= 400 || raw.response.status === 0;
    const isRedirect = raw.response.status >= 300 && raw.response.status < 400;

    // ── Size / speed classification ──
    const isSlow = totalDuration > THRESHOLDS.SLOW_TOTAL_MS || timings.wait > THRESHOLDS.HIGH_TTFB_MS;
    const isLarge = responseSize > THRESHOLDS.LARGE_BYTES;

    // ── Duplicate detection ──
    const urlKey = raw.request.method + ' ' + url;
    const isDuplicate = (urlCounts.get(urlKey) ?? 0) > 1;

    // ── Compression detection ──
    const contentEncoding = findHeader(raw.response.headers ?? [], 'content-encoding');
    const isCompressed = !!contentEncoding;

    // ── Cache detection ──
    const servedFromCache = detectCacheHit(raw);

    // ── Tags ──
    const tags: RequestTag[] = [];
    if (isSlow) tags.push('slow');
    if (isFailed) tags.push('failed');
    if (rbResult.isRenderBlocking) tags.push('render-blocking');
    if (thirdPartyResult.isThirdParty) tags.push('third-party');
    if (isDuplicate) tags.push('duplicate');
    if (isRedirect) tags.push('redirect');
    if (isLarge) tags.push('large');
    if (isApi) tags.push('api');

    return {
      id: `req-${index}`,
      index,
      pageref: raw.pageref,
      method: raw.request.method,
      url,
      hostname,
      path: getPath(url),
      protocol: getProtocol(url),
      resourceType,
      mimeType: content.mimeType ?? '',
      statusCode: raw.response.status,
      statusText: raw.response.statusText,
      requestSize: Math.max(raw.request.bodySize, 0),
      responseSize,
      transferSize,
      startTime: startTimeMs,
      startedDateTime: raw.startedDateTime,
      endTime: startTimeMs + totalDuration,
      totalDuration,
      timings,
      isThirdParty: thirdPartyResult.isThirdParty,
      thirdPartyCategory: thirdPartyResult.category,
      isApi,
      isFailed,
      isRedirect,
      isDuplicate,
      isSlow,
      isLarge,
      isRenderBlocking: rbResult.isRenderBlocking,
      renderBlockingReason: rbResult.reason,
      tags,
      redirectURL: raw.response.redirectURL,
      queryParams: raw.request.queryString ?? [],
      requestHeaders: raw.request.headers ?? [],
      responseHeaders: raw.response.headers ?? [],
      serverIP: raw.serverIPAddress,
      initiatorType: raw._initiator?.type,
      initiatorUrl: raw._initiator?.url ?? raw._initiator?.stack?.callFrames?.[0]?.url,
      priority: raw._priority,
      isCompressed,
      compressionType: contentEncoding ?? undefined,
      servedFromCache,
    };
  });

  entries.sort((a, b) => a.startTime - b.startTime || a.index - b.index);

  const domains = buildDomainStats(entries);
  const summary = buildSummary(entries, domains, firstPage);

  return { entries, domains, summary };
}

// ─────────────────────────────────────────────────────────────────
// Classification functions - each is a pure function with
// documented rules so the behavior is explainable.
// ─────────────────────────────────────────────────────────────────

/**
 * Rule: a hostname is first-party if:
 *   1. It exactly matches the document hostname, OR
 *   2. Its root domain (eTLD+1 approximation) matches the document's root domain
 *      (e.g. cdn.example.com is first-party for www.example.com), OR
 *   3. It is empty/same-origin.
 *
 * If third-party, we also check against KNOWN_THIRD_PARTIES to assign a category.
 */
function classifyThirdParty(
  hostname: string,
  docHostname: string,
  docRootDomain: string
): { isThirdParty: boolean; category?: string } {
  if (!hostname || hostname === docHostname) {
    return { isThirdParty: false };
  }

  const rootDomain = extractRootDomain(hostname);
  if (rootDomain === docRootDomain) {
    return { isThirdParty: false };
  }

  // It's third-party - try to categorize
  for (const [pattern, category] of KNOWN_THIRD_PARTIES) {
    if (pattern.test(hostname)) {
      return { isThirdParty: true, category };
    }
  }

  return { isThirdParty: true };
}

/**
 * Approximate eTLD+1 extraction.
 * Handles common multi-part TLDs (co.uk, com.au, etc.).
 */
function extractRootDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;

  const MULTI_PART_TLDS = ['co.uk', 'com.au', 'co.in', 'co.jp', 'com.br', 'co.nz', 'co.za', 'org.uk', 'net.au'];
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.includes(lastTwo)) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/**
 * Rule: a request is classified as an API call if ANY of:
 *   1. Chrome DevTools _resourceType is 'xhr' or 'fetch', OR
 *   2. URL path matches a known API pattern (/api/, /graphql, /v1/, etc.), OR
 *   3. Response MIME is application/json AND the URL does not look like a static .js file, OR
 *   4. Response MIME is application/json AND the HTTP method is not GET
 *      (POST/PUT/PATCH/DELETE to a JSON endpoint is almost certainly an API call)
 */
function classifyAsApi(url: string, entry: RawEntry, resourceType: ResourceType): boolean {
  if (resourceType === 'xhr' || resourceType === 'fetch') return true;

  for (const pattern of API_PATH_PATTERNS) {
    if (pattern.test(url)) return true;
  }

  const mime = (entry.response.content?.mimeType ?? '').toLowerCase();
  const isJsonResponse = mime.includes('application/json');
  const looksLikeStaticFile = /\.(js|css|html|htm|map)(\?|#|$)/i.test(url);

  if (isJsonResponse && !looksLikeStaticFile) return true;
  if (isJsonResponse && entry.request.method !== 'GET') return true;

  // XML APIs
  const isXmlResponse = mime.includes('application/xml') || mime.includes('text/xml');
  if (isXmlResponse && entry.request.method !== 'GET') return true;

  return false;
}

/**
 * Rule: a resource is render-blocking if ALL conditions are met:
 *   For CSS:
 *     1. It is a stylesheet, AND
 *     2. It started before the 20th request (proxy for "in <head>"), AND
 *     3. It has a `media` attribute of "all" or no media attribute
 *        (we check the Link header or fall back to position heuristic)
 *   For JS:
 *     1. It is a script, AND
 *     2. It started before the 15th request, AND
 *     3. The Chrome priority is 'High' or 'VeryHigh', OR
 *        there is no async/defer signal in the initiator or priority fields
 *
 * The `reason` string explains which rule matched so the user can verify.
 */
function classifyRenderBlocking(
  resourceType: ResourceType,
  entry: RawEntry,
  index: number,
  startTimeMs: number
): { isRenderBlocking: boolean; reason?: string } {
  if (resourceType === 'stylesheet') {
    if (index < 20) {
      const mediaHeader = findHeader(entry.response.headers ?? [], 'link');
      const isPrint = mediaHeader?.toLowerCase().includes('media="print"');
      if (!isPrint) {
        return {
          isRenderBlocking: true,
          reason: `Stylesheet at position ${index + 1} (early in the load) blocks rendering until fully downloaded.`,
        };
      }
    }
    return { isRenderBlocking: false };
  }

  if (resourceType === 'script') {
    const priority = (entry._priority ?? '').toLowerCase();
    const isHighPriority = priority === 'high' || priority === 'veryhigh';
    const isLowPriority = priority === 'low';

    // If Chrome tells us it's low priority, it's async/deferred
    if (isLowPriority) return { isRenderBlocking: false };

    if (index < 15) {
      if (isHighPriority) {
        return {
          isRenderBlocking: true,
          reason: `Script at position ${index + 1} with priority "${priority}" - synchronous script in <head> blocks rendering.`,
        };
      }
      // Without priority info, use position heuristic: scripts in the first 10
      // positions that started before 500ms are likely synchronous <head> scripts.
      if (!priority && startTimeMs < 500 && index < 10) {
        return {
          isRenderBlocking: true,
          reason: `Script at position ${index + 1} started at ${Math.round(startTimeMs)}ms - likely a synchronous <head> script (no async/defer detected).`,
        };
      }
    }
  }

  return { isRenderBlocking: false };
}

/**
 * Detect whether a response was served from browser cache.
 * Rule: any of these indicate a cache hit:
 *   - Response status 304 (Not Modified)
 *   - Response bodySize is 0 but content.size > 0 (body came from cache)
 *   - x-cache header contains "HIT"
 */
function detectCacheHit(entry: RawEntry): boolean {
  if (entry.response.status === 304) return true;
  if (entry.response.bodySize === 0 && (entry.response.content?.size ?? 0) > 0) return true;
  const xCache = findHeader(entry.response.headers ?? [], 'x-cache');
  if (xCache && /hit/i.test(xCache)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────
// Resource type inference - layered approach
// ─────────────────────────────────────────────────────────────────

/**
 * Priority order:
 *   1. Chrome DevTools _resourceType field (most reliable when present)
 *   2. Response MIME type
 *   3. URL file extension
 */
function inferResourceType(entry: RawEntry): ResourceType {
  // Layer 1: Chrome's own classification
  if (entry._resourceType) {
    const rt = entry._resourceType.toLowerCase();
    const map: Record<string, ResourceType> = {
      document: 'document', html: 'document',
      stylesheet: 'stylesheet', css: 'stylesheet',
      script: 'script', javascript: 'script', js: 'script',
      image: 'image', img: 'image',
      font: 'font',
      xhr: 'xhr', xmlhttprequest: 'xhr',
      fetch: 'fetch',
      media: 'media', video: 'media', audio: 'media',
      websocket: 'websocket',
      manifest: 'manifest',
    };
    if (map[rt]) return map[rt];
  }

  // Layer 2: MIME type
  const mime = (entry.response.content?.mimeType ?? '').toLowerCase();
  if (mime.includes('text/html') || mime.includes('application/xhtml')) return 'document';
  if (mime.includes('text/css')) return 'stylesheet';
  if (mime.includes('javascript') || mime.includes('ecmascript')) return 'script';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('font') || mime.includes('application/x-font')) return 'font';
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'media';
  if (mime === 'application/manifest+json') return 'manifest';

  // Layer 3: URL extension
  const url = entry.request.url.toLowerCase();
  if (/\.html?(\?|#|$)/.test(url)) return 'document';
  if (/\.css(\?|#|$)/.test(url)) return 'stylesheet';
  if (/\.m?js(\?|#|$)/.test(url)) return 'script';
  if (/\.(png|jpe?g|gif|svg|webp|ico|avif|bmp|tiff?)(\?|#|$)/.test(url)) return 'image';
  if (/\.(woff2?|ttf|otf|eot)(\?|#|$)/.test(url)) return 'font';
  if (/\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?|#|$)/.test(url)) return 'media';
  if (/manifest\.json(\?|#|$)/.test(url)) return 'manifest';

  return 'other';
}

// ─────────────────────────────────────────────────────────────────
// Timing normalization
// ─────────────────────────────────────────────────────────────────

function normalizeTimings(t: RawEntry['timings'] | undefined): NormalizedTimings {
  if (!t) return { blocked: 0, dns: 0, connect: 0, ssl: 0, send: 0, wait: 0, receive: 0, total: 0 };
  const c = (v: number) => (v > 0 ? v : 0);
  const blocked = c(t.blocked);
  const dns = c(t.dns);
  const connect = c(t.connect);
  const ssl = c(t.ssl);
  const send = c(t.send);
  const wait = c(t.wait);
  const receive = c(t.receive);
  return { blocked, dns, connect, ssl, send, wait, receive, total: blocked + dns + connect + ssl + send + wait + receive };
}

// ─────────────────────────────────────────────────────────────────
// Domain statistics
// ─────────────────────────────────────────────────────────────────

function buildDomainStats(entries: ParsedEntry[]): DomainStats[] {
  const map = new Map<string, DomainStats>();

  for (const e of entries) {
    let stats = map.get(e.hostname);
    if (!stats) {
      stats = {
        domain: e.hostname,
        isThirdParty: e.isThirdParty,
        thirdPartyCategory: e.thirdPartyCategory,
        requestCount: 0,
        totalSize: 0,
        totalDuration: 0,
        avgDuration: 0,
        failedCount: 0,
        slowCount: 0,
        resourceTypes: {} as Record<ResourceType, number>,
      };
      map.set(e.hostname, stats);
    }
    stats.requestCount++;
    stats.totalSize += e.transferSize;
    stats.totalDuration += e.totalDuration;
    if (e.isFailed) stats.failedCount++;
    if (e.isSlow) stats.slowCount++;
    stats.resourceTypes[e.resourceType] = (stats.resourceTypes[e.resourceType] ?? 0) + 1;
  }

  for (const s of map.values()) {
    s.avgDuration = s.requestCount > 0 ? s.totalDuration / s.requestCount : 0;
  }

  return Array.from(map.values()).sort((a, b) => b.totalDuration - a.totalDuration);
}

// ─────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────

function buildSummary(
  entries: ParsedEntry[],
  domains: DomainStats[],
  page?: RawHar['log']['pages'] extends (infer P)[] ? P : never
): AnalysisSummary {
  const totalDuration = entries.length > 0
    ? Math.max(...entries.map((e) => e.startTime + e.totalDuration))
    : 0;

  const totalTransferSize = entries.reduce((s, e) => s + e.transferSize, 0);
  const failedRequests = entries.filter((e) => e.isFailed).length;
  const redirectCount = entries.filter((e) => e.isRedirect).length;
  const thirdPartyRequests = entries.filter((e) => e.isThirdParty).length;

  let slowestRequest: AnalysisSummary['slowestRequest'] = null;
  let highestTTFB: AnalysisSummary['highestTTFB'] = null;

  for (const e of entries) {
    if (!slowestRequest || e.totalDuration > slowestRequest.duration) {
      slowestRequest = { url: e.url, duration: e.totalDuration };
    }
    if (!highestTTFB || e.timings.wait > highestTTFB.ttfb) {
      highestTTFB = { url: e.url, ttfb: e.timings.wait };
    }
  }

  const resourceBreakdown = {} as Record<ResourceType, { count: number; size: number }>;
  for (const e of entries) {
    if (!resourceBreakdown[e.resourceType]) {
      resourceBreakdown[e.resourceType] = { count: 0, size: 0 };
    }
    resourceBreakdown[e.resourceType].count++;
    resourceBreakdown[e.resourceType].size += e.transferSize;
  }

  const doc = entries.find((e) => e.resourceType === 'document');

  return {
    totalRequests: entries.length,
    totalTransferSize,
    totalDuration,
    failedRequests,
    redirectCount,
    thirdPartyRequests,
    uniqueDomains: domains.length,
    slowestRequest,
    highestTTFB,
    documentUrl: doc?.url ?? entries[0]?.url ?? '',
    pageTitle: page?.title ?? doc?.url ?? 'Unknown Page',
    resourceBreakdown,
    onContentLoad: page?.pageTimings?.onContentLoad ?? undefined,
    onLoad: page?.pageTimings?.onLoad ?? undefined,
  };
}

// ─────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────

function findHeader(headers: { name: string; value: string }[], name: string): string | null {
  const lower = name.toLowerCase();
  const h = headers.find((h) => h.name.toLowerCase() === lower);
  return h?.value ?? null;
}
