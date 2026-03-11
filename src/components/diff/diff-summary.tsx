'use client';

import { useState } from 'react';
import type { HarDiffResult, DiffMetric, DiffInsight } from '@/types/diff';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { formatBytes, formatDuration, cn } from '@/lib/utils';

interface Props {
  diff: HarDiffResult;
}

export function DiffSummary({ diff }: Props) {
  const dDur = diff.summaryB.totalDuration - diff.summaryA.totalDuration;
  const isSlower = dDur > 500;
  const isFaster = dDur < -500;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Hero: What Changed ── */}
      <HeroBanner diff={diff} dDur={dDur} isSlower={isSlower} isFaster={isFaster} />

      {/* ── Comparison Overview Cards ── */}
      <MetricCards metrics={diff.metrics} />

      {/* ── Root Cause Hints ── */}
      {diff.rootCauseHints.length > 0 && (
        <Card>
          <CardHeader
            title="Probable Cause"
            subtitle="What likely explains the difference between these two runs"
            icon={<span className="text-sm">🎯</span>}
          />
          <div className="space-y-3">
            {diff.rootCauseHints.map((hint) => (
              <RootCauseCard key={hint.id} hint={hint} />
            ))}
          </div>
        </Card>
      )}

      {/* ── Timing Phase Comparison ── */}
      <TimingPhaseTable diff={diff} />

      {/* ── Key Insights ── */}
      {diff.insights.length > 0 && (
        <Card>
          <CardHeader
            title="Key Findings"
            subtitle={`${diff.insights.length} difference(s) detected between the two HARs`}
            icon={<span className="text-sm">🔎</span>}
          />
          <div className="space-y-2">
            {diff.insights.slice(0, 8).map((insight) => (
              <InsightRow key={insight.id} insight={insight} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Hero Banner ───

function HeroBanner({ diff, dDur, isSlower, isFaster }: {
  diff: HarDiffResult; dDur: number; isSlower: boolean; isFaster: boolean;
}) {
  const bgColor = isSlower ? 'bg-red-50' : isFaster ? 'bg-emerald-50' : 'bg-gray-50';
  const ringColor = isSlower ? 'ring-red-200' : isFaster ? 'ring-emerald-200' : 'ring-gray-200';
  const textColor = isSlower ? 'text-red-700' : isFaster ? 'text-emerald-700' : 'text-gray-700';
  const emoji = isSlower ? '🔴' : isFaster ? '🟢' : '🟡';
  const verdict = isSlower ? 'Slower' : isFaster ? 'Faster' : 'Similar';

  return (
    <div className={`relative rounded-2xl ${bgColor} ring-1 ${ringColor} overflow-hidden`}>
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }}
      />
      <div className="relative px-8 py-10">
        <div className="text-center mb-6">
          <div className={`inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full ${bgColor} ring-1 ${ringColor} mb-5`}>
            <span className="text-lg">{emoji}</span>
            <span className={`text-sm font-semibold ${textColor}`}>
              HAR B is {verdict}{dDur !== 0 ? ` by ${formatDuration(Math.abs(dDur))}` : ''}
            </span>
          </div>
        </div>

        <div className="max-w-2xl mx-auto space-y-2">
          {diff.humanSummary.map((line, i) => (
            <p key={i} className="text-[14px] text-gray-700 leading-relaxed text-center text-balance">
              {line}
            </p>
          ))}
        </div>

        {/* A vs B mini stats */}
        <div className="flex justify-center gap-6 mt-8">
          <MiniStat label={diff.labelA} value={formatDuration(diff.summaryA.totalDuration)} badge="A" color="emerald" />
          <div className="flex items-center text-gray-300 text-lg font-light">vs</div>
          <MiniStat label={diff.labelB} value={formatDuration(diff.summaryB.totalDuration)} badge="B" color="blue" />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, badge, color }: {
  label: string; value: string; badge: string; color: 'emerald' | 'blue';
}) {
  const badgeClass = color === 'emerald'
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200/60'
    : 'bg-blue-100 text-blue-700 border-blue-200/60';
  return (
    <div className="text-center">
      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass} mb-1`}>
        {badge}
      </span>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5 max-w-[120px] truncate" title={label}>{label}</p>
    </div>
  );
}

// ─── Metric Cards ───

function MetricCards({ metrics }: { metrics: DiffMetric[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {metrics.map((m) => (
        <Tooltip key={m.id} content={`${m.label}: ${formatMetricValue(m.valueA, m.unit)} → ${formatMetricValue(m.valueB, m.unit)}`} side="bottom">
          <div className={cn(
            'relative rounded-xl border p-4 transition-shadow hover:shadow-sm cursor-default',
            m.direction === 'worse' && m.significance !== 'low'
              ? 'ring-1 ring-red-300 bg-red-50'
              : m.direction === 'better' && m.significance !== 'low'
              ? 'ring-1 ring-emerald-300 bg-emerald-50'
              : 'bg-white border-gray-200/80',
          )}>
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs text-gray-500 font-medium">{m.label}</span>
              <span className="text-sm">{m.icon}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-gray-900">
                {formatMetricDelta(m)}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <DirectionArrow direction={m.direction} />
              <span className="text-[11px] text-gray-500">
                {formatMetricValue(m.valueA, m.unit)} → {formatMetricValue(m.valueB, m.unit)}
              </span>
            </div>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

function formatMetricValue(value: number, unit: DiffMetric['unit']): string {
  switch (unit) {
    case 'ms': return formatDuration(value);
    case 'bytes': return formatBytes(value);
    case 'count': return String(Math.round(value));
  }
}

function formatMetricDelta(m: DiffMetric): string {
  const sign = m.delta > 0 ? '+' : '';
  switch (m.unit) {
    case 'ms': return `${sign}${formatDuration(m.delta)}`;
    case 'bytes': return `${sign}${formatBytes(m.delta)}`;
    case 'count': return `${sign}${Math.round(m.delta)}`;
  }
}

function DirectionArrow({ direction }: { direction: string }) {
  if (direction === 'worse') {
    return <span className="text-red-500 text-xs">▲</span>;
  }
  if (direction === 'better') {
    return <span className="text-emerald-500 text-xs">▼</span>;
  }
  return <span className="text-gray-400 text-xs">─</span>;
}

// ─── Root Cause Card ───

function RootCauseCard({ hint }: { hint: DiffInsight }) {
  const [expanded, setExpanded] = useState(false);
  const sev = hint.severity;
  const borderColor = sev === 'critical' ? 'border-red-200' : sev === 'warning' ? 'border-amber-200' : 'border-blue-200';
  const bgColor = sev === 'critical' ? 'bg-red-50' : sev === 'warning' ? 'bg-amber-50' : 'bg-blue-50';
  const dotColor = sev === 'critical' ? 'bg-red-500' : sev === 'warning' ? 'bg-amber-500' : 'bg-blue-400';

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className={`w-full text-left rounded-xl border ${borderColor} ${bgColor} p-4 transition-all hover:shadow-sm`}
    >
      <div className="flex items-start gap-3">
        <span className={`w-2 h-2 rounded-full ${dotColor} mt-1.5 flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">{hint.title}</span>
            <svg className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', expanded && 'rotate-180')}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <p className="text-[13px] text-gray-600 mt-1 leading-relaxed">{hint.description}</p>
          {expanded && (
            <div className="mt-3 space-y-2 animate-fade-in">
              <p className="text-[12px] text-gray-500 leading-relaxed"><strong>Evidence:</strong> {hint.evidence}</p>
              <p className="text-[12px] text-gray-500 leading-relaxed"><strong>Next step:</strong> {hint.possibleNextStep}</p>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Timing Phase Table ───

function TimingPhaseTable({ diff }: { diff: HarDiffResult }) {
  const phases: { key: string; label: string }[] = [
    { key: 'blocked', label: 'Blocked' },
    { key: 'dns', label: 'DNS' },
    { key: 'connect', label: 'Connect' },
    { key: 'ssl', label: 'SSL/TLS' },
    { key: 'wait', label: 'Wait (TTFB)' },
    { key: 'receive', label: 'Receive' },
  ];

  const avgPhase = (entries: typeof diff.matched[0]['entryA'][], phase: string) => {
    if (entries.length === 0) return 0;
    const sum = entries.reduce((s, e) => s + ((e.timings as Record<string, number>)[phase] ?? 0), 0);
    return sum / entries.length;
  };

  const entriesA = diff.matched.map((m) => m.entryA);
  const entriesB = diff.matched.map((m) => m.entryB);

  return (
    <Card>
      <CardHeader
        title="Timing Phase Comparison"
        subtitle={`Average timing per phase across ${diff.matched.length} matched requests`}
        icon={<span className="text-sm">⏱️</span>}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2.5 text-gray-500 font-medium">Phase</th>
              <th className="text-right py-2.5 text-gray-500 font-medium">
                <span className="inline-flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200/60">A</span>
                  Avg
                </span>
              </th>
              <th className="text-right py-2.5 text-gray-500 font-medium">
                <span className="inline-flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200/60">B</span>
                  Avg
                </span>
              </th>
              <th className="text-right py-2.5 text-gray-500 font-medium">Delta</th>
            </tr>
          </thead>
          <tbody>
            {phases.map((p) => {
              const vA = avgPhase(entriesA, p.key);
              const vB = avgPhase(entriesB, p.key);
              const delta = vB - vA;
              const isWorse = delta > 20;
              const isBetter = delta < -20;
              return (
                <tr key={p.key} className="border-b border-gray-50">
                  <td className="py-2.5 font-medium text-gray-700">{p.label}</td>
                  <td className="py-2.5 text-right text-gray-600">{formatDuration(vA)}</td>
                  <td className="py-2.5 text-right text-gray-600">{formatDuration(vB)}</td>
                  <td className={cn(
                    'py-2.5 text-right font-medium',
                    isWorse ? 'text-red-600' : isBetter ? 'text-emerald-600' : 'text-gray-400',
                  )}>
                    {delta > 0 ? '+' : ''}{formatDuration(delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Insight Row ───

function InsightRow({ insight }: { insight: DiffInsight }) {
  const [expanded, setExpanded] = useState(false);
  const sevVariant = insight.severity === 'critical' ? 'failed' : insight.severity === 'warning' ? 'warning' : 'info';

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="w-full text-left rounded-lg border border-gray-100 hover:border-gray-200 p-3 transition-all"
    >
      <div className="flex items-center gap-2">
        <Badge variant={sevVariant} dot>{insight.severity}</Badge>
        <span className="text-[13px] font-medium text-gray-800 flex-1">{insight.title}</span>
        <svg className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', expanded && 'rotate-180')}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1.5 animate-fade-in pl-[60px]">
          <p className="text-[12px] text-gray-600 leading-relaxed">{insight.description}</p>
          <p className="text-[11px] text-gray-500"><strong>Evidence:</strong> {insight.evidence}</p>
          <p className="text-[11px] text-gray-500"><strong>Why it matters:</strong> {insight.whyItMatters}</p>
          <p className="text-[11px] text-brand-600"><strong>Next step:</strong> {insight.possibleNextStep}</p>
        </div>
      )}
    </button>
  );
}
