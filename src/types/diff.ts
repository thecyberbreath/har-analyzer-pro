import type { ParsedEntry, FlowStage, DomainStats, AnalysisSummary, NormalizedTimings } from './har';

export type MatchConfidence = 'exact' | 'high' | 'medium' | 'low';
export type ChangeDirection = 'better' | 'worse' | 'neutral';

export interface TimingDelta {
  totalMs: number;
  totalPct: number;
  phases: Record<keyof NormalizedTimings, number>;
  direction: ChangeDirection;
  biggestPhase: string;
  biggestPhaseMs: number;
}

export interface SizeDelta {
  bytes: number;
  pct: number;
  direction: ChangeDirection;
}

export interface MatchedRequest {
  entryA: ParsedEntry;
  entryB: ParsedEntry;
  confidence: MatchConfidence;
  matchReason: string;
  timingDelta: TimingDelta;
  sizeDelta: SizeDelta;
  statusChanged: boolean;
}

export interface DiffMetric {
  id: string;
  label: string;
  valueA: number;
  valueB: number;
  delta: number;
  deltaPct: number;
  direction: ChangeDirection;
  unit: 'ms' | 'bytes' | 'count';
  icon: string;
  significance: 'high' | 'medium' | 'low';
}

export interface DiffStageSummary {
  stageId: string;
  stageName: string;
  stageA: FlowStage | null;
  stageB: FlowStage | null;
  durationDelta: number;
  durationDeltaPct: number;
  requestCountDelta: number;
  status: 'new' | 'removed' | 'changed' | 'unchanged';
  direction: ChangeDirection;
  description: string;
}

export type DiffInsightCategory =
  | 'timing-regression'
  | 'timing-improvement'
  | 'asset-regression'
  | 'asset-improvement'
  | 'flow-regression'
  | 'new-requests'
  | 'removed-requests'
  | 'root-cause';

export interface DiffInsight {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  category: DiffInsightCategory;
  description: string;
  evidence: string;
  affectedUrls: string[];
  affectedDomains: string[];
  whyItMatters: string;
  possibleNextStep: string;
}

export interface DomainDiff {
  domain: string;
  isThirdParty: boolean;
  statsA: DomainStats | null;
  statsB: DomainStats | null;
  requestCountDelta: number;
  sizeDelta: number;
  durationDelta: number;
  status: 'new' | 'removed' | 'changed';
  direction: ChangeDirection;
}

export interface HarDiffResult {
  labelA: string;
  labelB: string;

  summaryA: AnalysisSummary;
  summaryB: AnalysisSummary;

  metrics: DiffMetric[];

  matched: MatchedRequest[];
  addedInB: ParsedEntry[];
  removedFromA: ParsedEntry[];

  topRegressions: MatchedRequest[];
  topImprovements: MatchedRequest[];

  stageComparison: DiffStageSummary[];

  insights: DiffInsight[];
  rootCauseHints: DiffInsight[];

  humanSummary: string[];

  domainChanges: DomainDiff[];
}
