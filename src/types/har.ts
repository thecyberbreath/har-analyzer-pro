// ── Raw HAR spec types ──

export interface RawHar {
  log: {
    version: string;
    creator: { name: string; version: string };
    pages?: RawPage[];
    entries: RawEntry[];
  };
}

export interface RawPage {
  startedDateTime: string;
  id: string;
  title: string;
  pageTimings: {
    onContentLoad?: number;
    onLoad?: number;
  };
}

export interface RawEntry {
  pageref?: string;
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: RawHeader[];
    queryString: RawQueryParam[];
    postData?: { mimeType: string; text?: string; params?: { name: string; value: string }[] };
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: RawHeader[];
    content: {
      size: number;
      compression?: number;
      mimeType: string;
      text?: string;
    };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, unknown>;
  timings: RawTimings;
  serverIPAddress?: string;
  connection?: string;
  _initiator?: {
    type?: string;
    url?: string;
    lineNumber?: number;
    stack?: { callFrames?: { url: string }[] };
  };
  _priority?: string;
  _resourceType?: string;
}

export interface RawHeader {
  name: string;
  value: string;
}

export interface RawQueryParam {
  name: string;
  value: string;
}

export interface RawTimings {
  blocked: number;
  dns: number;
  connect: number;
  ssl: number;
  send: number;
  wait: number;
  receive: number;
}

// ── Normalized / derived models ──

export type ResourceType =
  | 'document'
  | 'stylesheet'
  | 'script'
  | 'image'
  | 'font'
  | 'xhr'
  | 'fetch'
  | 'media'
  | 'websocket'
  | 'manifest'
  | 'other';

export type RequestTag =
  | 'slow'
  | 'failed'
  | 'render-blocking'
  | 'third-party'
  | 'duplicate'
  | 'redirect'
  | 'large'
  | 'critical'
  | 'api'
  | 'late-loaded'
  | 'polling';

export interface ParsedEntry {
  id: string;
  index: number;
  pageref?: string;

  method: string;
  url: string;
  hostname: string;
  path: string;
  protocol: string;

  resourceType: ResourceType;
  mimeType: string;
  statusCode: number;
  statusText: string;

  requestSize: number;
  responseSize: number;
  transferSize: number;

  startTime: number;
  startedDateTime: string;
  endTime: number;
  totalDuration: number;

  timings: NormalizedTimings;

  isThirdParty: boolean;
  thirdPartyCategory?: string;
  isApi: boolean;
  isFailed: boolean;
  isRedirect: boolean;
  isDuplicate: boolean;
  isSlow: boolean;
  isLarge: boolean;
  isRenderBlocking: boolean;
  renderBlockingReason?: string;

  tags: RequestTag[];

  redirectURL: string;
  queryParams: RawQueryParam[];
  requestHeaders: RawHeader[];
  responseHeaders: RawHeader[];
  serverIP?: string;

  initiatorType?: string;
  initiatorUrl?: string;
  priority?: string;

  // Compression detection
  isCompressed: boolean;
  compressionType?: string;

  // Cache detection
  servedFromCache: boolean;

  flowStageId?: string;
}

export interface NormalizedTimings {
  blocked: number;
  dns: number;
  connect: number;
  ssl: number;
  send: number;
  wait: number;
  receive: number;
  total: number;
}

export interface DomainStats {
  domain: string;
  isThirdParty: boolean;
  thirdPartyCategory?: string;
  requestCount: number;
  totalSize: number;
  totalDuration: number;
  avgDuration: number;
  failedCount: number;
  slowCount: number;
  resourceTypes: Record<ResourceType, number>;
}

// ── Redirect chain ──

export interface RedirectChain {
  id: string;
  steps: RedirectStep[];
  totalDuration: number;
  finalUrl: string;
  initialUrl: string;
}

export interface RedirectStep {
  entryId: string;
  fromUrl: string;
  toUrl: string;
  statusCode: number;
  duration: number;
  reason: string;
}

// ── Flow stages ──

export interface FlowStage {
  id: string;
  order: number;
  name: string;
  description: string;
  startTime: number;
  endTime: number;
  duration: number;
  entryIds: string[];
  significance: 'critical' | 'important' | 'normal' | 'low';
  whyItMatters: string;
  rule: string; // deterministic rule that caused this grouping
}

// ── Critical path ──

export interface CriticalPathNode {
  entryId: string;
  depth: number;
  contribution: number;
  reason: string;
  rule: string;
  dependsOn?: string; // entryId this node depends on
}

// ── Findings / Insights ──

export type Severity = 'critical' | 'warning' | 'info';

export interface BottleneckInsight {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  whyItMatters: string;
  evidence: string;
  involvedEntryIds: string[];
  plainExplanation: string;
  possibleFix: string;
  rule: string; // the deterministic rule that triggered this
  metric?: { name: string; value: number; threshold: number; unit: string };
}

export interface Recommendation {
  id: string;
  title: string;
  priority: number;
  severity: Severity;
  description: string;
  impact: string;
  involvedEntryIds: string[];
  derivedFrom: string; // which finding/rule produced this
}

// ── Beginner summary ──

export interface BeginnerSummary {
  headline: string;
  verdict: 'fast' | 'moderate' | 'slow' | 'broken';
  storyLines: StoryLine[];
  topIssues: { title: string; explanation: string; severity: Severity }[];
  glossary: { term: string; definition: string }[];
}

export interface StoryLine {
  order: number;
  icon: string;
  text: string;
  detail?: string;
  relatedEntryIds: string[];
}

// ── Analysis summary ──

export interface AnalysisSummary {
  totalRequests: number;
  totalTransferSize: number;
  totalDuration: number;
  failedRequests: number;
  redirectCount: number;
  thirdPartyRequests: number;
  uniqueDomains: number;
  slowestRequest: { url: string; duration: number } | null;
  highestTTFB: { url: string; ttfb: number } | null;
  documentUrl: string;
  pageTitle: string;
  resourceBreakdown: Record<ResourceType, { count: number; size: number }>;
  onContentLoad?: number;
  onLoad?: number;
}

// ── Top-level structured output ──

export interface HarAnalysis {
  entries: ParsedEntry[];
  domains: DomainStats[];
  flowStages: FlowStage[];
  bottlenecks: BottleneckInsight[];
  recommendations: Recommendation[];
  criticalPath: CriticalPathNode[];
  redirectChains: RedirectChain[];
  summary: AnalysisSummary;
  story: string[];
  beginnerSummary: BeginnerSummary;
}
