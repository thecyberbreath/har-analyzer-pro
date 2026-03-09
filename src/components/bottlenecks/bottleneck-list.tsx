'use client';

import { useState } from 'react';
import type { BottleneckInsight, ParsedEntry } from '@/types/har';
import { shortenUrl, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const SEV_CONFIG: Record<string, { border: string; bg: string; strip: string; badge: string; icon: string }> = {
  critical: { border: 'border-red-200',   bg: 'bg-red-50/40',   strip: 'bg-red-500',   badge: 'critical', icon: '🔴' },
  warning:  { border: 'border-amber-200', bg: 'bg-amber-50/30', strip: 'bg-amber-500', badge: 'warning',  icon: '🟡' },
  info:     { border: 'border-blue-200',  bg: 'bg-blue-50/30',  strip: 'bg-blue-400',  badge: 'info',     icon: '🔵' },
};

interface Props {
  insights: BottleneckInsight[];
  entries: ParsedEntry[];
  onSelectEntry?: (entry: ParsedEntry) => void;
  showRules?: boolean;
}

export function BottleneckList({ insights, entries, onSelectEntry, showRules }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const entryMap = new Map(entries.map((e) => [e.id, e]));

  const sorted = [...insights].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  const critCount = sorted.filter((s) => s.severity === 'critical').length;
  const warnCount = sorted.filter((s) => s.severity === 'warning').length;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-1">
        <h3 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-red-50 text-red-600 flex items-center justify-center text-xs">⚡</span>
          Detected Issues
        </h3>
        <div className="flex items-center gap-2 text-[12px]">
          {critCount > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-semibold">{critCount} critical</span>
          )}
          {warnCount > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">{warnCount} warnings</span>
          )}
          <span className="text-gray-400">{sorted.length} total</span>
        </div>
      </div>

      {/* Issue cards */}
      <div className="space-y-3">
        {sorted.map((insight) => {
          const c = SEV_CONFIG[insight.severity] ?? SEV_CONFIG.info;
          const isOpen = expandedId === insight.id;
          const involvedEntries = insight.involvedEntryIds
            .map((id) => entryMap.get(id))
            .filter(Boolean) as ParsedEntry[];

          return (
            <div key={insight.id} className={cn('rounded-xl border overflow-hidden transition-shadow', c.border, isOpen && 'shadow-sm')}>
              {/* Severity strip */}
              <div className={`h-1 ${c.strip}`} />

              <button
                onClick={() => setExpandedId(isOpen ? null : insight.id)}
                className={cn('w-full text-left px-5 py-4', c.bg)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-base mt-0.5">{c.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold text-gray-900">{insight.title}</span>
                      <Badge variant={c.badge}>{insight.severity}</Badge>
                      <Badge variant="default">{insight.category}</Badge>
                    </div>
                    <p className="text-[13px] text-gray-600 mt-1.5 leading-relaxed">{insight.plainExplanation}</p>
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 mt-1 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 animate-fade-in border-t border-gray-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    <DetailBlock label="Why It Matters" text={insight.whyItMatters} />
                    <DetailBlock label="Evidence" text={insight.evidence} />
                    <DetailBlock label="How To Fix" text={insight.possibleFix} highlight />
                  </div>

                  {insight.metric && (
                    <div className="mt-4 flex items-center gap-3 text-[12px] bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-100">
                      <span className="font-medium text-gray-600">{insight.metric.name}</span>
                      <span className="text-gray-400">|</span>
                      <span className={`font-bold tabular-nums ${insight.metric.value > insight.metric.threshold ? 'text-red-600' : 'text-emerald-600'}`}>
                        {insight.metric.value.toFixed(1)} {insight.metric.unit}
                      </span>
                      <span className="text-gray-400">threshold: {insight.metric.threshold} {insight.metric.unit}</span>
                    </div>
                  )}

                  {showRules && insight.rule && (
                    <div className="mt-3 text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      <span className="font-medium text-gray-500">Detection rule:</span> {insight.rule}
                    </div>
                  )}

                  {involvedEntries.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Related Requests</p>
                      <div className="bg-gray-50/70 rounded-lg border border-gray-100 divide-y divide-gray-100">
                        {involvedEntries.slice(0, 5).map((e) => (
                          <button
                            key={e.id}
                            onClick={(ev) => { ev.stopPropagation(); onSelectEntry?.(e); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-white transition-colors text-left"
                          >
                            <span className={`font-mono font-medium rounded px-1.5 py-0.5 ${
                              e.statusCode >= 400 ? 'text-red-700 bg-red-50' : 'text-emerald-700 bg-emerald-50'
                            }`}>{e.statusCode}</span>
                            <span className="text-gray-600 truncate flex-1">{shortenUrl(e.url, 50)}</span>
                          </button>
                        ))}
                        {involvedEntries.length > 5 && (
                          <div className="px-3 py-1.5 text-[11px] text-gray-400 text-center">
                            +{involvedEntries.length - 5} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailBlock({ label, text, highlight }: { label: string; text: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={cn('text-[13px] leading-relaxed', highlight ? 'text-brand-700 font-medium' : 'text-gray-600')}>
        {text}
      </p>
    </div>
  );
}
