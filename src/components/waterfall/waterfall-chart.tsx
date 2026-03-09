'use client';

import { useState, useMemo } from 'react';
import type { ParsedEntry } from '@/types/har';
import { formatDuration, formatBytes, shortenUrl, getTimingColor, getTypeColor, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type ViewLevel = 'important' | 'all';

interface Props {
  entries: ParsedEntry[];
  onSelectEntry?: (entry: ParsedEntry) => void;
}

const TIMING_PHASES = [
  { key: 'blocked', label: 'Blocked' },
  { key: 'dns', label: 'DNS' },
  { key: 'connect', label: 'Connect' },
  { key: 'ssl', label: 'SSL' },
  { key: 'send', label: 'Send' },
  { key: 'wait', label: 'Wait (TTFB)' },
  { key: 'receive', label: 'Receive' },
];

export function WaterfallChart({ entries, onSelectEntry }: Props) {
  const [search, setSearch] = useState('');
  const [viewLevel, setViewLevel] = useState<ViewLevel>('important');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    let list = entries;

    if (viewLevel === 'important') {
      list = list.filter((e) =>
        e.resourceType === 'document' ||
        e.isRenderBlocking ||
        e.isApi ||
        e.statusCode >= 400 ||
        e.totalDuration > 1000 ||
        e.transferSize > 200_000
      );
    }

    if (typeFilter !== 'all') {
      list = list.filter((e) => e.resourceType === typeFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.url.toLowerCase().includes(q));
    }

    return list;
  }, [entries, viewLevel, typeFilter, search]);

  const earliest = entries.length > 0 ? Math.min(...entries.map((e) => e.startTime)) : 0;
  const latest = entries.length > 0 ? Math.max(...entries.map((e) => e.startTime + e.totalDuration)) : 1;
  const totalSpan = latest - earliest || 1;

  const resourceTypes = useMemo(() => {
    const types = new Set(entries.map((e) => e.resourceType));
    return ['all', ...Array.from(types).sort()];
  }, [entries]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
      {/* Controls */}
      <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Filter by URL..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-[12px] border border-gray-200 rounded-lg px-3 py-2 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {resourceTypes.map((t) => (
              <option key={t} value={t}>{t === 'all' ? 'All Types' : t}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewLevel('important')}
              className={cn('px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors',
                viewLevel === 'important' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >
              Important Only
            </button>
            <button
              onClick={() => setViewLevel('all')}
              className={cn('px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors',
                viewLevel === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >
              All Requests
            </button>
          </div>
          <span className="text-[11px] text-gray-400 tabular-nums">{filtered.length} / {entries.length}</span>
        </div>
      </div>

      {/* Timing legend */}
      <div className="px-5 py-2.5 border-b border-gray-50 flex flex-wrap gap-3">
        {TIMING_PHASES.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: getTimingColor(p.key) }} />
            {p.label}
          </span>
        ))}
      </div>

      {/* Waterfall rows */}
      <div className="max-h-[600px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-gray-400">
            No requests match your filters
          </div>
        ) : (
          filtered.map((entry, i) => {
            const left = ((entry.startTime - earliest) / totalSpan) * 100;
            const width = Math.max((entry.totalDuration / totalSpan) * 100, 0.5);
            const isHovered = hoveredId === entry.id;
            const t = entry.timings;

            return (
              <div
                key={entry.id}
                className={cn(
                  'flex items-center border-b border-gray-50 cursor-pointer transition-colors group',
                  isHovered ? 'bg-blue-50/50' : 'hover:bg-gray-50/70',
                  entry.statusCode >= 400 && 'bg-red-50/20'
                )}
                onClick={() => onSelectEntry?.(entry)}
                onMouseEnter={() => setHoveredId(entry.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Left info */}
                <div className="w-[340px] flex-shrink-0 flex items-center gap-2 px-4 py-2 min-w-0 border-r border-gray-100">
                  <span className="w-5 text-[10px] text-gray-300 tabular-nums text-right">{i + 1}</span>
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: getTypeColor(entry.resourceType) }} />
                  <span className={cn(
                    'w-10 text-center text-[11px] font-mono font-medium rounded px-1 py-0.5',
                    entry.statusCode >= 400 ? 'text-red-700 bg-red-50' :
                    entry.statusCode >= 300 ? 'text-amber-700 bg-amber-50' :
                    'text-emerald-700 bg-emerald-50'
                  )}>
                    {entry.statusCode}
                  </span>
                  <span className="text-[12px] text-gray-600 truncate flex-1 group-hover:text-gray-900 transition-colors" title={entry.url}>
                    {shortenUrl(entry.url, 35)}
                  </span>
                  <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">{formatDuration(entry.totalDuration)}</span>
                </div>

                {/* Timing bar */}
                <div className="flex-1 relative h-8 px-2">
                  <div className="absolute top-1/2 -translate-y-1/2 flex h-[10px] rounded-sm overflow-hidden" style={{ left: `${left}%`, width: `${width}%`, minWidth: '3px' }}>
                    {renderTimingSegments(t, entry.totalDuration)}
                  </div>

                  {/* Hover tooltip */}
                  {isHovered && (
                    <div className="absolute z-30 bottom-full mb-1 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl pointer-events-none animate-fade-in whitespace-nowrap"
                      style={{ left: `${Math.min(left + width / 2, 80)}%`, transform: 'translateX(-50%)' }}>
                      <div className="font-medium mb-1">{shortenUrl(entry.url, 40)}</div>
                      <div className="flex gap-3 text-gray-300">
                        <span>Wait: {formatDuration(t.wait)}</span>
                        <span>Total: {formatDuration(entry.totalDuration)}</span>
                        <span>{formatBytes(entry.transferSize)}</span>
                      </div>
                      {entry.tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {entry.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px]">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function renderTimingSegments(t: ParsedEntry['timings'], total: number) {
  if (total <= 0) return null;
  const phases = [
    { key: 'blocked', val: t.blocked },
    { key: 'dns', val: t.dns },
    { key: 'connect', val: t.connect },
    { key: 'ssl', val: t.ssl },
    { key: 'send', val: t.send },
    { key: 'wait', val: t.wait },
    { key: 'receive', val: t.receive },
  ];

  return phases
    .filter((p) => p.val > 0)
    .map((p) => (
      <div
        key={p.key}
        style={{ width: `${(p.val / total) * 100}%`, backgroundColor: getTimingColor(p.key), minWidth: '1px' }}
      />
    ));
}
