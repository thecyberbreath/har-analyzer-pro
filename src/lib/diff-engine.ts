import type { ParsedEntry, FlowStage, DomainStats, AnalysisSummary, NormalizedTimings, HarAnalysis } from '@/types/har';
import type {
  HarDiffResult,
  MatchedRequest,
  MatchConfidence,
  TimingDelta,
  SizeDelta,
  ChangeDirection,
  DiffMetric,
  DiffStageSummary,
  DiffInsight,
  DomainDiff,
} from '@/types/diff';
import { formatBytes, formatDuration, shortenUrl } from './utils';

// ─────────────────────────────────────────────────────────────────
// Thresholds for significance detection
// ─────────────────────────────────────────────────────────────────

const DIFF_THRESHOLDS = {
  SIGNIFICANT_TIMING_CHANGE_MS: 100,
  SIGNIFICANT_TIMING_CHANGE_PCT: 15,
  SIGNIFICANT_SIZE_CHANGE_BYTES: 50_000,
  SIGNIFICANT_SIZE_CHANGE_PCT: 20,
  TOP_REGRESSION_COUNT: 10,
  TOP_IMPROVEMENT_COUNT: 10,
  CACHE_BUSTER_PARAMS: new Set([
    '_', 't', 'ts', 'timestamp', 'v', 'ver', 'version', 'cb', 'cachebust',
    'bust', 'nocache', 'nc', 'rand', 'random', 'r', 'hash', 'h', '_t',
    'nonce', 'reqid', 'request_id', 'uid',
  ]),
} as const;

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

export function compareHars(
  analysisA: HarAnalysis,
  analysisB: HarAnalysis,
  labelA = 'HAR A (Baseline)',
  labelB = 'HAR B (Comparison)',
): HarDiffResult {
  const { entries: entriesA, domains: domainsA, flowStages: stagesA, summary: summaryA } = analysisA;
  const { entries: entriesB, domains: domainsB, flowStages: stagesB, summary: summaryB } = analysisB;

  const { matched, addedInB, removedFromA } = matchRequests(entriesA, entriesB);

  const metrics = buildMetrics(summaryA, summaryB, entriesA, entriesB);

  const sorted = [...matched].sort(
    (a, b) => Math.abs(b.timingDelta.totalMs) - Math.abs(a.timingDelta.totalMs),
  );
  const topRegressions = sorted
    .filter((m) => m.timingDelta.direction === 'worse')
    .slice(0, DIFF_THRESHOLDS.TOP_REGRESSION_COUNT);
  const topImprovements = sorted
    .filter((m) => m.timingDelta.direction === 'better')
    .slice(0, DIFF_THRESHOLDS.TOP_IMPROVEMENT_COUNT);

  const stageComparison = compareFlowStages(stagesA, stagesB);

  const domainChanges = compareDomains(domainsA, domainsB);

  const insights = generateDiffInsights(
    matched, addedInB, removedFromA, summaryA, summaryB,
    stageComparison, domainChanges, entriesA, entriesB,
  );

  const rootCauseHints = generateRootCauseHints(
    matched, addedInB, summaryA, summaryB, domainChanges,
  );

  const humanSummary = generateHumanSummary(
    summaryA, summaryB, matched, addedInB, removedFromA,
    topRegressions, domainChanges, rootCauseHints,
  );

  return {
    labelA,
    labelB,
    summaryA,
    summaryB,
    metrics,
    matched,
    addedInB,
    removedFromA,
    topRegressions,
    topImprovements,
    stageComparison,
    insights,
    rootCauseHints,
    humanSummary,
    domainChanges,
  };
}

// ─────────────────────────────────────────────────────────────────
// Request Matching
// ─────────────────────────────────────────────────────────────────

function matchRequests(
  entriesA: ParsedEntry[],
  entriesB: ParsedEntry[],
): { matched: MatchedRequest[]; addedInB: ParsedEntry[]; removedFromA: ParsedEntry[] } {
  const matched: MatchedRequest[] = [];
  const usedA = new Set<string>();
  const usedB = new Set<string>();

  // Pass 1: Exact normalized URL match (method + normalized URL)
  for (const a of entriesA) {
    if (usedA.has(a.id)) continue;
    const normA = normalizeUrlForDiff(a.url);
    for (const b of entriesB) {
      if (usedB.has(b.id)) continue;
      if (a.method === b.method && normalizeUrlForDiff(b.url) === normA) {
        matched.push(buildMatch(a, b, 'exact', 'Exact URL match (after normalization)'));
        usedA.add(a.id);
        usedB.add(b.id);
        break;
      }
    }
  }

  // Pass 2: Method + hostname + path (ignore query string entirely)
  for (const a of entriesA) {
    if (usedA.has(a.id)) continue;
    for (const b of entriesB) {
      if (usedB.has(b.id)) continue;
      if (a.method === b.method && a.hostname === b.hostname && getPathOnly(a.url) === getPathOnly(b.url)) {
        matched.push(buildMatch(a, b, 'high', 'Same method + hostname + path (query string differs)'));
        usedA.add(a.id);
        usedB.add(b.id);
        break;
      }
    }
  }

  // Pass 3: Same hostname + resource type + similar path
  for (const a of entriesA) {
    if (usedA.has(a.id)) continue;
    for (const b of entriesB) {
      if (usedB.has(b.id)) continue;
      if (
        a.hostname === b.hostname &&
        a.resourceType === b.resourceType &&
        pathSimilarity(a.url, b.url) > 0.7
      ) {
        matched.push(buildMatch(a, b, 'medium', 'Same hostname + resource type, similar path'));
        usedA.add(a.id);
        usedB.add(b.id);
        break;
      }
    }
  }

  // Pass 4: Same resource type + similar file name (for versioned bundles)
  for (const a of entriesA) {
    if (usedA.has(a.id)) continue;
    const fileA = extractFileName(a.url);
    if (!fileA) continue;
    for (const b of entriesB) {
      if (usedB.has(b.id)) continue;
      const fileB = extractFileName(b.url);
      if (!fileB) continue;
      if (
        a.resourceType === b.resourceType &&
        a.hostname === b.hostname &&
        fileNameSimilarity(fileA, fileB) > 0.6
      ) {
        matched.push(buildMatch(a, b, 'low', 'Same type + hostname, similar filename (possible versioned bundle)'));
        usedA.add(a.id);
        usedB.add(b.id);
        break;
      }
    }
  }

  const addedInB = entriesB.filter((b) => !usedB.has(b.id));
  const removedFromA = entriesA.filter((a) => !usedA.has(a.id));

  return { matched, addedInB, removedFromA };
}

function normalizeUrlForDiff(url: string): string {
  try {
    const u = new URL(url);
    const params = new URLSearchParams(u.search);
    for (const key of [...params.keys()]) {
      if (DIFF_THRESHOLDS.CACHE_BUSTER_PARAMS.has(key.toLowerCase())) {
        params.delete(key);
      }
    }
    params.sort();
    const qs = params.toString();
    return u.origin + u.pathname + (qs ? '?' + qs : '');
  } catch {
    return url;
  }
}

function getPathOnly(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function extractFileName(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/');
    const last = parts[parts.length - 1];
    return last || null;
  } catch {
    return null;
  }
}

function pathSimilarity(urlA: string, urlB: string): number {
  const pathA = getPathOnly(urlA).split('/').filter(Boolean);
  const pathB = getPathOnly(urlB).split('/').filter(Boolean);
  if (pathA.length === 0 && pathB.length === 0) return 1;
  const maxLen = Math.max(pathA.length, pathB.length);
  if (maxLen === 0) return 1;
  let matches = 0;
  for (let i = 0; i < Math.min(pathA.length, pathB.length); i++) {
    if (pathA[i] === pathB[i]) matches++;
  }
  return matches / maxLen;
}

function fileNameSimilarity(fileA: string, fileB: string): number {
  // Strip common hash/version patterns: e.g. main.abc123.js -> main.js
  const stripHash = (f: string) => f.replace(/[.-][a-f0-9]{6,}(?=\.)/gi, '');
  const a = stripHash(fileA);
  const b = stripHash(fileB);
  if (a === b) return 1;
  // Levenshtein-based similarity for short strings
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function buildMatch(
  a: ParsedEntry, b: ParsedEntry, confidence: MatchConfidence, reason: string,
): MatchedRequest {
  return {
    entryA: a,
    entryB: b,
    confidence,
    matchReason: reason,
    timingDelta: computeTimingDelta(a, b),
    sizeDelta: computeSizeDelta(a, b),
    statusChanged: a.statusCode !== b.statusCode,
  };
}

function computeTimingDelta(a: ParsedEntry, b: ParsedEntry): TimingDelta {
  const totalMs = b.totalDuration - a.totalDuration;
  const totalPct = a.totalDuration > 0 ? (totalMs / a.totalDuration) * 100 : 0;
  const phases: Record<keyof NormalizedTimings, number> = {
    blocked: b.timings.blocked - a.timings.blocked,
    dns: b.timings.dns - a.timings.dns,
    connect: b.timings.connect - a.timings.connect,
    ssl: b.timings.ssl - a.timings.ssl,
    send: b.timings.send - a.timings.send,
    wait: b.timings.wait - a.timings.wait,
    receive: b.timings.receive - a.timings.receive,
    total: totalMs,
  };
  let biggestPhase = 'total';
  let biggestPhaseMs = 0;
  for (const [key, val] of Object.entries(phases)) {
    if (key === 'total') continue;
    if (Math.abs(val) > Math.abs(biggestPhaseMs)) {
      biggestPhase = key;
      biggestPhaseMs = val;
    }
  }
  return {
    totalMs,
    totalPct,
    phases,
    direction: directionFromDelta(totalMs, DIFF_THRESHOLDS.SIGNIFICANT_TIMING_CHANGE_MS),
    biggestPhase,
    biggestPhaseMs,
  };
}

function computeSizeDelta(a: ParsedEntry, b: ParsedEntry): SizeDelta {
  const bytes = b.transferSize - a.transferSize;
  const pct = a.transferSize > 0 ? (bytes / a.transferSize) * 100 : 0;
  return {
    bytes,
    pct,
    direction: directionFromDelta(bytes, DIFF_THRESHOLDS.SIGNIFICANT_SIZE_CHANGE_BYTES),
  };
}

function directionFromDelta(delta: number, threshold: number): ChangeDirection {
  if (delta > threshold) return 'worse';
  if (delta < -threshold) return 'better';
  return 'neutral';
}

// ─────────────────────────────────────────────────────────────────
// Metrics Comparison
// ─────────────────────────────────────────────────────────────────

function buildMetrics(
  a: AnalysisSummary, b: AnalysisSummary,
  entriesA: ParsedEntry[], entriesB: ParsedEntry[],
): DiffMetric[] {
  const m = (
    id: string, label: string, vA: number, vB: number,
    unit: DiffMetric['unit'], icon: string, invertBetter = false,
  ): DiffMetric => {
    const delta = vB - vA;
    const deltaPct = vA > 0 ? (delta / vA) * 100 : 0;
    const raw: ChangeDirection = delta > 0 ? 'worse' : delta < 0 ? 'better' : 'neutral';
    const direction = invertBetter
      ? (raw === 'better' ? 'worse' : raw === 'worse' ? 'better' : 'neutral')
      : raw;
    const absPct = Math.abs(deltaPct);
    const significance: DiffMetric['significance'] =
      absPct > 30 ? 'high' : absPct > 10 ? 'medium' : 'low';
    return { id, label, valueA: vA, valueB: vB, delta, deltaPct, direction, unit, icon, significance };
  };

  const avgTTFBA = avg(entriesA.map((e) => e.timings.wait));
  const avgTTFBB = avg(entriesB.map((e) => e.timings.wait));

  return [
    m('duration', 'Total Duration', a.totalDuration, b.totalDuration, 'ms', '⏱️'),
    m('requests', 'Requests', a.totalRequests, b.totalRequests, 'count', '📡'),
    m('size', 'Transfer Size', a.totalTransferSize, b.totalTransferSize, 'bytes', '📦'),
    m('failed', 'Failed Requests', a.failedRequests, b.failedRequests, 'count', '❌'),
    m('redirects', 'Redirects', a.redirectCount, b.redirectCount, 'count', '🔀'),
    m('thirdParty', 'Third-Party', a.thirdPartyRequests, b.thirdPartyRequests, 'count', '🌐'),
    m('avgTTFB', 'Avg TTFB', avgTTFBA, avgTTFBB, 'ms', '🏷️'),
    m('domains', 'Unique Domains', a.uniqueDomains, b.uniqueDomains, 'count', '🔗'),
  ];
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

// ─────────────────────────────────────────────────────────────────
// Flow Stage Comparison
// ─────────────────────────────────────────────────────────────────

function compareFlowStages(stagesA: FlowStage[], stagesB: FlowStage[]): DiffStageSummary[] {
  const result: DiffStageSummary[] = [];
  const usedB = new Set<string>();

  for (const sa of stagesA) {
    const sb = stagesB.find((s) => s.id === sa.id);
    if (sb) {
      usedB.add(sb.id);
      const dDur = sb.duration - sa.duration;
      const dPct = sa.duration > 0 ? (dDur / sa.duration) * 100 : 0;
      const dReq = sb.entryIds.length - sa.entryIds.length;
      const isSignificant = Math.abs(dPct) > 10 || Math.abs(dDur) > 200;
      result.push({
        stageId: sa.id,
        stageName: sa.name,
        stageA: sa,
        stageB: sb,
        durationDelta: dDur,
        durationDeltaPct: dPct,
        requestCountDelta: dReq,
        status: isSignificant ? 'changed' : 'unchanged',
        direction: dDur > 200 ? 'worse' : dDur < -200 ? 'better' : 'neutral',
        description: describeStageChange(sa, sb, dDur, dReq),
      });
    } else {
      result.push({
        stageId: sa.id,
        stageName: sa.name,
        stageA: sa,
        stageB: null,
        durationDelta: -sa.duration,
        durationDeltaPct: -100,
        requestCountDelta: -sa.entryIds.length,
        status: 'removed',
        direction: 'better',
        description: `"${sa.name}" no longer appears in HAR B.`,
      });
    }
  }

  for (const sb of stagesB) {
    if (usedB.has(sb.id)) continue;
    result.push({
      stageId: sb.id,
      stageName: sb.name,
      stageA: null,
      stageB: sb,
      durationDelta: sb.duration,
      durationDeltaPct: 100,
      requestCountDelta: sb.entryIds.length,
      status: 'new',
      direction: 'worse',
      description: `"${sb.name}" is new in HAR B (${sb.entryIds.length} requests, ${formatDuration(sb.duration)}).`,
    });
  }

  return result;
}

function describeStageChange(a: FlowStage, b: FlowStage, dDur: number, dReq: number): string {
  const parts: string[] = [];
  if (Math.abs(dDur) > 200) {
    parts.push(`took ${formatDuration(Math.abs(dDur))} ${dDur > 0 ? 'longer' : 'shorter'}`);
  }
  if (dReq !== 0) {
    parts.push(`${Math.abs(dReq)} request(s) ${dReq > 0 ? 'added' : 'removed'}`);
  }
  if (parts.length === 0) return `"${a.name}" is roughly the same.`;
  return `"${a.name}" ${parts.join(' and ')}.`;
}

// ─────────────────────────────────────────────────────────────────
// Domain Comparison
// ─────────────────────────────────────────────────────────────────

function compareDomains(domainsA: DomainStats[], domainsB: DomainStats[]): DomainDiff[] {
  const result: DomainDiff[] = [];
  const mapB = new Map(domainsB.map((d) => [d.domain, d]));

  for (const da of domainsA) {
    const db = mapB.get(da.domain);
    if (db) {
      mapB.delete(da.domain);
      const dReq = db.requestCount - da.requestCount;
      const dSize = db.totalSize - da.totalSize;
      const dDur = db.totalDuration - da.totalDuration;
      result.push({
        domain: da.domain,
        isThirdParty: da.isThirdParty,
        statsA: da,
        statsB: db,
        requestCountDelta: dReq,
        sizeDelta: dSize,
        durationDelta: dDur,
        status: 'changed',
        direction: dDur > 500 ? 'worse' : dDur < -500 ? 'better' : 'neutral',
      });
    } else {
      result.push({
        domain: da.domain,
        isThirdParty: da.isThirdParty,
        statsA: da,
        statsB: null,
        requestCountDelta: -da.requestCount,
        sizeDelta: -da.totalSize,
        durationDelta: -da.totalDuration,
        status: 'removed',
        direction: 'better',
      });
    }
  }

  for (const [, db] of mapB) {
    result.push({
      domain: db.domain,
      isThirdParty: db.isThirdParty,
      statsA: null,
      statsB: db,
      requestCountDelta: db.requestCount,
      sizeDelta: db.totalSize,
      durationDelta: db.totalDuration,
      status: 'new',
      direction: 'worse',
    });
  }

  result.sort((a, b) => Math.abs(b.durationDelta) - Math.abs(a.durationDelta));
  return result;
}

// ─────────────────────────────────────────────────────────────────
// Diff Insight Generation
// ─────────────────────────────────────────────────────────────────

function generateDiffInsights(
  matched: MatchedRequest[],
  addedInB: ParsedEntry[],
  removedFromA: ParsedEntry[],
  summaryA: AnalysisSummary,
  summaryB: AnalysisSummary,
  stageComparison: DiffStageSummary[],
  domainChanges: DomainDiff[],
  entriesA: ParsedEntry[],
  entriesB: ParsedEntry[],
): DiffInsight[] {
  const insights: DiffInsight[] = [];
  let id = 0;
  const next = () => `diff-insight-${id++}`;

  // Timing regressions by phase
  const phaseTotals = { dns: 0, connect: 0, ssl: 0, wait: 0, receive: 0, blocked: 0 };
  for (const m of matched) {
    phaseTotals.dns += m.timingDelta.phases.dns;
    phaseTotals.connect += m.timingDelta.phases.connect;
    phaseTotals.ssl += m.timingDelta.phases.ssl;
    phaseTotals.wait += m.timingDelta.phases.wait;
    phaseTotals.receive += m.timingDelta.phases.receive;
    phaseTotals.blocked += m.timingDelta.phases.blocked;
  }

  if (phaseTotals.dns > 200) {
    insights.push({
      id: next(), title: 'DNS resolution got slower',
      severity: phaseTotals.dns > 500 ? 'critical' : 'warning',
      category: 'timing-regression',
      description: `Total DNS time across matched requests increased by ${formatDuration(phaseTotals.dns)}.`,
      evidence: `Aggregate DNS delta: +${formatDuration(phaseTotals.dns)} across ${matched.length} matched requests.`,
      affectedUrls: matched.filter((m) => m.timingDelta.phases.dns > 50).map((m) => m.entryB.url),
      affectedDomains: [...new Set(matched.filter((m) => m.timingDelta.phases.dns > 50).map((m) => m.entryB.hostname))],
      whyItMatters: 'Slower DNS resolution delays the very start of each request. It can indicate network or DNS provider issues.',
      possibleNextStep: 'Check if DNS provider changed, or if new domains were added requiring fresh lookups.',
    });
  }

  if (phaseTotals.connect > 300) {
    insights.push({
      id: next(), title: 'Connection setup got slower',
      severity: phaseTotals.connect > 800 ? 'critical' : 'warning',
      category: 'timing-regression',
      description: `Total connect time increased by ${formatDuration(phaseTotals.connect)}.`,
      evidence: `Aggregate connect delta: +${formatDuration(phaseTotals.connect)}.`,
      affectedUrls: matched.filter((m) => m.timingDelta.phases.connect > 50).map((m) => m.entryB.url),
      affectedDomains: [...new Set(matched.filter((m) => m.timingDelta.phases.connect > 50).map((m) => m.entryB.hostname))],
      whyItMatters: 'Slower connections suggest network path changes or server configuration issues.',
      possibleNextStep: 'Compare from the same network location to isolate network vs server causes.',
    });
  }

  if (phaseTotals.ssl > 200) {
    insights.push({
      id: next(), title: 'SSL/TLS handshakes got slower',
      severity: 'warning',
      category: 'timing-regression',
      description: `Total SSL time increased by ${formatDuration(phaseTotals.ssl)}.`,
      evidence: `Aggregate SSL delta: +${formatDuration(phaseTotals.ssl)}.`,
      affectedUrls: matched.filter((m) => m.timingDelta.phases.ssl > 30).map((m) => m.entryB.url),
      affectedDomains: [...new Set(matched.filter((m) => m.timingDelta.phases.ssl > 30).map((m) => m.entryB.hostname))],
      whyItMatters: 'SSL/TLS overhead typically indicates certificate chain issues or protocol downgrade.',
      possibleNextStep: 'Verify TLS version and certificate chain length remain the same.',
    });
  }

  if (phaseTotals.wait > 500) {
    const worstWait = matched
      .filter((m) => m.timingDelta.phases.wait > 100)
      .sort((a, b) => b.timingDelta.phases.wait - a.timingDelta.phases.wait);
    insights.push({
      id: next(), title: 'Server response time (TTFB) increased',
      severity: phaseTotals.wait > 2000 ? 'critical' : 'warning',
      category: 'timing-regression',
      description: `Total server wait time across matched requests increased by ${formatDuration(phaseTotals.wait)}. This is the time the server takes to start sending a response.`,
      evidence: `Aggregate TTFB delta: +${formatDuration(phaseTotals.wait)}. Top affected: ${worstWait.slice(0, 3).map((m) => shortenUrl(m.entryB.url, 50)).join(', ')}.`,
      affectedUrls: worstWait.map((m) => m.entryB.url),
      affectedDomains: [...new Set(worstWait.map((m) => m.entryB.hostname))],
      whyItMatters: 'Higher TTFB means the server is taking longer to process requests. This is often the biggest contributor to slowdowns.',
      possibleNextStep: 'Investigate backend performance: database queries, API dependencies, or server load.',
    });
  }

  if (phaseTotals.receive > 500) {
    insights.push({
      id: next(), title: 'Download times increased',
      severity: phaseTotals.receive > 2000 ? 'critical' : 'warning',
      category: 'timing-regression',
      description: `Total download time increased by ${formatDuration(phaseTotals.receive)}.`,
      evidence: `Aggregate receive delta: +${formatDuration(phaseTotals.receive)}.`,
      affectedUrls: matched.filter((m) => m.timingDelta.phases.receive > 100).map((m) => m.entryB.url),
      affectedDomains: [],
      whyItMatters: 'Slower downloads indicate larger payloads or reduced bandwidth.',
      possibleNextStep: 'Check if response sizes grew or if the network conditions differ.',
    });
  }

  // New large JS/CSS
  const newLargeJS = addedInB.filter((e) => e.resourceType === 'script' && e.transferSize > 100_000);
  if (newLargeJS.length > 0) {
    const totalSize = newLargeJS.reduce((s, e) => s + e.transferSize, 0);
    insights.push({
      id: next(), title: `${newLargeJS.length} new large JavaScript bundle(s) appeared`,
      severity: totalSize > 500_000 ? 'critical' : 'warning',
      category: 'asset-regression',
      description: `HAR B includes ${newLargeJS.length} new JS file(s) totaling ${formatBytes(totalSize)} that were not in HAR A.`,
      evidence: newLargeJS.map((e) => `${shortenUrl(e.url, 60)} (${formatBytes(e.transferSize)})`).join('; '),
      affectedUrls: newLargeJS.map((e) => e.url),
      affectedDomains: [...new Set(newLargeJS.map((e) => e.hostname))],
      whyItMatters: 'New JavaScript bundles delay page interactivity and increase CPU parse/compile time.',
      possibleNextStep: 'Check if these bundles are necessary, code-split, or lazy-loaded appropriately.',
    });
  }

  const newLargeCSS = addedInB.filter((e) => e.resourceType === 'stylesheet' && e.transferSize > 50_000);
  if (newLargeCSS.length > 0) {
    insights.push({
      id: next(), title: `${newLargeCSS.length} new CSS file(s) appeared`,
      severity: 'warning',
      category: 'asset-regression',
      description: `New stylesheets in HAR B: ${newLargeCSS.map((e) => shortenUrl(e.url, 40)).join(', ')}.`,
      evidence: `Total new CSS size: ${formatBytes(newLargeCSS.reduce((s, e) => s + e.transferSize, 0))}.`,
      affectedUrls: newLargeCSS.map((e) => e.url),
      affectedDomains: [],
      whyItMatters: 'New CSS can become render-blocking and delay first paint.',
      possibleNextStep: 'Check if the new styles are critical or can be deferred.',
    });
  }

  // More third-party requests in B
  const tpCountA = entriesA.filter((e) => e.isThirdParty).length;
  const tpCountB = entriesB.filter((e) => e.isThirdParty).length;
  if (tpCountB - tpCountA > 3) {
    const newTPDomains = domainChanges
      .filter((d) => d.status === 'new' && d.isThirdParty)
      .map((d) => d.domain);
    insights.push({
      id: next(), title: 'More third-party requests',
      severity: (tpCountB - tpCountA) > 10 ? 'warning' : 'info',
      category: 'asset-regression',
      description: `HAR B has ${tpCountB - tpCountA} more third-party requests than HAR A.${newTPDomains.length > 0 ? ` New domains: ${newTPDomains.join(', ')}.` : ''}`,
      evidence: `Third-party count: ${tpCountA} → ${tpCountB}.`,
      affectedUrls: addedInB.filter((e) => e.isThirdParty).map((e) => e.url),
      affectedDomains: newTPDomains,
      whyItMatters: 'Third-party requests compete for bandwidth and are outside your direct control.',
      possibleNextStep: 'Review newly added third-party services and assess whether they are necessary.',
    });
  }

  // More failed requests
  if (summaryB.failedRequests > summaryA.failedRequests) {
    const delta = summaryB.failedRequests - summaryA.failedRequests;
    const newFailures = addedInB.filter((e) => e.isFailed);
    const becameFailures = matched.filter((m) => !m.entryA.isFailed && m.entryB.isFailed);
    insights.push({
      id: next(), title: `${delta} more failed request(s)`,
      severity: delta > 3 ? 'critical' : 'warning',
      category: 'asset-regression',
      description: `HAR B has ${delta} more failures.${becameFailures.length > 0 ? ` ${becameFailures.length} previously successful request(s) now fail.` : ''}`,
      evidence: `Failed: ${summaryA.failedRequests} → ${summaryB.failedRequests}.`,
      affectedUrls: [...newFailures.map((e) => e.url), ...becameFailures.map((m) => m.entryB.url)],
      affectedDomains: [],
      whyItMatters: 'Failed requests mean missing content, broken functionality, or wasted network round-trips.',
      possibleNextStep: 'Investigate the failing URLs for server errors, CORS issues, or missing resources.',
    });
  }

  // Flow stage regressions
  const stageRegs = stageComparison.filter((s) => s.status === 'changed' && s.direction === 'worse');
  for (const sr of stageRegs) {
    insights.push({
      id: next(), title: `"${sr.stageName}" stage got slower`,
      severity: sr.durationDelta > 1000 ? 'warning' : 'info',
      category: 'flow-regression',
      description: sr.description,
      evidence: `Duration: ${formatDuration(sr.stageA?.duration ?? 0)} → ${formatDuration(sr.stageB?.duration ?? 0)} (+${formatDuration(sr.durationDelta)}).`,
      affectedUrls: sr.stageB?.entryIds ?? [],
      affectedDomains: [],
      whyItMatters: 'Changes in load stage timing can shift when users see content or can interact with the page.',
      possibleNextStep: 'Drill into the requests in this stage to find individual regressions.',
    });
  }

  // Removed requests (possible improvements)
  if (removedFromA.length > 3) {
    insights.push({
      id: next(), title: `${removedFromA.length} requests removed`,
      severity: 'info',
      category: 'removed-requests',
      description: `HAR B no longer includes ${removedFromA.length} request(s) that were in HAR A.`,
      evidence: removedFromA.slice(0, 5).map((e) => shortenUrl(e.url, 50)).join('; ') + (removedFromA.length > 5 ? ` +${removedFromA.length - 5} more` : ''),
      affectedUrls: removedFromA.map((e) => e.url),
      affectedDomains: [],
      whyItMatters: 'Fewer requests generally means faster loads, unless critical resources were removed.',
      possibleNextStep: 'Verify that removed requests are intentional and no features are broken.',
    });
  }

  // Significant size growth on matched requests
  const sizeGrowth = matched.filter(
    (m) => m.sizeDelta.bytes > DIFF_THRESHOLDS.SIGNIFICANT_SIZE_CHANGE_BYTES,
  );
  if (sizeGrowth.length > 0) {
    const totalGrowth = sizeGrowth.reduce((s, m) => s + m.sizeDelta.bytes, 0);
    insights.push({
      id: next(), title: `${sizeGrowth.length} request(s) grew significantly in size`,
      severity: totalGrowth > 500_000 ? 'warning' : 'info',
      category: 'asset-regression',
      description: `${sizeGrowth.length} matched request(s) transferred ${formatBytes(totalGrowth)} more data in HAR B.`,
      evidence: sizeGrowth.slice(0, 3).map((m) =>
        `${shortenUrl(m.entryB.url, 40)}: +${formatBytes(m.sizeDelta.bytes)}`
      ).join('; '),
      affectedUrls: sizeGrowth.map((m) => m.entryB.url),
      affectedDomains: [],
      whyItMatters: 'Larger payloads take longer to download, especially on slow connections.',
      possibleNextStep: 'Check if assets are properly compressed and if new content was added.',
    });
  }

  return insights;
}

// ─────────────────────────────────────────────────────────────────
// Root Cause Hints
// ─────────────────────────────────────────────────────────────────

function generateRootCauseHints(
  matched: MatchedRequest[],
  addedInB: ParsedEntry[],
  summaryA: AnalysisSummary,
  summaryB: AnalysisSummary,
  domainChanges: DomainDiff[],
): DiffInsight[] {
  const hints: DiffInsight[] = [];
  let id = 0;
  const next = () => `root-cause-${id++}`;

  const durationDelta = summaryB.totalDuration - summaryA.totalDuration;
  if (durationDelta <= 0) return hints;

  // Analyze where the regression comes from
  const ttfbTotal = matched.reduce((s, m) => s + Math.max(0, m.timingDelta.phases.wait), 0);
  const networkTotal = matched.reduce((s, m) =>
    s + Math.max(0, m.timingDelta.phases.dns + m.timingDelta.phases.connect + m.timingDelta.phases.ssl), 0);
  const downloadTotal = matched.reduce((s, m) => s + Math.max(0, m.timingDelta.phases.receive), 0);

  const addedDuration = addedInB.reduce((s, e) => s + e.totalDuration, 0);
  const addedJSSize = addedInB.filter((e) => e.resourceType === 'script').reduce((s, e) => s + e.transferSize, 0);

  const regCountHeavy = matched.filter((m) => m.timingDelta.totalMs > 500).length;
  const regCountLight = matched.filter((m) => m.timingDelta.totalMs > 100 && m.timingDelta.totalMs <= 500).length;

  if (ttfbTotal > durationDelta * 0.4) {
    hints.push({
      id: next(), title: 'Backend / API wait time is the primary cause',
      severity: 'critical', category: 'root-cause',
      description: 'Most of the slowdown comes from the server taking longer to respond (higher TTFB). The problem is likely on the backend, not the frontend.',
      evidence: `Server wait time increased by ${formatDuration(ttfbTotal)} across matched requests, accounting for a large share of the total regression.`,
      affectedUrls: [], affectedDomains: [],
      whyItMatters: 'Backend slowdowns affect every user equally and cannot be solved by frontend optimization.',
      possibleNextStep: 'Profile backend endpoints, check database query performance, and review recent backend deploys.',
    });
  }

  if (networkTotal > durationDelta * 0.3) {
    hints.push({
      id: next(), title: 'Network setup times worsened',
      severity: 'warning', category: 'root-cause',
      description: 'DNS, connection, and SSL times are significantly higher in HAR B. The regression may be partially network-related.',
      evidence: `Network setup overhead increased by ${formatDuration(networkTotal)}.`,
      affectedUrls: [], affectedDomains: [],
      whyItMatters: 'Network-level changes can indicate infrastructure issues or geographic routing differences.',
      possibleNextStep: 'Ensure both HARs were captured from the same network environment for a fair comparison.',
    });
  }

  if (addedJSSize > 200_000) {
    hints.push({
      id: next(), title: 'New heavy JavaScript bundles appeared',
      severity: 'warning', category: 'root-cause',
      description: `${formatBytes(addedJSSize)} of new JavaScript appeared in HAR B, which likely delayed app startup and interactivity.`,
      evidence: `${addedInB.filter((e) => e.resourceType === 'script').length} new script(s) totaling ${formatBytes(addedJSSize)}.`,
      affectedUrls: addedInB.filter((e) => e.resourceType === 'script').map((e) => e.url),
      affectedDomains: [],
      whyItMatters: 'JavaScript is the most expensive resource type per byte due to parse/compile/execute overhead.',
      possibleNextStep: 'Review recent deploys for bundle size changes, check code splitting, and verify tree shaking.',
    });
  }

  if (addedDuration > durationDelta * 0.3 && addedInB.length > 5) {
    hints.push({
      id: next(), title: 'More requests are contributing to the regression',
      severity: 'warning', category: 'root-cause',
      description: `HAR B has ${addedInB.length} new requests that took ${formatDuration(addedDuration)} combined. The slowdown is partly due to additional request volume.`,
      evidence: `New request count: ${addedInB.length}, total time: ${formatDuration(addedDuration)}.`,
      affectedUrls: [], affectedDomains: [],
      whyItMatters: 'More requests means more network round-trips, more contention, and longer total load.',
      possibleNextStep: 'Review whether all new requests are necessary for the initial page load.',
    });
  }

  if (regCountHeavy <= 3 && regCountHeavy > 0 && regCountLight < 5) {
    hints.push({
      id: next(), title: 'A few critical requests caused most of the regression',
      severity: 'info', category: 'root-cause',
      description: `Only ${regCountHeavy} request(s) regressed by >500ms. The slowdown is concentrated rather than spread across all requests.`,
      evidence: `${regCountHeavy} heavy regression(s), ${regCountLight} moderate regression(s).`,
      affectedUrls: matched.filter((m) => m.timingDelta.totalMs > 500).map((m) => m.entryB.url),
      affectedDomains: [],
      whyItMatters: 'Concentrated regressions are usually easier to fix because the root cause is localized.',
      possibleNextStep: 'Focus investigation on the specific regressed requests.',
    });
  } else if (regCountLight > 10) {
    hints.push({
      id: next(), title: 'Many requests became slightly slower',
      severity: 'info', category: 'root-cause',
      description: `${regCountLight} requests each regressed by 100-500ms. The slowdown is spread across many requests rather than concentrated in a few.`,
      evidence: `${regCountLight} requests with moderate regression, ${regCountHeavy} with heavy regression.`,
      affectedUrls: [], affectedDomains: [],
      whyItMatters: 'Distributed regressions often indicate infrastructure-level issues (CDN, server capacity, network).',
      possibleNextStep: 'Look at whether a specific domain or CDN region is consistently slower.',
    });
  }

  const regressedDomains = domainChanges.filter((d) => d.status === 'changed' && d.durationDelta > 1000);
  if (regressedDomains.length === 1) {
    const d = regressedDomains[0];
    hints.push({
      id: next(), title: `One domain is responsible: ${d.domain}`,
      severity: 'warning', category: 'root-cause',
      description: `The domain "${d.domain}" regressed by ${formatDuration(d.durationDelta)} while other domains remained stable.`,
      evidence: `Duration change for ${d.domain}: +${formatDuration(d.durationDelta)}.`,
      affectedUrls: [], affectedDomains: [d.domain],
      whyItMatters: 'When one domain stands out, the root cause is usually specific to that service.',
      possibleNextStep: `Investigate the service at ${d.domain} for recent changes or degradation.`,
    });
  }

  return hints;
}

// ─────────────────────────────────────────────────────────────────
// Human Summary
// ─────────────────────────────────────────────────────────────────

function generateHumanSummary(
  summaryA: AnalysisSummary,
  summaryB: AnalysisSummary,
  matched: MatchedRequest[],
  addedInB: ParsedEntry[],
  removedFromA: ParsedEntry[],
  topRegressions: MatchedRequest[],
  domainChanges: DomainDiff[],
  rootCauses: DiffInsight[],
): string[] {
  const lines: string[] = [];
  const dDur = summaryB.totalDuration - summaryA.totalDuration;
  const dPct = summaryA.totalDuration > 0 ? (dDur / summaryA.totalDuration) * 100 : 0;

  if (dDur > 500) {
    lines.push(
      `HAR B is slower by ${formatDuration(dDur)} (${Math.abs(Math.round(dPct))}% increase in total duration).`,
    );
  } else if (dDur < -500) {
    lines.push(
      `HAR B is faster by ${formatDuration(Math.abs(dDur))} (${Math.abs(Math.round(dPct))}% decrease).`,
    );
  } else {
    lines.push('Both HARs have similar total load duration.');
  }

  // Where time changed
  if (topRegressions.length > 0) {
    const topUrl = shortenUrl(topRegressions[0].entryB.url, 50);
    lines.push(
      `The biggest single regression is ${topUrl}, which took ${formatDuration(topRegressions[0].timingDelta.totalMs)} longer.`,
    );
  }

  // Request count change
  const dReqs = summaryB.totalRequests - summaryA.totalRequests;
  if (Math.abs(dReqs) > 3) {
    lines.push(
      dReqs > 0
        ? `HAR B makes ${dReqs} more request(s), which adds to the total load.`
        : `HAR B makes ${Math.abs(dReqs)} fewer request(s).`,
    );
  }

  // Size change
  const dSize = summaryB.totalTransferSize - summaryA.totalTransferSize;
  if (Math.abs(dSize) > 50_000) {
    lines.push(
      dSize > 0
        ? `${formatBytes(dSize)} more data is transferred in HAR B.`
        : `${formatBytes(Math.abs(dSize))} less data is transferred in HAR B.`,
    );
  }

  // DNS/connect similarity check
  const totalDNSDelta = matched.reduce((s, m) => s + m.timingDelta.phases.dns, 0);
  const totalConnDelta = matched.reduce((s, m) => s + m.timingDelta.phases.connect, 0);
  if (Math.abs(totalDNSDelta) < 100 && Math.abs(totalConnDelta) < 200 && dDur > 500) {
    lines.push(
      'DNS and connection times are similar between both HARs, so the slowdown is not related to network setup.',
    );
  }

  // Root cause summary
  if (rootCauses.length > 0) {
    lines.push(rootCauses[0].description);
  }

  // Added/removed
  if (addedInB.length > 0) {
    const newTP = addedInB.filter((e) => e.isThirdParty);
    if (newTP.length > 3) {
      lines.push(`${newTP.length} new third-party requests appeared in HAR B.`);
    }
  }

  // Concentration
  const regressedCount = matched.filter((m) => m.timingDelta.totalMs > 200).length;
  if (regressedCount > 0 && regressedCount <= 5 && matched.length > 20) {
    lines.push(
      'Most of the regression comes from a few requests rather than all requests becoming slower.',
    );
  }

  return lines;
}
