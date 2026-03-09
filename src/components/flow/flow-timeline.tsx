'use client';

import { useState } from 'react';
import type { FlowStage, ParsedEntry } from '@/types/har';
import { formatDuration, shortenUrl, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const SIG_STYLES: Record<string, { dot: string; line: string; bg: string; label: string }> = {
  critical:  { dot: 'bg-red-500 ring-red-200',       line: 'bg-red-300',     bg: 'border-red-200 bg-red-50/50',     label: 'Critical' },
  important: { dot: 'bg-amber-500 ring-amber-200',    line: 'bg-amber-300',   bg: 'border-amber-200 bg-amber-50/50', label: 'Important' },
  normal:    { dot: 'bg-blue-500 ring-blue-200',      line: 'bg-blue-200',    bg: 'border-gray-200 bg-white',        label: 'Normal' },
  low:       { dot: 'bg-gray-400 ring-gray-200',      line: 'bg-gray-200',    bg: 'border-gray-200/60 bg-gray-50/50', label: 'Low' },
};

interface Props {
  stages: FlowStage[];
  entries: ParsedEntry[];
  showRules?: boolean;
}

export function FlowTimeline({ stages, entries, showRules }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const totalSpan = sorted.length > 0 ? sorted[sorted.length - 1].endTime - sorted[0].startTime : 1;

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs">🔄</span>
            Reconstructed Flow
          </h3>
          <p className="text-[13px] text-gray-500 mt-1">
            How the page loaded, organized into logical stages
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Critical</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Important</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Normal</span>
        </div>
      </div>

      <div className="relative">
        {sorted.map((stage, i) => {
          const s = SIG_STYLES[stage.significance] ?? SIG_STYLES.normal;
          const isOpen = expanded === stage.id;
          const isLast = i === sorted.length - 1;
          const stageEntries = entries.filter((e) => stage.entryIds.includes(e.id));
          const barWidth = Math.max(((stage.duration / totalSpan) * 100), 3);

          return (
            <div key={stage.id} className="relative flex gap-0">
              {/* Timeline spine */}
              <div className="flex flex-col items-center w-8 flex-shrink-0">
                <div className={`w-3.5 h-3.5 rounded-full ${s.dot} ring-2 z-10`} />
                {!isLast && <div className={`w-0.5 flex-1 ${s.line} min-h-[24px]`} />}
              </div>

              {/* Stage card */}
              <div className={`flex-1 mb-4 -mt-0.5 ml-2`}>
                <button
                  onClick={() => setExpanded(isOpen ? null : stage.id)}
                  className={cn(
                    'w-full text-left rounded-xl border p-4 transition-all hover:shadow-sm',
                    s.bg,
                    isOpen && 'shadow-sm'
                  )}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-semibold text-gray-900 truncate">{stage.name}</span>
                      <Badge variant={stage.significance === 'critical' ? 'critical' : stage.significance === 'important' ? 'warning' : 'default'} dot>
                        {s.label}
                      </Badge>
                      <span className="text-[11px] text-gray-400">{stage.entryIds.length} req</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-medium text-gray-600 tabular-nums">{formatDuration(stage.duration)}</span>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Mini timing bar */}
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        stage.significance === 'critical' ? 'bg-red-400' :
                        stage.significance === 'important' ? 'bg-amber-400' :
                        'bg-blue-400'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">{stage.whyItMatters}</p>
                </button>

                {isOpen && (
                  <div className="mt-2 animate-fade-in space-y-2">
                    {showRules && stage.rule && (
                      <div className="text-[11px] text-gray-500 px-4 py-2 bg-gray-50 rounded-lg border border-gray-100">
                        <span className="font-medium text-gray-600">Rule:</span> {stage.rule}
                      </div>
                    )}
                    <div className="bg-gray-50/70 rounded-xl border border-gray-100 divide-y divide-gray-100">
                      {stageEntries.slice(0, 10).map((e) => (
                        <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-[12px]">
                          <span className={`w-9 text-center font-mono font-medium rounded px-1.5 py-0.5 ${
                            e.statusCode >= 400 ? 'text-red-700 bg-red-50' :
                            e.statusCode >= 300 ? 'text-amber-700 bg-amber-50' :
                            'text-emerald-700 bg-emerald-50'
                          }`}>
                            {e.statusCode}
                          </span>
                          <span className="text-gray-600 truncate flex-1" title={e.url}>{shortenUrl(e.url, 60)}</span>
                          <span className="text-gray-400 tabular-nums flex-shrink-0">{formatDuration(e.totalDuration)}</span>
                        </div>
                      ))}
                      {stageEntries.length > 10 && (
                        <div className="px-4 py-2 text-[11px] text-gray-400 text-center">
                          +{stageEntries.length - 10} more requests
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
