'use client';

import { useState } from 'react';
import type { HarDiffResult, DiffStageSummary } from '@/types/diff';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDuration, cn } from '@/lib/utils';

interface Props {
  diff: HarDiffResult;
}

export function DiffFlow({ diff }: Props) {
  const stages = diff.stageComparison;
  const changed = stages.filter((s) => s.status !== 'unchanged');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Overview text */}
      <Card>
        <CardHeader
          title="How the Load Flow Changed"
          subtitle="Each stage represents a group of related requests that happen during page load"
          icon={<span className="text-sm">🔄</span>}
        />
        {changed.length === 0 ? (
          <p className="text-[13px] text-gray-500">
            The load flow stages are essentially the same between both HARs.
          </p>
        ) : (
          <p className="text-[13px] text-gray-600 leading-relaxed">
            {changed.length} stage(s) changed between the two HARs.
            {stages.filter((s) => s.direction === 'worse').length > 0 &&
              ` ${stages.filter((s) => s.direction === 'worse').length} became slower.`}
            {stages.filter((s) => s.status === 'new').length > 0 &&
              ` ${stages.filter((s) => s.status === 'new').length} new stage(s) appeared.`}
            {stages.filter((s) => s.status === 'removed').length > 0 &&
              ` ${stages.filter((s) => s.status === 'removed').length} stage(s) disappeared.`}
          </p>
        )}
      </Card>

      {/* Stage timeline */}
      <div className="space-y-3">
        {stages.map((stage) => (
          <StageRow key={stage.stageId} stage={stage} diff={diff} />
        ))}
      </div>
    </div>
  );
}

function StageRow({ stage, diff }: { stage: DiffStageSummary; diff: HarDiffResult }) {
  const [expanded, setExpanded] = useState(false);

  const statusBadge = () => {
    switch (stage.status) {
      case 'new': return <Badge variant="warning" dot>New in B</Badge>;
      case 'removed': return <Badge variant="info" dot>Removed</Badge>;
      case 'changed': return stage.direction === 'worse'
        ? <Badge variant="slow" dot>Slower</Badge>
        : stage.direction === 'better'
        ? <Badge variant="success" dot>Faster</Badge>
        : <Badge dot>Changed</Badge>;
      case 'unchanged': return <Badge variant="default">Unchanged</Badge>;
    }
  };

  const borderColor = stage.direction === 'worse'
    ? 'border-l-red-400'
    : stage.direction === 'better'
    ? 'border-l-emerald-400'
    : stage.status === 'new'
    ? 'border-l-amber-400'
    : stage.status === 'removed'
    ? 'border-l-gray-300'
    : 'border-l-gray-200';

  const maxDuration = Math.max(
    stage.stageA?.duration ?? 0,
    stage.stageB?.duration ?? 0,
    1,
  );

  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-[14px] font-semibold text-gray-900">{stage.stageName}</h4>
                {statusBadge()}
              </div>
              <p className="text-[12px] text-gray-500 mt-0.5">{stage.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            {stage.durationDelta !== 0 && stage.status !== 'new' && stage.status !== 'removed' && (
              <span className={cn(
                'text-[13px] font-semibold',
                stage.direction === 'worse' ? 'text-red-600' : stage.direction === 'better' ? 'text-emerald-600' : 'text-gray-500',
              )}>
                {stage.durationDelta > 0 ? '+' : ''}{formatDuration(stage.durationDelta)}
              </span>
            )}
            <svg className={cn('w-4 h-4 text-gray-400 transition-transform', expanded && 'rotate-180')}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Duration bars */}
        <div className="mt-3 space-y-1.5">
          {stage.stageA && (
            <DurationBar
              label="A"
              duration={stage.stageA.duration}
              maxDuration={maxDuration}
              requestCount={stage.stageA.entryIds.length}
              color="emerald"
            />
          )}
          {stage.stageB && (
            <DurationBar
              label="B"
              duration={stage.stageB.duration}
              maxDuration={maxDuration}
              requestCount={stage.stageB.entryIds.length}
              color="blue"
            />
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 animate-fade-in">
          <div className="grid grid-cols-2 gap-4 text-[12px]">
            <div>
              <p className="font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200/60">A</span>
                {stage.stageA ? formatDuration(stage.stageA.duration) : 'N/A'}
              </p>
              <p className="text-gray-500">
                {stage.stageA ? `${stage.stageA.entryIds.length} request(s)` : 'Stage not present'}
              </p>
              {stage.stageA && (
                <p className="text-gray-400 mt-1">
                  {formatDuration(stage.stageA.startTime)} – {formatDuration(stage.stageA.endTime)}
                </p>
              )}
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200/60">B</span>
                {stage.stageB ? formatDuration(stage.stageB.duration) : 'N/A'}
              </p>
              <p className="text-gray-500">
                {stage.stageB ? `${stage.stageB.entryIds.length} request(s)` : 'Stage not present'}
              </p>
              {stage.stageB && (
                <p className="text-gray-400 mt-1">
                  {formatDuration(stage.stageB.startTime)} – {formatDuration(stage.stageB.endTime)}
                </p>
              )}
            </div>
          </div>
          {stage.requestCountDelta !== 0 && (
            <p className="text-[12px] text-gray-500 mt-3">
              Request count: {stage.requestCountDelta > 0 ? '+' : ''}{stage.requestCountDelta}
              {stage.requestCountDelta > 0
                ? ' (more requests in this stage may increase contention)'
                : ' (fewer requests may reduce contention)'}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function DurationBar({ label, duration, maxDuration, requestCount, color }: {
  label: string; duration: number; maxDuration: number; requestCount: number; color: 'emerald' | 'blue';
}) {
  const pct = maxDuration > 0 ? Math.max((duration / maxDuration) * 100, 2) : 2;
  const barColor = color === 'emerald' ? 'bg-emerald-400' : 'bg-blue-400';
  const badgeColor = color === 'emerald'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
    : 'bg-blue-50 text-blue-700 border-blue-200/60';

  return (
    <div className="flex items-center gap-2">
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeColor} w-6 text-center`}>
        {label}
      </span>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-gray-500 w-20 text-right">
        {formatDuration(duration)} <span className="text-gray-400">({requestCount})</span>
      </span>
    </div>
  );
}
