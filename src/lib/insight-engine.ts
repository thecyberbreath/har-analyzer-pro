import type {
  ParsedEntry,
  BottleneckInsight,
  Severity,
  CriticalPathNode,
  BeginnerSummary,
  StoryLine,
  FlowStage,
  RedirectChain,
  AnalysisSummary,
} from '@/types/har';
import { THRESHOLDS } from './har-parser';
import { formatDuration, formatBytes, shortenUrl } from './utils';

// ─────────────────────────────────────────────────────────────────
// Bottleneck / Finding detection
//
// Each detector is a named function that:
//   1. Takes entries + an output array
//   2. Checks a specific, documented condition
//   3. If the condition is met, pushes a finding with:
//      - deterministic `rule` string explaining the exact trigger
//      - `metric` with the measured value vs threshold
//      - evidence citing specific requests
// ─────────────────────────────────────────────────────────────────

export function generateInsights(
  entries: ParsedEntry[],
  redirectChains: RedirectChain[]
): BottleneckInsight[] {
  if (entries.length === 0) return [];

  const insights: BottleneckInsight[] = [];
  let seq = 0;
  const nextId = () => `finding-${seq++}`;

  findSlowDNS(entries, insights, nextId);
  findSlowConnect(entries, insights, nextId);
  findSlowSSL(entries, insights, nextId);
  findHighTTFB(entries, insights, nextId);
  findSlowDownloads(entries, insights, nextId);
  findLongBlocked(entries, insights, nextId);
  findRedirectChains(redirectChains, insights, nextId);
  findDuplicateRequests(entries, insights, nextId);
  findFailedRequests(entries, insights, nextId);
  findLargeJavaScript(entries, insights, nextId);
  findLargeCSS(entries, insights, nextId);
  findLargeImages(entries, insights, nextId);
  findUncompressedText(entries, insights, nextId);
  findThirdPartyOverload(entries, insights, nextId);
  findRenderBlocking(entries, insights, nextId);
  findSlowApis(entries, insights, nextId);
  findSerialApiChains(entries, insights, nextId);
  findPollingRequests(entries, insights, nextId);
  findTimingGaps(entries, insights, nextId);
  findLateCriticalData(entries, insights, nextId);

  insights.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return insights;
}

// ─────────────────────────────────────────────────────────────────
// Critical path estimation
//
// Strategy: walk the waterfall from left to right and identify
// the chain of requests that, if removed, would shorten the total
// load time the most. Each node has a `dependsOn` field pointing
// to the entry it waits for, forming a traceable chain.
//
// The algorithm:
//   1. The document request is always depth 0.
//   2. Render-blocking CSS/JS are depth 1 (they depend on the document).
//   3. Among first-party APIs, find the ones that started after
//      a render-blocking script ended - they depend on JS execution.
//   4. Among those APIs, find ones whose completion gates other
//      requests (i.e., requests that start after the API finishes).
//   5. Largest scripts get included as depth 1 if they are on the
//      critical rendering path.
//
// Each node's `contribution` is the ACTUAL time it occupied on the
// critical path (not its total duration, which may overlap with
// parallel requests).
// ─────────────────────────────────────────────────────────────────

export function estimateCriticalPath(entries: ParsedEntry[]): CriticalPathNode[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => a.startTime - b.startTime);
  const nodes: CriticalPathNode[] = [];
  const added = new Set<string>();

  const add = (
    entry: ParsedEntry,
    depth: number,
    contribution: number,
    reason: string,
    rule: string,
    dependsOn?: string
  ) => {
    if (added.has(entry.id)) return;
    added.add(entry.id);
    nodes.push({ entryId: entry.id, depth, contribution, reason, rule, dependsOn });
  };

  // ── Depth 0: Document ──
  const doc = sorted.find((e) => e.resourceType === 'document' && !e.isRedirect);
  if (doc) {
    add(doc, 0, doc.totalDuration,
      'Initial HTML document - everything else depends on this arriving first.',
      'The document request is always on the critical path because no other resources can be discovered until the HTML is parsed.');
  }

  // ── Depth 1: Render-blocking resources ──
  const blocking = sorted.filter((e) => e.isRenderBlocking && !added.has(e.id));
  // Only the LAST-finishing render-blocking resource truly gates first paint.
  // But we include all of them so the user sees the full picture.
  const blockingSorted = [...blocking].sort((a, b) => b.endTime - a.endTime);
  for (const e of blockingSorted) {
    add(e, 1, e.totalDuration,
      `Render-blocking ${e.resourceType} - the browser waits for this before painting.`,
      `${e.renderBlockingReason ?? 'Classified as render-blocking based on position and type.'}`,
      doc?.id);
  }

  // ── Depth 1: Largest first-party scripts (delay interactivity) ──
  const bigScripts = sorted
    .filter((e) => e.resourceType === 'script' && !e.isThirdParty && e.responseSize > 200_000 && !added.has(e.id))
    .sort((a, b) => b.responseSize - a.responseSize)
    .slice(0, 3);
  for (const e of bigScripts) {
    add(e, 1, e.totalDuration,
      `Large JavaScript file (${formatBytes(e.responseSize)}) - must be downloaded and parsed before the app becomes interactive.`,
      `Script is >${formatBytes(200_000)} and first-party, making it likely critical for app startup.`,
      doc?.id);
  }

  // ── Depth 2: First-party APIs that started after blocking resources finished ──
  const lastBlockingEnd = blocking.length > 0
    ? Math.max(...blocking.map((e) => e.endTime))
    : (doc ? doc.endTime : 0);

  const gatingApis = sorted
    .filter((e) => e.isApi && !e.isThirdParty && e.startTime >= lastBlockingEnd - 100 && !added.has(e.id))
    .sort((a, b) => b.timings.wait - a.timings.wait)
    .slice(0, 3);

  for (const e of gatingApis) {
    if (e.timings.wait > 300) {
      const latestBlocker = blockingSorted[0] ?? doc;
      add(e, 2, e.timings.wait,
        `API call with ${formatDuration(e.timings.wait)} server wait - likely fetches data needed for the main content.`,
        `API started at ${formatDuration(e.startTime)}, after render-blocking resources finished at ${formatDuration(lastBlockingEnd)}. Its TTFB of ${formatDuration(e.timings.wait)} suggests it gates content display.`,
        latestBlocker?.id);
    }
  }

  return nodes;
}

// ─────────────────────────────────────────────────────────────────
// Story generation (plain-language sequence)
// ─────────────────────────────────────────────────────────────────

export function generateStory(entries: ParsedEntry[], stages: FlowStage[]): string[] {
  if (entries.length === 0) return ['No requests found in this HAR file.'];

  const lines: string[] = [];
  const sorted = [...entries].sort((a, b) => a.startTime - b.startTime);
  const totalDuration = Math.max(...sorted.map((e) => e.endTime));

  // Redirects
  const redirects = sorted.filter((e) => e.isRedirect);
  if (redirects.length > 0) {
    const totalRedirectTime = redirects.reduce((s, e) => s + e.totalDuration, 0);
    lines.push(`Before the page could even begin loading, the browser was redirected ${redirects.length} time(s), costing ${formatDuration(totalRedirectTime)}.`);
  }

  // Document
  const doc = sorted.find((e) => e.resourceType === 'document' && !e.isRedirect);
  if (doc) {
    lines.push(`The browser requested the main page from ${doc.hostname}.`);
    if (doc.timings.wait > THRESHOLDS.HIGH_TTFB_MS) {
      lines.push(`The server took ${formatDuration(doc.timings.wait)} to start responding - this is slower than the ${formatDuration(THRESHOLDS.HIGH_TTFB_MS)} threshold.`);
    } else if (doc.timings.wait > 0) {
      lines.push(`The server responded in ${formatDuration(doc.timings.wait)}, which is within normal range.`);
    }
  }

  // Critical CSS/JS
  const blockingStage = stages.find((s) => s.id === 'critical-css' || s.id === 'critical-js');
  const blockingCount = sorted.filter((e) => e.isRenderBlocking).length;
  if (blockingCount > 0) {
    const blockingCSS = sorted.filter((e) => e.isRenderBlocking && e.resourceType === 'stylesheet');
    const blockingJS = sorted.filter((e) => e.isRenderBlocking && e.resourceType === 'script');
    const parts: string[] = [];
    if (blockingCSS.length > 0) parts.push(`${blockingCSS.length} CSS file(s)`);
    if (blockingJS.length > 0) parts.push(`${blockingJS.length} JavaScript file(s)`);
    lines.push(`The browser then loaded ${parts.join(' and ')} that block rendering - nothing appears on screen until these finish.`);
  }

  // Large JS
  const bigJS = sorted.filter((e) => e.resourceType === 'script' && e.responseSize > THRESHOLDS.LARGE_JS_BYTES && !e.isThirdParty);
  if (bigJS.length > 0) {
    const biggest = bigJS.sort((a, b) => b.responseSize - a.responseSize)[0];
    lines.push(`A large JavaScript file (${formatBytes(biggest.responseSize)} from ${biggest.hostname}) likely delayed the app from becoming interactive.`);
  }

  // First-party APIs
  const apis = sorted.filter((e) => e.isApi && !e.isThirdParty);
  if (apis.length > 0) {
    lines.push(`After JavaScript executed, the app made ${apis.length} API call(s) to load data.`);
    const slowApis = apis.filter((e) => e.timings.wait > THRESHOLDS.HIGH_TTFB_MS).sort((a, b) => b.timings.wait - a.timings.wait);
    if (slowApis.length > 0) {
      lines.push(`The slowest API waited ${formatDuration(slowApis[0].timings.wait)} for the server to respond, which delayed content from appearing.`);
    }
  }

  // Third-party
  const tp = sorted.filter((e) => e.isThirdParty);
  if (tp.length > 5) {
    const tpDomains = new Set(tp.map((e) => e.hostname));
    const categories = new Set(tp.map((e) => e.thirdPartyCategory).filter(Boolean));
    const catNote = categories.size > 0 ? ` (${[...categories].slice(0, 3).join(', ')})` : '';
    lines.push(`${tp.length} requests went to ${tpDomains.size} third-party domain(s)${catNote}, adding extra network overhead.`);
  }

  // Failed requests
  const failed = sorted.filter((e) => e.isFailed);
  if (failed.length > 0) {
    const serverErrors = failed.filter((e) => e.statusCode >= 500);
    if (serverErrors.length > 0) {
      lines.push(`${serverErrors.length} request(s) hit server errors (5xx), which may indicate backend problems.`);
    }
    const clientErrors = failed.filter((e) => e.statusCode >= 400 && e.statusCode < 500);
    if (clientErrors.length > 0) {
      lines.push(`${clientErrors.length} request(s) returned client errors (4xx), likely missing files or broken URLs.`);
    }
  }

  // Summary line
  lines.push(`In total: ${entries.length} requests, ${formatBytes(entries.reduce((s, e) => s + e.transferSize, 0))} transferred, over ${formatDuration(totalDuration)}.`);

  return lines;
}

// ─────────────────────────────────────────────────────────────────
// Beginner-friendly summary
//
// Produces a structured object with:
//   - headline: one-sentence summary
//   - verdict: fast / moderate / slow / broken
//   - storyLines: ordered sequence with icons and plain text
//   - topIssues: the top 3 most impactful findings, explained simply
//   - glossary: definitions for any technical terms used
// ─────────────────────────────────────────────────────────────────

export function generateBeginnerSummary(
  entries: ParsedEntry[],
  summary: AnalysisSummary,
  insights: BottleneckInsight[],
  stages: FlowStage[]
): BeginnerSummary {
  // ── Verdict ──
  const verdict = determineVerdict(summary, insights);

  // ── Headline ──
  const headline = buildHeadline(summary, verdict);

  // ── Story lines ──
  const storyLines = buildStoryLines(entries, summary, stages);

  // ── Top issues ──
  const criticals = insights.filter((i) => i.severity === 'critical');
  const warnings = insights.filter((i) => i.severity === 'warning');
  const topInsights = [...criticals, ...warnings].slice(0, 3);

  const topIssues = topInsights.map((i) => ({
    title: i.title,
    explanation: i.plainExplanation,
    severity: i.severity,
  }));

  // ── Glossary ──
  const glossary = buildGlossary(entries, insights);

  return { headline, verdict, storyLines, topIssues, glossary };
}

function determineVerdict(
  summary: AnalysisSummary,
  insights: BottleneckInsight[]
): BeginnerSummary['verdict'] {
  const criticalCount = insights.filter((i) => i.severity === 'critical').length;

  if (summary.failedRequests > 5 || criticalCount >= 3) return 'broken';
  if (summary.totalDuration > 10_000 || criticalCount >= 1) return 'slow';
  if (summary.totalDuration > 3_000 || insights.length > 3) return 'moderate';
  return 'fast';
}

function buildHeadline(summary: AnalysisSummary, verdict: BeginnerSummary['verdict']): string {
  switch (verdict) {
    case 'fast':
      return `This page loaded quickly in ${formatDuration(summary.totalDuration)} with ${summary.totalRequests} requests.`;
    case 'moderate':
      return `This page took ${formatDuration(summary.totalDuration)} to load. There are a few areas that could be improved.`;
    case 'slow':
      return `This page took ${formatDuration(summary.totalDuration)} to load, which is slower than recommended. Key bottlenecks were found.`;
    case 'broken':
      return `This page has significant issues - ${summary.failedRequests} request(s) failed and it took ${formatDuration(summary.totalDuration)} to load.`;
  }
}

function buildStoryLines(
  entries: ParsedEntry[],
  summary: AnalysisSummary,
  stages: FlowStage[]
): StoryLine[] {
  const lines: StoryLine[] = [];
  let order = 0;

  // One story line per flow stage
  for (const stage of stages) {
    const icon = stageIcon(stage.id);
    let text = stage.description;
    let detail: string | undefined;

    if (stage.significance === 'critical') {
      detail = stage.whyItMatters;
    }

    lines.push({
      order: order++,
      icon,
      text,
      detail,
      relatedEntryIds: stage.entryIds,
    });
  }

  // Final summary line
  lines.push({
    order: order++,
    icon: '📊',
    text: `Total: ${summary.totalRequests} requests, ${formatBytes(summary.totalTransferSize)} transferred, ${formatDuration(summary.totalDuration)} total time.`,
    relatedEntryIds: [],
  });

  return lines;
}

function stageIcon(stageId: string): string {
  const icons: Record<string, string> = {
    'redirect-chain': '↩️',
    'initial-document': '📄',
    'critical-css': '🎨',
    'critical-js': '⚡',
    'font-loading': '🔤',
    'api-calls': '🔌',
    'images': '🖼️',
    'third-party-scripts': '🌐',
    'third-party-other': '🌐',
    'late-activity': '⏰',
  };
  return icons[stageId] ?? '📦';
}

function buildGlossary(entries: ParsedEntry[], insights: BottleneckInsight[]): BeginnerSummary['glossary'] {
  const terms: BeginnerSummary['glossary'] = [];
  const add = (term: string, definition: string) => {
    if (!terms.find((t) => t.term === term)) {
      terms.push({ term, definition });
    }
  };

  // Only add terms that are actually referenced in the findings
  const allText = insights.map((i) => i.title + i.plainExplanation + i.evidence).join(' ');

  if (/ttfb|time.to.first.byte/i.test(allText)) {
    add('TTFB (Time to First Byte)', 'How long the browser waited for the server to start sending data. A high TTFB means the server is slow.');
  }
  if (/dns/i.test(allText)) {
    add('DNS Lookup', 'The process of converting a domain name (like example.com) into an IP address. It happens once per new domain.');
  }
  if (/ssl|tls/i.test(allText)) {
    add('SSL/TLS', 'The security handshake that sets up an encrypted connection. Required for HTTPS sites.');
  }
  if (/render.block/i.test(allText)) {
    add('Render-Blocking', 'A resource that prevents the browser from showing any content until it finishes loading. Usually CSS and synchronous JavaScript in the page <head>.');
  }
  if (/third.party/i.test(allText)) {
    add('Third-Party', 'Resources loaded from domains you don\'t control - analytics, ads, social widgets, CDNs, etc.');
  }
  if (/redirect/i.test(allText)) {
    add('Redirect', 'When the server sends you to a different URL instead of the page content. Each redirect adds a network round-trip.');
  }
  if (/api|xhr|fetch/i.test(allText)) {
    add('API Request', 'A request the app makes to fetch data (like user info, product listings, etc.) after the initial page loads.');
  }
  if (entries.some((e) => e.isCompressed)) {
    add('Compression', 'Shrinking files before sending them over the network. Common types are gzip and brotli.');
  }

  return terms;
}

// ─────────────────────────────────────────────────────────────────
// Individual finding detectors
//
// Convention for each detector:
//   1. Filter entries by the condition
//   2. If nothing matches, return immediately (no finding)
//   3. Pick the worst offender for evidence
//   4. Push a finding with all required fields
// ─────────────────────────────────────────────────────────────────

type IdGen = () => string;

function findSlowDNS(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const threshold = THRESHOLDS.SLOW_DNS_MS;
  const hits = entries.filter((e) => e.timings.dns > threshold);
  if (hits.length === 0) return;
  const worst = hits.reduce((a, b) => (b.timings.dns > a.timings.dns ? b : a));
  out.push({
    id: id(), title: 'Slow DNS Lookups', category: 'Network',
    severity: worst.timings.dns > 300 ? 'critical' : 'warning',
    rule: `Triggered when any entry has timings.dns > ${threshold}ms. Found ${hits.length} entries.`,
    metric: { name: 'Worst DNS time', value: worst.timings.dns, threshold, unit: 'ms' },
    whyItMatters: 'DNS resolution must complete before any data transfer. Each unique domain requires a separate lookup.',
    evidence: `${hits.length} request(s) exceeded the ${threshold}ms threshold. Worst: ${shortenUrl(worst.url)} at ${formatDuration(worst.timings.dns)}.`,
    plainExplanation: `The browser had to look up ${hits.length} domain name(s) that took longer than expected. This added waiting time before any data could start flowing.`,
    possibleFix: 'Use <link rel="dns-prefetch"> for known third-party domains. Reduce the number of unique domains.',
    involvedEntryIds: hits.map((e) => e.id),
  });
}

function findSlowConnect(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const threshold = THRESHOLDS.SLOW_CONNECT_MS;
  const hits = entries.filter((e) => e.timings.connect > threshold);
  if (hits.length === 0) return;
  const worst = hits.reduce((a, b) => (b.timings.connect > a.timings.connect ? b : a));
  out.push({
    id: id(), title: 'Slow TCP Connections', category: 'Network',
    severity: worst.timings.connect > 500 ? 'critical' : 'warning',
    rule: `Triggered when any entry has timings.connect > ${threshold}ms. Found ${hits.length} entries.`,
    metric: { name: 'Worst connect time', value: worst.timings.connect, threshold, unit: 'ms' },
    whyItMatters: 'TCP connection setup adds latency. Each new server requires this handshake.',
    evidence: `${hits.length} request(s) exceeded ${threshold}ms. Worst: ${shortenUrl(worst.url)} at ${formatDuration(worst.timings.connect)}.`,
    plainExplanation: `Connecting to ${hits.length} server(s) was slower than expected, adding delay before data transfer began.`,
    possibleFix: 'Use HTTP/2 or HTTP/3 to multiplex requests. Add <link rel="preconnect"> for critical origins.',
    involvedEntryIds: hits.map((e) => e.id),
  });
}

function findSlowSSL(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const threshold = THRESHOLDS.SLOW_SSL_MS;
  const hits = entries.filter((e) => e.timings.ssl > threshold);
  if (hits.length === 0) return;
  const worst = hits.reduce((a, b) => (b.timings.ssl > a.timings.ssl ? b : a));
  out.push({
    id: id(), title: 'Slow SSL/TLS Negotiation', category: 'Network',
    severity: worst.timings.ssl > 500 ? 'critical' : 'warning',
    rule: `Triggered when any entry has timings.ssl > ${threshold}ms. Found ${hits.length} entries.`,
    metric: { name: 'Worst SSL time', value: worst.timings.ssl, threshold, unit: 'ms' },
    whyItMatters: 'SSL negotiation happens on every new HTTPS connection. It must complete before any secure data transfer.',
    evidence: `${hits.length} request(s) exceeded ${threshold}ms. Worst: ${shortenUrl(worst.url)} at ${formatDuration(worst.timings.ssl)}.`,
    plainExplanation: `Setting up secure connections was slow for ${hits.length} request(s). This is pure overhead before any page data is transferred.`,
    possibleFix: 'Enable TLS 1.3 for faster handshakes. Use session resumption. Add preconnect hints.',
    involvedEntryIds: hits.map((e) => e.id),
  });
}

function findHighTTFB(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const threshold = THRESHOLDS.HIGH_TTFB_MS;
  const hits = entries.filter((e) => e.timings.wait > threshold);
  if (hits.length === 0) return;
  const worst = hits.reduce((a, b) => (b.timings.wait > a.timings.wait ? b : a));
  out.push({
    id: id(), title: 'High Time-to-First-Byte (TTFB)', category: 'Server',
    severity: worst.timings.wait > 2000 ? 'critical' : 'warning',
    rule: `Triggered when any entry has timings.wait > ${threshold}ms. Found ${hits.length} entries.`,
    metric: { name: 'Worst TTFB', value: worst.timings.wait, threshold, unit: 'ms' },
    whyItMatters: 'TTFB is the time the server spends processing a request. High TTFB indicates slow server-side logic.',
    evidence: `${hits.length} request(s) exceeded ${threshold}ms. Worst: ${shortenUrl(worst.url)} at ${formatDuration(worst.timings.wait)}.`,
    plainExplanation: `The server took too long to start responding for ${hits.length} request(s). The worst waited ${formatDuration(worst.timings.wait)}.`,
    possibleFix: 'Investigate server-side performance: database queries, caching, server capacity. Consider a CDN.',
    involvedEntryIds: hits.map((e) => e.id),
  });
}

function findSlowDownloads(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const threshold = THRESHOLDS.SLOW_DOWNLOAD_MS;
  const hits = entries.filter((e) => e.timings.receive > threshold && e.responseSize > 50_000);
  if (hits.length === 0) return;
  out.push({
    id: id(), title: 'Slow File Downloads', category: 'Network',
    severity: 'warning',
    rule: `Triggered when entry has timings.receive > ${threshold}ms AND responseSize > 50KB. Found ${hits.length} entries.`,
    metric: { name: 'Slow downloads', value: hits.length, threshold: 0, unit: 'count' },
    whyItMatters: 'Slow downloads indicate bandwidth constraints or uncompressed assets.',
    evidence: `${hits.length} request(s) took over ${formatDuration(threshold)} to download.`,
    plainExplanation: `Some files took a long time to download. This could be caused by large uncompressed files or a slow connection.`,
    possibleFix: 'Enable gzip/brotli compression. Reduce file sizes. Use a CDN closer to users.',
    involvedEntryIds: hits.map((e) => e.id),
  });
}

function findLongBlocked(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const threshold = THRESHOLDS.LONG_BLOCKED_MS;
  const hits = entries.filter((e) => e.timings.blocked > threshold);
  if (hits.length === 0) return;
  out.push({
    id: id(), title: 'Requests Blocked / Queued', category: 'Browser',
    severity: 'warning',
    rule: `Triggered when entry has timings.blocked > ${threshold}ms. Found ${hits.length} entries.`,
    metric: { name: 'Blocked requests', value: hits.length, threshold: 0, unit: 'count' },
    whyItMatters: 'Browsers limit concurrent connections per domain (typically 6). Blocked time means a request waited in the queue.',
    evidence: `${hits.length} request(s) were blocked for over ${formatDuration(threshold)}.`,
    plainExplanation: `${hits.length} request(s) had to wait in line before the browser could start them, because too many connections to the same server were already open.`,
    possibleFix: 'Use HTTP/2 multiplexing. Reduce request count. Spread resources across domains if needed.',
    involvedEntryIds: hits.map((e) => e.id),
  });
}

function findRedirectChains(chains: RedirectChain[], out: BottleneckInsight[], id: IdGen) {
  for (const chain of chains) {
    if (chain.steps.length < 1) continue;
    const severity: Severity = chain.steps.length >= 3 ? 'critical' : chain.steps.length >= 2 ? 'warning' : 'info';
    out.push({
      id: id(), title: `Redirect Chain (${chain.steps.length} hops)`, category: 'Flow',
      severity,
      rule: `Triggered for each reconstructed redirect chain with ≥1 hop. This chain has ${chain.steps.length} step(s).`,
      metric: { name: 'Chain length', value: chain.steps.length, threshold: 1, unit: 'hops' },
      whyItMatters: 'Each redirect is a full network round-trip. The browser must complete each hop before starting the next one.',
      evidence: `Chain: ${chain.initialUrl} → ${chain.steps.map((s) => shortenUrl(s.toUrl, 30)).join(' → ')}. Total: ${formatDuration(chain.totalDuration)}.`,
      plainExplanation: `The browser was bounced through ${chain.steps.length} redirect(s) before reaching the final page at ${shortenUrl(chain.finalUrl, 40)}. Each bounce added waiting time.`,
      possibleFix: 'Link directly to the final destination URL. Eliminate unnecessary redirects.',
      involvedEntryIds: chain.steps.map((s) => s.entryId),
    });
  }
}

function findDuplicateRequests(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const groups = new Map<string, ParsedEntry[]>();
  for (const e of entries) {
    const key = e.method + ' ' + e.url;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const dupeGroups = [...groups.entries()].filter(([, g]) => g.length > 1);
  if (dupeGroups.length === 0) return;

  const totalDupes = dupeGroups.reduce((s, [, g]) => s + g.length, 0);
  const allDupeIds = dupeGroups.flatMap(([, g]) => g.map((e) => e.id));

  out.push({
    id: id(), title: 'Duplicate Requests', category: 'Efficiency',
    severity: 'warning',
    rule: `Triggered when the same method+URL combination appears more than once. Found ${dupeGroups.length} duplicated URL(s) with ${totalDupes} total requests.`,
    metric: { name: 'Duplicated URLs', value: dupeGroups.length, threshold: 0, unit: 'URLs' },
    whyItMatters: 'Duplicate requests waste bandwidth, increase server load, and delay other requests waiting in the queue.',
    evidence: `${dupeGroups.length} URL(s) requested multiple times. Example: ${shortenUrl(dupeGroups[0][0], 50)} (${dupeGroups[0][1].length}x).`,
    plainExplanation: `The same data was fetched more than once from ${dupeGroups.length} URL(s). This is usually unnecessary and wastes time.`,
    possibleFix: 'Add proper caching headers. Deduplicate API calls in application code. Use a request cache layer.',
    involvedEntryIds: allDupeIds,
  });
}

function findFailedRequests(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const failed = entries.filter((e) => e.isFailed);
  if (failed.length === 0) return;
  const serverErrors = failed.filter((e) => e.statusCode >= 500);
  const clientErrors = failed.filter((e) => e.statusCode >= 400 && e.statusCode < 500);
  const noResponse = failed.filter((e) => e.statusCode === 0);

  const parts: string[] = [];
  if (clientErrors.length > 0) parts.push(`${clientErrors.length} client error(s) (4xx)`);
  if (serverErrors.length > 0) parts.push(`${serverErrors.length} server error(s) (5xx)`);
  if (noResponse.length > 0) parts.push(`${noResponse.length} with no response`);

  out.push({
    id: id(), title: 'Failed Requests', category: 'Errors',
    severity: serverErrors.length > 0 || noResponse.length > 0 ? 'critical' : 'warning',
    rule: `Triggered when any entry has statusCode ≥ 400 or statusCode === 0. Found ${failed.length} entries.`,
    metric: { name: 'Failed requests', value: failed.length, threshold: 0, unit: 'count' },
    whyItMatters: 'Failed requests can mean broken features, missing assets, or server outages.',
    evidence: `${failed.length} request(s) failed: ${parts.join(', ')}.`,
    plainExplanation: `${failed.length} request(s) did not succeed. This could mean missing files, broken APIs, or server problems.`,
    possibleFix: 'Fix broken URLs. Investigate server errors. Ensure all required assets are deployed.',
    involvedEntryIds: failed.map((e) => e.id),
  });
}

function findLargeJavaScript(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const threshold = THRESHOLDS.LARGE_JS_BYTES;
  const hits = entries.filter((e) => e.resourceType === 'script' && e.responseSize > threshold);
  if (hits.length === 0) return;
  const totalSize = hits.reduce((s, e) => s + e.responseSize, 0);
  out.push({
    id: id(), title: 'Large JavaScript Bundles', category: 'Performance',
    severity: totalSize > 1_000_000 ? 'critical' : 'warning',
    rule: `Triggered when script entries have responseSize > ${formatBytes(threshold)}. Found ${hits.length} file(s) totaling ${formatBytes(totalSize)}.`,
    metric: { name: 'Total large JS', value: totalSize, threshold, unit: 'bytes' },
    whyItMatters: 'Large JS files take longer to download, parse, and execute, directly delaying interactivity.',
    evidence: `${hits.length} JS file(s) over ${formatBytes(threshold)}, totaling ${formatBytes(totalSize)}. Largest: ${shortenUrl(hits.sort((a, b) => b.responseSize - a.responseSize)[0].url, 40)} at ${formatBytes(hits[0].responseSize)}.`,
    plainExplanation: `There are ${hits.length} large JavaScript file(s) that must be downloaded and processed before the app works. This slows down how quickly users can interact with the page.`,
    possibleFix: 'Code-split your bundles. Tree-shake unused code. Lazy-load non-critical JS. Enable compression.',
    involvedEntryIds: hits.map((e) => e.id),
  });
}

function findLargeCSS(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const threshold = THRESHOLDS.LARGE_CSS_BYTES;
  const hits = entries.filter((e) => e.resourceType === 'stylesheet' && e.responseSize > threshold);
  if (hits.length === 0) return;
  out.push({
    id: id(), title: 'Large CSS Files', category: 'Performance',
    severity: 'warning',
    rule: `Triggered when stylesheet entries have responseSize > ${formatBytes(threshold)}. Found ${hits.length} file(s).`,
    metric: { name: 'Large CSS count', value: hits.length, threshold: 0, unit: 'files' },
    whyItMatters: 'CSS blocks rendering. Large CSS means a longer wait before anything appears on screen.',
    evidence: `${hits.length} CSS file(s) over ${formatBytes(threshold)}.`,
    plainExplanation: `Some CSS files are very large. The browser must download and process all of them before it can show anything on screen.`,
    possibleFix: 'Remove unused CSS. Split critical vs non-critical styles. Use CSS-in-JS with extraction.',
    involvedEntryIds: hits.map((e) => e.id),
  });
}

function findLargeImages(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const threshold = THRESHOLDS.LARGE_IMAGE_BYTES;
  const hits = entries.filter((e) => e.resourceType === 'image' && e.responseSize > threshold);
  if (hits.length === 0) return;
  const totalSize = hits.reduce((s, e) => s + e.responseSize, 0);
  out.push({
    id: id(), title: 'Large Unoptimized Images', category: 'Assets',
    severity: totalSize > 3_000_000 ? 'critical' : 'warning',
    rule: `Triggered when image entries have responseSize > ${formatBytes(threshold)}. Found ${hits.length} image(s) totaling ${formatBytes(totalSize)}.`,
    metric: { name: 'Total large images', value: totalSize, threshold, unit: 'bytes' },
    whyItMatters: 'Images are often the largest download on a page. Unoptimized images waste bandwidth.',
    evidence: `${hits.length} image(s) over ${formatBytes(threshold)}, totaling ${formatBytes(totalSize)}.`,
    plainExplanation: `${hits.length} image(s) are quite large. Compressing or resizing them would make the page load faster.`,
    possibleFix: 'Use modern formats (WebP/AVIF). Resize to display dimensions. Use responsive images. Lazy-load below-fold images.',
    involvedEntryIds: hits.map((e) => e.id),
  });
}

function findUncompressedText(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const compressibleTypes: Set<string> = new Set(['document', 'script', 'stylesheet']);
  const hits = entries.filter((e) =>
    compressibleTypes.has(e.resourceType) &&
    e.responseSize > 1_000 &&
    !e.isCompressed &&
    !e.servedFromCache
  );
  if (hits.length === 0) return;
  const totalUncompressed = hits.reduce((s, e) => s + e.responseSize, 0);
  out.push({
    id: id(), title: 'Uncompressed Text Resources', category: 'Performance',
    severity: totalUncompressed > 500_000 ? 'critical' : 'warning',
    rule: `Triggered when text resources (HTML/JS/CSS) > 1KB lack a Content-Encoding header and are not from cache. Found ${hits.length} resources.`,
    metric: { name: 'Uncompressed size', value: totalUncompressed, threshold: 1000, unit: 'bytes' },
    whyItMatters: 'Text resources compress extremely well (60-80% reduction). Sending them uncompressed wastes bandwidth.',
    evidence: `${hits.length} text resource(s) totaling ${formatBytes(totalUncompressed)} served without compression.`,
    plainExplanation: `${hits.length} file(s) were sent without compression. Enabling compression would make them much smaller and faster to download.`,
    possibleFix: 'Enable gzip or brotli compression on the server for text resources.',
    involvedEntryIds: hits.map((e) => e.id),
  });
}

function findThirdPartyOverload(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const tp = entries.filter((e) => e.isThirdParty);
  const tpDomains = new Set(tp.map((e) => e.hostname));
  if (tp.length < 10 && tpDomains.size < 5) return;

  const categories = new Map<string, number>();
  for (const e of tp) {
    const cat = e.thirdPartyCategory ?? 'Unknown';
    categories.set(cat, (categories.get(cat) ?? 0) + 1);
  }
  const catBreakdown = [...categories.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => `${cat}: ${count}`)
    .join(', ');

  out.push({
    id: id(), title: 'Heavy Third-Party Usage', category: 'Third-Party',
    severity: tp.length > 30 ? 'critical' : 'warning',
    rule: `Triggered when third-party request count ≥ 10 OR unique third-party domains ≥ 5. Found ${tp.length} requests across ${tpDomains.size} domains.`,
    metric: { name: 'Third-party requests', value: tp.length, threshold: 10, unit: 'count' },
    whyItMatters: 'Each third-party domain requires DNS + connect + SSL overhead that you cannot optimize.',
    evidence: `${tp.length} requests to ${tpDomains.size} domains. Breakdown: ${catBreakdown}.`,
    plainExplanation: `The page loads resources from ${tpDomains.size} external services. Each adds connection overhead and competes for bandwidth.`,
    possibleFix: 'Audit third-party scripts. Remove unused ones. Defer non-critical ones. Self-host critical assets.',
    involvedEntryIds: tp.map((e) => e.id),
  });
}

function findRenderBlocking(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const hits = entries.filter((e) => e.isRenderBlocking);
  if (hits.length === 0) return;
  const lastEnd = Math.max(...hits.map((e) => e.endTime));
  const firstStart = Math.min(...hits.map((e) => e.startTime));
  out.push({
    id: id(), title: 'Render-Blocking Resources', category: 'Rendering',
    severity: hits.length > 5 ? 'critical' : 'warning',
    rule: `Triggered when any entry has isRenderBlocking=true. Found ${hits.length} resources spanning ${formatDuration(lastEnd - firstStart)}.`,
    metric: { name: 'Blocking resources', value: hits.length, threshold: 0, unit: 'count' },
    whyItMatters: 'Render-blocking resources prevent the browser from painting any content until they are fully loaded.',
    evidence: `${hits.length} resource(s). First paint cannot happen before ${formatDuration(lastEnd)} (when the last blocking resource finishes).`,
    plainExplanation: `${hits.length} file(s) must finish loading before the browser shows anything on screen. They block the very first paint.`,
    possibleFix: 'Inline critical CSS. Add async/defer to non-critical scripts. Preload critical resources.',
    involvedEntryIds: hits.map((e) => e.id),
  });
}

function findSlowApis(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const threshold = 1000;
  const hits = entries.filter((e) => e.isApi && e.timings.wait > threshold);
  if (hits.length === 0) return;
  const worst = hits.reduce((a, b) => (b.timings.wait > a.timings.wait ? b : a));
  out.push({
    id: id(), title: 'Slow API Responses', category: 'Server',
    severity: worst.timings.wait > 3000 ? 'critical' : 'warning',
    rule: `Triggered when API entries have timings.wait > ${threshold}ms. Found ${hits.length} slow API(s).`,
    metric: { name: 'Worst API TTFB', value: worst.timings.wait, threshold, unit: 'ms' },
    whyItMatters: 'Slow APIs delay the content users are waiting to see. The frontend cannot render data it hasn\'t received.',
    evidence: `${hits.length} API(s) exceeded ${formatDuration(threshold)}. Worst: ${shortenUrl(worst.url)} at ${formatDuration(worst.timings.wait)}.`,
    plainExplanation: `${hits.length} API call(s) had slow server responses. The worst one waited ${formatDuration(worst.timings.wait)} - that's time users spend staring at a loading spinner.`,
    possibleFix: 'Optimize backend queries. Add caching. Consider pagination. Prefetch data.',
    involvedEntryIds: hits.map((e) => e.id),
  });
}

function findSerialApiChains(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const apis = entries
    .filter((e) => e.isApi && !e.isThirdParty)
    .sort((a, b) => a.startTime - b.startTime);
  if (apis.length < 3) return;

  const tolerance = THRESHOLDS.SERIAL_GAP_TOLERANCE_MS;
  let chainStart = 0;
  let chainLen = 1;

  const emitChain = (start: number, end: number) => {
    const chain = apis.slice(start, end);
    const totalTime = chain.reduce((s, e) => s + e.totalDuration, 0);
    const firstStart = chain[0].startTime;
    const lastEnd = chain[chain.length - 1].endTime;
    out.push({
      id: id(), title: `Serial API Chain (${chain.length} calls)`, category: 'Flow',
      severity: chain.length >= 4 ? 'critical' : 'warning',
      rule: `Triggered when ≥3 first-party API calls are sequential (next starts within ${tolerance}ms of previous ending). Found chain of ${chain.length}.`,
      metric: { name: 'Chain length', value: chain.length, threshold: 3, unit: 'calls' },
      whyItMatters: 'Serial API calls compound latency - total wait = sum of all calls. Parallel calls would only take as long as the slowest.',
      evidence: `${chain.length} APIs in sequence from ${formatDuration(firstStart)} to ${formatDuration(lastEnd)}, totaling ${formatDuration(totalTime)}.`,
      plainExplanation: `${chain.length} API calls were made one after another instead of simultaneously. This multiplied the waiting time.`,
      possibleFix: 'Parallelize independent API calls. Use aggregated endpoints. Implement data prefetching.',
      involvedEntryIds: chain.map((e) => e.id),
    });
  };

  for (let i = 1; i < apis.length; i++) {
    const prevEnd = apis[i - 1].endTime;
    if (apis[i].startTime >= prevEnd - tolerance) {
      chainLen++;
    } else {
      if (chainLen >= 3) emitChain(chainStart, i);
      chainLen = 1;
      chainStart = i;
    }
  }
  if (chainLen >= 3) emitChain(chainStart, apis.length);
}

function findPollingRequests(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  const threshold = THRESHOLDS.POLLING_MIN_REPEATS;
  const groups = new Map<string, ParsedEntry[]>();
  for (const e of entries) {
    const key = e.method + ' ' + e.url.split('?')[0]; // ignore query params
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  for (const [url, group] of groups) {
    if (group.length >= threshold) {
      out.push({
        id: id(), title: 'Repeated / Polling Requests', category: 'Efficiency',
        severity: 'info',
        rule: `Triggered when the same method+URL (ignoring query string) appears ≥ ${threshold} times. Found ${group.length} hits for this URL.`,
        metric: { name: 'Repeat count', value: group.length, threshold, unit: 'requests' },
        whyItMatters: 'Repeated requests may indicate polling, which adds continuous network overhead.',
        evidence: `${group.length} requests to ${shortenUrl(url, 50)}.`,
        plainExplanation: `The same URL was requested ${group.length} times. This might be intentional polling, or a bug causing unnecessary requests.`,
        possibleFix: 'Consider WebSockets or Server-Sent Events for real-time data instead of polling.',
        involvedEntryIds: group.map((e) => e.id),
      });
      break; // only report the most egregious one
    }
  }
}

function findTimingGaps(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  // Look for "idle" gaps where no requests are active for > 500ms.
  // This often indicates JS parsing/execution blocking further network activity.
  if (entries.length < 5) return;

  const sorted = [...entries].sort((a, b) => a.startTime - b.startTime);
  const events: { time: number; type: 'start' | 'end'; entryId: string }[] = [];
  for (const e of sorted) {
    events.push({ time: e.startTime, type: 'start', entryId: e.id });
    events.push({ time: e.endTime, type: 'end', entryId: e.id });
  }
  events.sort((a, b) => a.time - b.time || (a.type === 'end' ? -1 : 1));

  let active = 0;
  let lastEndTime = 0;
  const gaps: { start: number; end: number; duration: number }[] = [];

  for (const ev of events) {
    if (ev.type === 'start') {
      if (active === 0 && ev.time - lastEndTime > 500) {
        gaps.push({ start: lastEndTime, end: ev.time, duration: ev.time - lastEndTime });
      }
      active++;
    } else {
      active--;
      if (active === 0) lastEndTime = ev.time;
    }
  }

  if (gaps.length === 0) return;
  const totalGap = gaps.reduce((s, g) => s + g.duration, 0);

  out.push({
    id: id(), title: 'Idle Network Gaps', category: 'Flow',
    severity: totalGap > 2000 ? 'warning' : 'info',
    rule: `Triggered when there are periods > 500ms with zero active network requests. Found ${gaps.length} gap(s) totaling ${formatDuration(totalGap)}.`,
    metric: { name: 'Total gap time', value: totalGap, threshold: 500, unit: 'ms' },
    whyItMatters: 'Idle gaps usually mean the browser is executing JavaScript or waiting for something before it knows what to request next.',
    evidence: `${gaps.length} gap(s): ${gaps.map((g) => `${formatDuration(g.duration)} at ${formatDuration(g.start)}`).slice(0, 3).join(', ')}${gaps.length > 3 ? '...' : ''}.`,
    plainExplanation: `There were ${gaps.length} pause(s) where the browser wasn't downloading anything. This usually happens when JavaScript is running and hasn't yet decided what to fetch next.`,
    possibleFix: 'Preload known resources. Use resource hints. Reduce JS execution time blocking discovery.',
    involvedEntryIds: [],
  });
}

function findLateCriticalData(entries: ParsedEntry[], out: BottleneckInsight[], id: IdGen) {
  // Find API calls that started very late relative to the total timeline
  // but appear to fetch important data (JSON response to first-party domain).
  const totalDuration = Math.max(...entries.map((e) => e.endTime), 1);
  const lateThreshold = totalDuration * 0.6;
  const lateApis = entries.filter(
    (e) => e.isApi && !e.isThirdParty && e.startTime > lateThreshold && e.timings.wait > 300
  );

  if (lateApis.length === 0) return;

  out.push({
    id: id(), title: 'Late-Loaded Critical Data', category: 'Flow',
    severity: 'warning',
    rule: `Triggered when first-party API calls start after 60% of total load time (${formatDuration(lateThreshold)}) and have TTFB > 300ms. Found ${lateApis.length}.`,
    metric: { name: 'Late API count', value: lateApis.length, threshold: 0, unit: 'calls' },
    whyItMatters: 'API calls that start late suggest a deep dependency chain: HTML → JS → parse → execute → discover API → call API → wait → render.',
    evidence: `${lateApis.length} API call(s) started after ${formatDuration(lateThreshold)}.`,
    plainExplanation: `${lateApis.length} data request(s) started very late in the page load. The app had to download and run JavaScript before it even knew it needed this data.`,
    possibleFix: 'Prefetch API data. Use server-side rendering. Inline critical data in the HTML response.',
    involvedEntryIds: lateApis.map((e) => e.id),
  });
}

function severityRank(s: Severity): number {
  return s === 'critical' ? 0 : s === 'warning' ? 1 : 2;
}
