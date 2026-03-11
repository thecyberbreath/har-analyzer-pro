'use client';

import { useState } from 'react';
import type { HarDiffResult, MatchedRequest, MatchConfidence } from '@/types/diff';
import type { ParsedEntry } from '@/types/har';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatBytes, formatDuration, shortenUrl, cn, getTimingColor } from '@/lib/utils';

interface Props {
  diff: HarDiffResult;
  mode: 'regressions' | 'added-removed';
}

export function DiffDetails({ diff, mode }: Props) {
  if (mode === 'regressions') {
    return <RegressionsView diff={diff} />;
  }
  return <AddedRemovedView diff={diff} />;
}

// ─── Regressions / Improvements ───

function RegressionsView({ diff }: { diff: HarDiffResult }) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Regressions */}
      {diff.topRegressions.length > 0 ? (
        <Card>
          <CardHeader
            title="Top Regressions"
            subtitle="Requests that became significantly slower in HAR B"
            icon={<span className="text-sm">📉</span>}
          />
          <div className="space-y-2">
            {diff.topRegressions.map((m, i) => (
              <MatchedRequestRow key={i} match={m} type="regression" />
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader title="No Significant Regressions" icon={<span className="text-sm">✅</span>} />
          <p className="text-[13px] text-gray-500">No matched requests became significantly slower.</p>
        </Card>
      )}

      {/* Top Improvements */}
      {diff.topImprovements.length > 0 && (
        <Card>
          <CardHeader
            title="Top Improvements"
            subtitle="Requests that became faster in HAR B"
            icon={<span className="text-sm">📈</span>}
          />
          <div className="space-y-2">
            {diff.topImprovements.map((m, i) => (
              <MatchedRequestRow key={i} match={m} type="improvement" />
            ))}
          </div>
        </Card>
      )}

      {/* Domain Changes */}
      {diff.domainChanges.filter((d) => d.status === 'changed' && Math.abs(d.durationDelta) > 200).length > 0 && (
        <Card>
          <CardHeader
            title="Domain-Level Changes"
            subtitle="How total time per domain shifted"
            icon={<span className="text-sm">🌐</span>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 text-gray-500 font-medium">Domain</th>
                  <th className="text-right py-2.5 text-gray-500 font-medium">Requests</th>
                  <th className="text-right py-2.5 text-gray-500 font-medium">Duration Delta</th>
                  <th className="text-right py-2.5 text-gray-500 font-medium">Size Delta</th>
                </tr>
              </thead>
              <tbody>
                {diff.domainChanges
                  .filter((d) => d.status === 'changed' && Math.abs(d.durationDelta) > 200)
                  .map((d) => (
                    <tr key={d.domain} className="border-b border-gray-50">
                      <td className="py-2.5 text-gray-700 font-medium">
                        <div className="flex items-center gap-2">
                          {d.domain}
                          {d.isThirdParty && <Badge variant="third-party">3P</Badge>}
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-gray-600">
                        {d.requestCountDelta > 0 ? '+' : ''}{d.requestCountDelta}
                      </td>
                      <td className={cn(
                        'py-2.5 text-right font-medium',
                        d.direction === 'worse' ? 'text-red-600' : d.direction === 'better' ? 'text-emerald-600' : 'text-gray-500',
                      )}>
                        {d.durationDelta > 0 ? '+' : ''}{formatDuration(d.durationDelta)}
                      </td>
                      <td className="py-2.5 text-right text-gray-600">
                        {d.sizeDelta > 0 ? '+' : ''}{formatBytes(d.sizeDelta)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function MatchedRequestRow({ match, type }: { match: MatchedRequest; type: 'regression' | 'improvement' }) {
  const [expanded, setExpanded] = useState(false);
  const isRegression = type === 'regression';
  const delta = match.timingDelta;
  const size = match.sizeDelta;

  const borderColor = isRegression ? 'border-l-red-400' : 'border-l-emerald-400';
  const deltaColor = isRegression ? 'text-red-600' : 'text-emerald-600';

  return (
    <div className={`rounded-lg border border-gray-100 border-l-4 ${borderColor} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={match.entryB.resourceType === 'script' ? 'warning' : match.entryB.resourceType === 'stylesheet' ? 'render-blocking' : 'default'}>
                {match.entryB.resourceType}
              </Badge>
              <ConfidenceBadge confidence={match.confidence} />
              {match.statusChanged && <Badge variant="failed" dot>Status changed</Badge>}
            </div>
            <p className="text-[13px] text-gray-700 mt-1 truncate" title={match.entryB.url}>
              {shortenUrl(match.entryB.url, 70)}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className={cn('text-[14px] font-bold', deltaColor)}>
              {delta.totalMs > 0 ? '+' : ''}{formatDuration(delta.totalMs)}
            </span>
            <svg className={cn('w-4 h-4 text-gray-400 transition-transform', expanded && 'rotate-180')}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50/30 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Timing comparison */}
            <div>
              <h5 className="text-[12px] font-semibold text-gray-700 mb-2">Timing Breakdown</h5>
              <div className="space-y-1.5">
                {(['blocked', 'dns', 'connect', 'ssl', 'wait', 'receive'] as const).map((phase) => {
                  const vA = match.entryA.timings[phase];
                  const vB = match.entryB.timings[phase];
                  const d = vB - vA;
                  if (vA === 0 && vB === 0) return null;
                  return (
                    <div key={phase} className="flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getTimingColor(phase) }} />
                        <span className="text-gray-600 capitalize">{phase === 'wait' ? 'Wait (TTFB)' : phase}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-gray-500">{formatDuration(vA)} → {formatDuration(vB)}</span>
                        <span className={cn(
                          'font-medium w-16 text-right',
                          d > 20 ? 'text-red-600' : d < -20 ? 'text-emerald-600' : 'text-gray-400',
                        )}>
                          {d > 0 ? '+' : ''}{formatDuration(d)}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Size & meta */}
            <div>
              <h5 className="text-[12px] font-semibold text-gray-700 mb-2">Details</h5>
              <div className="space-y-1 text-[12px] text-gray-600">
                <div className="flex justify-between">
                  <span>Total duration</span>
                  <span>{formatDuration(match.entryA.totalDuration)} → {formatDuration(match.entryB.totalDuration)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Transfer size</span>
                  <span>
                    {formatBytes(match.entryA.transferSize)} → {formatBytes(match.entryB.transferSize)}
                    {size.bytes !== 0 && (
                      <span className={cn('ml-1', size.direction === 'worse' ? 'text-red-600' : size.direction === 'better' ? 'text-emerald-600' : '')}>
                        ({size.bytes > 0 ? '+' : ''}{formatBytes(size.bytes)})
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Status</span>
                  <span>
                    {match.entryA.statusCode} → {match.entryB.statusCode}
                    {match.statusChanged && <span className="text-red-600 ml-1">Changed!</span>}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Biggest phase change</span>
                  <span className="capitalize">{delta.biggestPhase} ({delta.biggestPhaseMs > 0 ? '+' : ''}{formatDuration(delta.biggestPhaseMs)})</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Match method</span>
                  <span className="text-[11px]">{match.matchReason}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: MatchConfidence }) {
  const styles: Record<MatchConfidence, { variant: string; label: string }> = {
    exact: { variant: 'success', label: 'Exact match' },
    high: { variant: 'info', label: 'High confidence' },
    medium: { variant: 'warning', label: 'Medium confidence' },
    low: { variant: 'default', label: 'Best-effort match' },
  };
  const s = styles[confidence];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

// ─── Added / Removed ───

function AddedRemovedView({ diff }: { diff: HarDiffResult }) {
  const [addedFilter, setAddedFilter] = useState<string>('all');

  const addedByType = groupByType(diff.addedInB);
  const removedByType = groupByType(diff.removedFromA);

  const filteredAdded = addedFilter === 'all'
    ? diff.addedInB
    : diff.addedInB.filter((e) => e.resourceType === addedFilter);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Added Requests */}
      <Card>
        <CardHeader
          title={`Added in HAR B (${diff.addedInB.length})`}
          subtitle="Requests that appear in HAR B but not in HAR A"
          icon={<span className="text-sm">➕</span>}
          action={
            <div className="flex gap-1 flex-wrap">
              <FilterButton label="All" count={diff.addedInB.length} active={addedFilter === 'all'} onClick={() => setAddedFilter('all')} />
              {Object.entries(addedByType).map(([type, entries]) => (
                <FilterButton key={type} label={type} count={entries.length} active={addedFilter === type} onClick={() => setAddedFilter(type)} />
              ))}
            </div>
          }
        />
        {filteredAdded.length === 0 ? (
          <p className="text-[13px] text-gray-500">No added requests{addedFilter !== 'all' ? ` of type "${addedFilter}"` : ''}.</p>
        ) : (
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {filteredAdded.map((entry) => (
              <EntryRow key={entry.id} entry={entry} variant="added" />
            ))}
          </div>
        )}
      </Card>

      {/* Removed Requests */}
      <Card>
        <CardHeader
          title={`Removed from HAR A (${diff.removedFromA.length})`}
          subtitle="Requests that were in HAR A but are missing from HAR B"
          icon={<span className="text-sm">➖</span>}
        />
        {diff.removedFromA.length === 0 ? (
          <p className="text-[13px] text-gray-500">No requests were removed.</p>
        ) : (
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {diff.removedFromA.map((entry) => (
              <EntryRow key={entry.id} entry={entry} variant="removed" />
            ))}
          </div>
        )}
      </Card>

      {/* New Domains */}
      {diff.domainChanges.filter((d) => d.status === 'new').length > 0 && (
        <Card>
          <CardHeader
            title="New Domains in HAR B"
            subtitle="Domains that appear for the first time in the comparison HAR"
            icon={<span className="text-sm">🆕</span>}
          />
          <div className="space-y-2">
            {diff.domainChanges.filter((d) => d.status === 'new').map((d) => (
              <div key={d.domain} className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-gray-800">{d.domain}</span>
                  {d.isThirdParty && <Badge variant="third-party">Third-party</Badge>}
                </div>
                <span className="text-[12px] text-gray-500">
                  {d.requestCountDelta} req · {formatBytes(d.sizeDelta)} · {formatDuration(d.durationDelta)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function EntryRow({ entry, variant }: { entry: ParsedEntry; variant: 'added' | 'removed' }) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = variant === 'added' ? 'border-l-amber-400' : 'border-l-gray-300';

  return (
    <div className={`rounded-lg border border-gray-100 border-l-4 ${borderColor}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge>{entry.resourceType}</Badge>
              <span className="text-[11px] text-gray-400">{entry.method}</span>
              <span className={cn('text-[11px]', entry.isFailed ? 'text-red-600 font-medium' : 'text-gray-400')}>
                {entry.statusCode}
              </span>
              {entry.isThirdParty && <Badge variant="third-party">3P</Badge>}
              {entry.isFailed && <Badge variant="failed" dot>Failed</Badge>}
            </div>
            <p className="text-[12px] text-gray-600 mt-1 truncate" title={entry.url}>
              {shortenUrl(entry.url, 80)}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 text-[12px] text-gray-500">
            <span>{formatDuration(entry.totalDuration)}</span>
            <span>{formatBytes(entry.transferSize)}</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 p-3 bg-gray-50/30 animate-fade-in text-[12px] text-gray-600">
          <div className="grid grid-cols-2 gap-2">
            <div>Hostname: {entry.hostname}</div>
            <div>Duration: {formatDuration(entry.totalDuration)}</div>
            <div>TTFB: {formatDuration(entry.timings.wait)}</div>
            <div>Size: {formatBytes(entry.transferSize)}</div>
            {entry.isRenderBlocking && <div className="text-purple-700 col-span-2">Render-blocking</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterButton({ label, count, active, onClick }: {
  label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
        active ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
      )}
    >
      {label} ({count})
    </button>
  );
}

function groupByType(entries: ParsedEntry[]): Record<string, ParsedEntry[]> {
  const map: Record<string, ParsedEntry[]> = {};
  for (const e of entries) {
    if (!map[e.resourceType]) map[e.resourceType] = [];
    map[e.resourceType].push(e);
  }
  return map;
}
