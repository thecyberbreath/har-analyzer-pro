import type {
  ParsedEntry,
  BottleneckInsight,
  Recommendation,
  AnalysisSummary,
  DomainStats,
  Severity,
} from '@/types/har';
import { formatBytes, formatDuration } from './utils';

// ─────────────────────────────────────────────────────────────────
// Recommendation generation
//
// Each recommendation is derived from a specific finding or
// a combination of findings. The `derivedFrom` field traces
// which finding(s) produced it, making the output auditable.
//
// Recommendations are de-duplicated by category and sorted by
// priority (lower number = higher priority).
// ─────────────────────────────────────────────────────────────────

export function generateRecommendations(
  entries: ParsedEntry[],
  insights: BottleneckInsight[],
  summary: AnalysisSummary,
  domains: DomainStats[]
): Recommendation[] {
  const recs: Recommendation[] = [];
  let seq = 0;
  const nextId = () => `rec-${seq++}`;

  // ── Derive recommendations from each finding ──
  // Use a map to avoid duplicate recommendations for the same category
  const byCategory = new Map<string, BottleneckInsight[]>();
  for (const insight of insights) {
    if (!byCategory.has(insight.category)) byCategory.set(insight.category, []);
    byCategory.get(insight.category)!.push(insight);
  }

  // Priority 1: Fix broken requests (derived from "Errors" findings)
  const errorFindings = byCategory.get('Errors') ?? [];
  if (errorFindings.length > 0) {
    const failed = entries.filter((e) => e.isFailed);
    const serverErrors = failed.filter((e) => e.statusCode >= 500);
    recs.push({
      id: nextId(), priority: 1,
      severity: serverErrors.length > 0 ? 'critical' : 'warning',
      title: 'Fix Failed Requests',
      description: `${failed.length} request(s) returned errors. Server errors (5xx) may indicate backend outages. Client errors (4xx) point to missing assets or broken URLs.`,
      impact: 'Eliminates broken features and prevents wasted network round-trips.',
      involvedEntryIds: failed.map((e) => e.id),
      derivedFrom: errorFindings.map((f) => f.id).join(', '),
    });
  }

  // Priority 2: Reduce render-blocking resources (derived from "Rendering" findings)
  const renderFindings = byCategory.get('Rendering') ?? [];
  if (renderFindings.length > 0) {
    const blocking = entries.filter((e) => e.isRenderBlocking);
    if (blocking.length > 0) {
      const lastEnd = Math.max(...blocking.map((e) => e.endTime));
      recs.push({
        id: nextId(), priority: 2, severity: blocking.length > 5 ? 'critical' : 'warning',
        title: 'Reduce Render-Blocking Resources',
        description: `${blocking.length} resources block the first paint until ${formatDuration(lastEnd)}. Inline critical CSS, defer non-critical JS with async/defer, and preload key resources.`,
        impact: `First paint could potentially start ${formatDuration(lastEnd - Math.min(...blocking.map((e) => e.startTime)))} earlier.`,
        involvedEntryIds: blocking.map((e) => e.id),
        derivedFrom: renderFindings.map((f) => f.id).join(', '),
      });
    }
  }

  // Priority 3: Speed up server responses (derived from "Server" findings)
  const serverFindings = byCategory.get('Server') ?? [];
  if (serverFindings.length > 0) {
    const slowEntries = entries.filter((e) => e.timings.wait > 800);
    if (slowEntries.length > 0) {
      const totalExcess = slowEntries.reduce((s, e) => s + Math.max(e.timings.wait - 200, 0), 0);
      recs.push({
        id: nextId(), priority: 3,
        severity: slowEntries.some((e) => e.timings.wait > 3000) ? 'critical' : 'warning',
        title: 'Improve Server Response Times',
        description: `${slowEntries.length} request(s) have TTFB over 800ms. Optimize backend queries, add caching, or deploy a CDN.`,
        impact: `Could recover up to ${formatDuration(totalExcess)} of server wait time.`,
        involvedEntryIds: slowEntries.map((e) => e.id),
        derivedFrom: serverFindings.map((f) => f.id).join(', '),
      });
    }
  }

  // Priority 4: Reduce JavaScript payload (derived from "Performance" findings for JS)
  const jsFindings = insights.filter((f) => f.title.includes('JavaScript'));
  if (jsFindings.length > 0) {
    const bigJS = entries.filter((e) => e.resourceType === 'script' && e.responseSize > 200_000);
    if (bigJS.length > 0) {
      const totalSize = bigJS.reduce((s, e) => s + e.responseSize, 0);
      recs.push({
        id: nextId(), priority: 4,
        severity: totalSize > 1_000_000 ? 'critical' : 'warning',
        title: 'Reduce JavaScript Size',
        description: `${bigJS.length} large JS file(s) totaling ${formatBytes(totalSize)}. Code-split, tree-shake, and lazy-load non-essential modules.`,
        impact: 'Faster download + parse + execute = faster time to interactive.',
        involvedEntryIds: bigJS.map((e) => e.id),
        derivedFrom: jsFindings.map((f) => f.id).join(', '),
      });
    }
  }

  // Priority 5: Enable compression (derived from compression findings)
  const compressionFindings = insights.filter((f) => f.title.includes('Uncompressed'));
  if (compressionFindings.length > 0) {
    const uncompressed = entries.filter(
      (e) => !e.isCompressed && !e.servedFromCache && e.responseSize > 1000 &&
      ['document', 'script', 'stylesheet'].includes(e.resourceType)
    );
    if (uncompressed.length > 0) {
      const totalSize = uncompressed.reduce((s, e) => s + e.responseSize, 0);
      recs.push({
        id: nextId(), priority: 5, severity: 'warning',
        title: 'Enable Text Compression',
        description: `${uncompressed.length} text resource(s) (${formatBytes(totalSize)}) are served without compression.`,
        impact: `gzip/brotli typically reduces text size by 60-80%, saving approximately ${formatBytes(totalSize * 0.7)}.`,
        involvedEntryIds: uncompressed.map((e) => e.id),
        derivedFrom: compressionFindings.map((f) => f.id).join(', '),
      });
    }
  }

  // Priority 6: Optimize images (derived from "Assets" findings)
  const imageFindings = byCategory.get('Assets') ?? [];
  if (imageFindings.length > 0) {
    const bigImages = entries.filter((e) => e.resourceType === 'image' && e.responseSize > 300_000);
    if (bigImages.length > 0) {
      const totalSize = bigImages.reduce((s, e) => s + e.responseSize, 0);
      recs.push({
        id: nextId(), priority: 6,
        severity: totalSize > 3_000_000 ? 'critical' : 'warning',
        title: 'Optimize Images',
        description: `${bigImages.length} image(s) totaling ${formatBytes(totalSize)}. Convert to WebP/AVIF, resize to display dimensions, and lazy-load below-fold images.`,
        impact: `Could save approximately ${formatBytes(totalSize * 0.6)} with modern formats and proper sizing.`,
        involvedEntryIds: bigImages.map((e) => e.id),
        derivedFrom: imageFindings.map((f) => f.id).join(', '),
      });
    }
  }

  // Priority 7: Parallelize API calls (derived from serial chain findings)
  const serialFindings = insights.filter((f) => f.title.includes('Serial API'));
  if (serialFindings.length > 0) {
    recs.push({
      id: nextId(), priority: 7, severity: 'warning',
      title: 'Parallelize API Calls',
      description: 'Sequential API calls multiply wait times. Fetch independent data in parallel using Promise.all() or similar.',
      impact: 'Total API wait time could approach the duration of the single slowest call instead of the sum of all.',
      involvedEntryIds: serialFindings.flatMap((f) => f.involvedEntryIds),
      derivedFrom: serialFindings.map((f) => f.id).join(', '),
    });
  }

  // Priority 8: Reduce third-party impact (derived from "Third-Party" findings)
  const tpFindings = byCategory.get('Third-Party') ?? [];
  if (tpFindings.length > 0) {
    const tpDomains = domains.filter((d) => d.isThirdParty);
    const tpEntries = entries.filter((e) => e.isThirdParty);
    recs.push({
      id: nextId(), priority: 8,
      severity: tpDomains.length > 10 ? 'warning' : 'info',
      title: 'Audit Third-Party Scripts',
      description: `${tpEntries.length} requests to ${tpDomains.length} external domains. Review each for necessity, defer non-critical, and self-host what you can.`,
      impact: 'Fewer domains = fewer DNS lookups + connections = faster initial load.',
      involvedEntryIds: tpEntries.map((e) => e.id),
      derivedFrom: tpFindings.map((f) => f.id).join(', '),
    });
  }

  // Priority 9: Eliminate redirects (derived from redirect chain findings)
  const redirectFindings = insights.filter((f) => f.title.includes('Redirect Chain'));
  if (redirectFindings.length > 0) {
    const redirectEntries = entries.filter((e) => e.isRedirect);
    const totalRedirectTime = redirectEntries.reduce((s, e) => s + e.totalDuration, 0);
    recs.push({
      id: nextId(), priority: 9, severity: 'warning',
      title: 'Eliminate Redirect Chains',
      description: `${redirectEntries.length} redirect(s) detected. Each adds a full network round-trip. Link directly to the final destination URL.`,
      impact: `Could save ${formatDuration(totalRedirectTime)} in redirect latency.`,
      involvedEntryIds: redirectEntries.map((e) => e.id),
      derivedFrom: redirectFindings.map((f) => f.id).join(', '),
    });
  }

  // Priority 10: Deduplicate requests (derived from "Efficiency" findings)
  const dupeFindings = insights.filter((f) => f.title === 'Duplicate Requests');
  if (dupeFindings.length > 0) {
    recs.push({
      id: nextId(), priority: 10, severity: 'info',
      title: 'Deduplicate Requests',
      description: 'Multiple requests to the same URL detected. Add caching headers, use a request deduplication layer, or fix application-level double-fetching.',
      impact: 'Eliminates wasted bandwidth and reduces server load.',
      involvedEntryIds: dupeFindings.flatMap((f) => f.involvedEntryIds),
      derivedFrom: dupeFindings.map((f) => f.id).join(', '),
    });
  }

  // Priority 11: Add resource hints (derived from "Network" findings)
  const networkFindings = byCategory.get('Network') ?? [];
  if (networkFindings.length > 0) {
    const slowConnections = entries.filter((e) => (e.timings.dns + e.timings.connect) > 200 && e.isThirdParty);
    if (slowConnections.length > 0) {
      const uniqueHosts = [...new Set(slowConnections.map((e) => e.hostname))];
      recs.push({
        id: nextId(), priority: 11, severity: 'info',
        title: 'Add Resource Hints (preconnect / dns-prefetch)',
        description: `Add <link rel="preconnect"> for: ${uniqueHosts.slice(0, 4).join(', ')}${uniqueHosts.length > 4 ? ` and ${uniqueHosts.length - 4} more` : ''}.`,
        impact: `Could save up to ${formatDuration(slowConnections.reduce((s, e) => s + e.timings.dns + e.timings.connect, 0))} in connection setup time.`,
        involvedEntryIds: slowConnections.map((e) => e.id),
        derivedFrom: networkFindings.map((f) => f.id).join(', '),
      });
    }
  }

  // Priority 12: Overall page weight
  if (summary.totalTransferSize > 5_000_000) {
    recs.push({
      id: nextId(), priority: 12, severity: 'warning',
      title: 'Reduce Total Page Weight',
      description: `Total transfer size is ${formatBytes(summary.totalTransferSize)}. Review the largest assets and eliminate unnecessary downloads.`,
      impact: 'Faster load on all connections, especially mobile and throttled networks.',
      involvedEntryIds: [],
      derivedFrom: 'Derived from summary.totalTransferSize > 5MB.',
    });
  }

  // Priority 13: Prefetch late-discovered data
  const lateFindings = insights.filter((f) => f.title.includes('Late-Loaded'));
  if (lateFindings.length > 0) {
    recs.push({
      id: nextId(), priority: 13, severity: 'info',
      title: 'Prefetch Critical Data',
      description: 'API calls that start late in the waterfall suggest the browser doesn\'t discover them until JS executes. Prefetch this data or use SSR to inline it.',
      impact: 'Data arrives sooner, reducing time to meaningful content.',
      involvedEntryIds: lateFindings.flatMap((f) => f.involvedEntryIds),
      derivedFrom: lateFindings.map((f) => f.id).join(', '),
    });
  }

  return recs.sort((a, b) => a.priority - b.priority);
}
