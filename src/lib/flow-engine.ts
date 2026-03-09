import type { ParsedEntry, FlowStage, RedirectChain, RedirectStep } from '@/types/har';

// ─────────────────────────────────────────────────────────────────
// Redirect chain reconstruction
//
// Rule: walk the entries in time order. Starting from any entry
// whose status is 3xx, follow its redirectURL to find the next
// entry. Keep following until a non-redirect is found or the
// chain breaks. Each chain is a linked sequence with provenance.
// ─────────────────────────────────────────────────────────────────

export function reconstructRedirectChains(entries: ParsedEntry[]): RedirectChain[] {
  const chains: RedirectChain[] = [];
  const usedInChain = new Set<string>();
  const sorted = [...entries].sort((a, b) => a.startTime - b.startTime);
  const urlIndex = new Map<string, ParsedEntry[]>();

  for (const e of sorted) {
    const key = normalizeUrlForMatch(e.url);
    if (!urlIndex.has(key)) urlIndex.set(key, []);
    urlIndex.get(key)!.push(e);
  }

  let chainId = 0;

  for (const entry of sorted) {
    if (!entry.isRedirect || usedInChain.has(entry.id)) continue;

    const steps: RedirectStep[] = [];
    let current: ParsedEntry | undefined = entry;

    while (current && current.isRedirect) {
      usedInChain.add(current.id);
      const targetUrl = current.redirectURL;

      steps.push({
        entryId: current.id,
        fromUrl: current.url,
        toUrl: targetUrl || '(unknown)',
        statusCode: current.statusCode,
        duration: current.totalDuration,
        reason: redirectReasonFromStatus(current.statusCode),
      });

      if (!targetUrl) break;

      // Find the next entry that matches the redirect target
      const targetKey = normalizeUrlForMatch(targetUrl);
      const candidates = urlIndex.get(targetKey) ?? [];
      current = candidates.find(
        (c) => !usedInChain.has(c.id) && c.startTime >= (current!.startTime)
      );
    }

    // Include the final non-redirect destination in the chain tracking
    if (current && !current.isRedirect) {
      usedInChain.add(current.id);
    }

    if (steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      chains.push({
        id: `redirect-chain-${chainId++}`,
        steps,
        totalDuration: steps.reduce((s, st) => s + st.duration, 0),
        initialUrl: steps[0].fromUrl,
        finalUrl: current?.url ?? lastStep.toUrl,
      });
    }
  }

  return chains;
}

function normalizeUrlForMatch(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname + u.search;
  } catch {
    return url;
  }
}

function redirectReasonFromStatus(status: number): string {
  switch (status) {
    case 301: return 'Permanent redirect (301) - the resource has moved permanently.';
    case 302: return 'Temporary redirect (302) - the resource is temporarily at another URL.';
    case 303: return 'See Other (303) - the server is redirecting to a different resource.';
    case 307: return 'Temporary redirect (307) - same method must be used for the redirected request.';
    case 308: return 'Permanent redirect (308) - same method must be used for the redirected request.';
    default: return `Redirect (${status}).`;
  }
}

// ─────────────────────────────────────────────────────────────────
// Flow reconstruction
//
// Strategy: assign each entry to exactly one stage using a
// priority-ordered set of rules. Earlier rules take precedence.
// Each rule is documented so the grouping is explainable.
//
// Rule 1: Leading redirects → "Redirect Chain"
// Rule 2: First non-redirect document → "Initial Document Request"
// Rule 3: Stylesheets that started before the document finished → "Critical CSS"
// Rule 4: Scripts that started before document end + 200ms, are first-party,
//         and are not low-priority → "Critical JavaScript"
// Rule 5: All fonts → "Font Loading"
// Rule 6: First-party API/XHR/fetch requests → "API / Data Requests"
// Rule 7: First-party images → "Image Loading"
// Rule 8: Third-party scripts → "Third-Party Scripts"
// Rule 9: Remaining third-party → "Other Third-Party Requests"
// Rule 10: Anything left → "Late / Post-Load Activity"
//
// After assignment, detect timing gaps > 200ms between stages
// and annotate them.
// ─────────────────────────────────────────────────────────────────

export function reconstructFlow(entries: ParsedEntry[]): FlowStage[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => a.startTime - b.startTime);
  const assigned = new Set<string>();
  const stages: FlowStage[] = [];
  let order = 0;

  // Compute the document's end time for use in "early" thresholds.
  // This is more reliable than percentage-based thresholds because it
  // ties the cutoff to actual document completion.
  const docEntry = sorted.find((e) => e.resourceType === 'document' && !e.isRedirect);
  const docEndTime = docEntry ? docEntry.startTime + docEntry.totalDuration : 0;

  // ── Rule 1: Leading redirects ──
  const redirects: ParsedEntry[] = [];
  for (const e of sorted) {
    if (assigned.has(e.id)) continue;
    if (!e.isRedirect) break;
    redirects.push(e);
    assigned.add(e.id);
  }
  if (redirects.length > 0) {
    stages.push(makeStage({
      order: order++,
      id: 'redirect-chain',
      name: 'Redirect Chain',
      description: `The browser followed ${redirects.length} redirect(s) before reaching the final page.`,
      entries: redirects,
      significance: 'important',
      whyItMatters: 'Each redirect is a full network round-trip that delays everything else.',
      rule: `Rule 1: Consecutive redirects at the start of the waterfall (${redirects.length} entries with 3xx status).`,
    }));
  }

  // ── Rule 2: Initial document ──
  const documents: ParsedEntry[] = [];
  for (const e of sorted) {
    if (assigned.has(e.id)) continue;
    if (e.resourceType === 'document') {
      documents.push(e);
      assigned.add(e.id);
      if (documents.length >= 3) break;
    }
  }
  if (documents.length > 0) {
    stages.push(makeStage({
      order: order++,
      id: 'initial-document',
      name: 'Initial Document Request',
      description: `The browser requested the main HTML document${documents.length > 1 ? ` and ${documents.length - 1} sub-document(s)` : ''}.`,
      entries: documents,
      significance: 'critical',
      whyItMatters: 'The HTML document is the starting point. The browser cannot begin loading CSS, JS, or images until it receives the HTML.',
      rule: `Rule 2: First ${documents.length} entry/entries with resourceType=document.`,
    }));
  }

  // ── Rule 3: Critical CSS ──
  // Stylesheets starting before the document finished downloading
  // are almost certainly in <head> and render-blocking.
  const criticalCSSCutoff = docEndTime + 100;
  const criticalCSS = collectWhere(sorted, assigned, (e) =>
    e.resourceType === 'stylesheet' && !e.isThirdParty && e.startTime <= criticalCSSCutoff
  );
  if (criticalCSS.length > 0) {
    stages.push(makeStage({
      order: order++,
      id: 'critical-css',
      name: 'Critical CSS Loading',
      description: `${criticalCSS.length} stylesheet(s) that the browser found in the HTML and immediately started downloading.`,
      entries: criticalCSS,
      significance: 'critical',
      whyItMatters: 'CSS blocks rendering - the browser will not paint any pixels until these stylesheets are fully loaded and parsed.',
      rule: `Rule 3: First-party stylesheets with startTime ≤ ${Math.round(criticalCSSCutoff)}ms (document end time + 100ms buffer).`,
    }));
  }

  // ── Rule 4: Critical JS ──
  const criticalJSCutoff = docEndTime + 200;
  const criticalJS = collectWhere(sorted, assigned, (e) =>
    e.resourceType === 'script' && !e.isThirdParty && e.startTime <= criticalJSCutoff
  );
  if (criticalJS.length > 0) {
    stages.push(makeStage({
      order: order++,
      id: 'critical-js',
      name: 'Critical JavaScript Loading',
      description: `${criticalJS.length} JavaScript file(s) loaded early - these likely block rendering or are needed for the app to start.`,
      entries: criticalJS,
      significance: 'critical',
      whyItMatters: 'Early JavaScript typically blocks rendering or bootstraps the application. Large bundles directly delay interactivity.',
      rule: `Rule 4: First-party scripts with startTime ≤ ${Math.round(criticalJSCutoff)}ms (document end time + 200ms buffer).`,
    }));
  }

  // ── Rule 5: Fonts ──
  const fonts = collectWhere(sorted, assigned, (e) => e.resourceType === 'font');
  if (fonts.length > 0) {
    stages.push(makeStage({
      order: order++,
      id: 'font-loading',
      name: 'Font Loading',
      description: `${fonts.length} web font(s) were downloaded.`,
      entries: fonts,
      significance: 'normal',
      whyItMatters: 'Web fonts can cause invisible text (FOIT) or unstyled text (FOUT) until they finish loading.',
      rule: 'Rule 5: All entries with resourceType=font.',
    }));
  }

  // ── Rule 6: First-party API calls ──
  const firstPartyApis = collectWhere(sorted, assigned, (e) => e.isApi && !e.isThirdParty);
  if (firstPartyApis.length > 0) {
    const earliestApi = Math.min(...firstPartyApis.map((e) => e.startTime));
    const triggerNote = earliestApi > docEndTime + 500
      ? ' These started well after the document loaded, likely triggered by JavaScript.'
      : '';
    stages.push(makeStage({
      order: order++,
      id: 'api-calls',
      name: 'API / Data Requests',
      description: `${firstPartyApis.length} API call(s) to fetch data for the application.${triggerNote}`,
      entries: firstPartyApis,
      significance: 'important',
      whyItMatters: 'These requests fetch the actual data users want to see. Slow APIs directly delay visible content.',
      rule: 'Rule 6: First-party entries classified as API (isApi=true, isThirdParty=false).',
    }));
  }

  // ── Rule 7: First-party images ──
  const images = collectWhere(sorted, assigned, (e) => e.resourceType === 'image' && !e.isThirdParty);
  if (images.length > 0) {
    stages.push(makeStage({
      order: order++,
      id: 'images',
      name: 'Image Loading',
      description: `${images.length} image(s) from the same origin.`,
      entries: images,
      significance: 'normal',
      whyItMatters: 'Images are often the largest assets by bytes. Unoptimized images significantly increase page weight.',
      rule: 'Rule 7: First-party entries with resourceType=image.',
    }));
  }

  // ── Rule 8: Third-party scripts ──
  const tpScripts = collectWhere(sorted, assigned, (e) => e.isThirdParty && e.resourceType === 'script');
  if (tpScripts.length > 0) {
    const domains = new Set(tpScripts.map((e) => e.hostname));
    stages.push(makeStage({
      order: order++,
      id: 'third-party-scripts',
      name: 'Third-Party Scripts',
      description: `${tpScripts.length} script(s) from ${domains.size} external domain(s) (analytics, ads, widgets, etc.).`,
      entries: tpScripts,
      significance: 'important',
      whyItMatters: 'Third-party scripts compete with your own code for bandwidth and CPU time, and you cannot optimize them directly.',
      rule: 'Rule 8: Third-party entries with resourceType=script.',
    }));
  }

  // ── Rule 9: Other third-party ──
  const otherTP = collectWhere(sorted, assigned, (e) => e.isThirdParty);
  if (otherTP.length > 0) {
    stages.push(makeStage({
      order: order++,
      id: 'third-party-other',
      name: 'Other Third-Party Requests',
      description: `${otherTP.length} additional request(s) to external services.`,
      entries: otherTP,
      significance: 'low',
      whyItMatters: 'Many third-party requests can slow the page, especially on slower connections.',
      rule: 'Rule 9: Remaining third-party entries not matched by earlier rules.',
    }));
  }

  // ── Rule 10: Everything remaining ──
  const remaining = collectWhere(sorted, assigned, () => true);
  if (remaining.length > 0) {
    const latestStart = Math.max(...remaining.map((e) => e.startTime));
    const isLate = latestStart > docEndTime * 2;
    stages.push(makeStage({
      order: order++,
      id: 'late-activity',
      name: isLate ? 'Post-Load Activity' : 'Other Requests',
      description: `${remaining.length} request(s) not categorized into the main flow stages.`,
      entries: remaining,
      significance: 'low',
      whyItMatters: isLate
        ? 'These fired well after the initial load and typically do not affect the first user experience.'
        : 'These requests were not critical to the main rendering flow.',
      rule: `Rule 10: All remaining entries (${remaining.length}) not assigned by rules 1-9.`,
    }));
  }

  // ── Tag entries with their stage ──
  for (const stage of stages) {
    for (const eid of stage.entryIds) {
      const entry = entries.find((e) => e.id === eid);
      if (entry) entry.flowStageId = stage.id;
    }
  }

  return stages;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

interface StageInput {
  order: number;
  id: string;
  name: string;
  description: string;
  entries: ParsedEntry[];
  significance: FlowStage['significance'];
  whyItMatters: string;
  rule: string;
}

function makeStage(input: StageInput): FlowStage {
  const startTime = input.entries.length > 0
    ? Math.min(...input.entries.map((e) => e.startTime))
    : 0;
  const endTime = input.entries.length > 0
    ? Math.max(...input.entries.map((e) => e.startTime + e.totalDuration))
    : 0;
  return {
    id: input.id,
    order: input.order,
    name: input.name,
    description: input.description,
    startTime,
    endTime,
    duration: endTime - startTime,
    entryIds: input.entries.map((e) => e.id),
    significance: input.significance,
    whyItMatters: input.whyItMatters,
    rule: input.rule,
  };
}

function collectWhere(
  sorted: ParsedEntry[],
  assigned: Set<string>,
  predicate: (e: ParsedEntry) => boolean
): ParsedEntry[] {
  const result: ParsedEntry[] = [];
  for (const e of sorted) {
    if (assigned.has(e.id)) continue;
    if (predicate(e)) {
      result.push(e);
      assigned.add(e.id);
    }
  }
  return result;
}
