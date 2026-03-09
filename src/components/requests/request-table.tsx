'use client';

import { useState, useMemo } from 'react';
import type { ParsedEntry } from '@/types/har';
import { formatBytes, formatDuration, shortenUrl, getTypeColor, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type SortKey = 'index' | 'status' | 'size' | 'ttfb' | 'duration';

interface Props {
  entries: ParsedEntry[];
  onSelectEntry?: (entry: ParsedEntry) => void;
}

const PAGE_SIZE = 50;

const TAG_VARIANT: Record<string, string> = {
  slow: 'slow', failed: 'failed', 'render-blocking': 'render-blocking',
  'third-party': 'third-party', large: 'large', redirect: 'redirect',
  api: 'api',
};

export function RequestTable({ entries, onSelectEntry }: Props) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('index');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let list = entries;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.url.toLowerCase().includes(q) || String(e.statusCode).includes(q));
    }
    const sorted = [...list].sort((a, b) => {
      const indexA = entries.indexOf(a);
      const indexB = entries.indexOf(b);
      let cmp = 0;
      switch (sortKey) {
        case 'index': cmp = indexA - indexB; break;
        case 'status': cmp = a.statusCode - b.statusCode; break;
        case 'size': cmp = a.transferSize - b.transferSize; break;
        case 'ttfb': cmp = a.timings.wait - b.timings.wait; break;
        case 'duration': cmp = a.totalDuration - b.totalDuration; break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [entries, search, sortKey, sortAsc]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) { setSortAsc(!sortAsc); }
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortHeader = ({ label, field, className }: { label: string; field: SortKey; className?: string }) => (
    <button onClick={() => handleSort(field)} className={cn('flex items-center gap-1 text-left hover:text-gray-700 transition-colors', className)}>
      {label}
      {sortKey === field && (
        <svg className={cn('w-3 h-3', !sortAsc && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      )}
    </button>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search requests..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
        </div>
        <span className="text-[12px] text-gray-400 tabular-nums">{filtered.length} requests</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500 text-[11px] uppercase tracking-wider font-semibold">
              <th className="pl-5 pr-2 py-3"><SortHeader label="#" field="index" /></th>
              <th className="px-2 py-3"><SortHeader label="Status" field="status" /></th>
              <th className="px-2 py-3 text-left">URL</th>
              <th className="px-2 py-3 text-left">Type</th>
              <th className="px-2 py-3"><SortHeader label="Size" field="size" /></th>
              <th className="px-2 py-3"><SortHeader label="TTFB" field="ttfb" /></th>
              <th className="px-2 py-3"><SortHeader label="Duration" field="duration" /></th>
              <th className="px-2 py-3 text-left">Tags</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((e, i) => (
              <tr
                key={e.id}
                onClick={() => onSelectEntry?.(e)}
                className={cn(
                  'border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50/70',
                  e.statusCode >= 400 && 'bg-red-50/20'
                )}
              >
                <td className="pl-5 pr-2 py-2.5 text-gray-400 tabular-nums">{page * PAGE_SIZE + i + 1}</td>
                <td className="px-2 py-2.5">
                  <span className={cn(
                    'font-mono font-medium rounded px-1.5 py-0.5',
                    e.statusCode >= 400 ? 'text-red-700 bg-red-50' :
                    e.statusCode >= 300 ? 'text-amber-700 bg-amber-50' :
                    'text-emerald-700 bg-emerald-50'
                  )}>{e.statusCode}</span>
                </td>
                <td className="px-2 py-2.5 text-gray-600 truncate max-w-[300px]" title={e.url}>{shortenUrl(e.url, 45)}</td>
                <td className="px-2 py-2.5">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: getTypeColor(e.resourceType) }} />
                    <span className="text-gray-500 capitalize">{e.resourceType}</span>
                  </span>
                </td>
                <td className="px-2 py-2.5 text-gray-500 tabular-nums text-right">{formatBytes(e.transferSize)}</td>
                <td className="px-2 py-2.5 text-gray-500 tabular-nums text-right">{formatDuration(e.timings.wait)}</td>
                <td className="px-2 py-2.5 text-gray-500 tabular-nums text-right">{formatDuration(e.totalDuration)}</td>
                <td className="px-2 py-2.5">
                  <div className="flex gap-1 flex-wrap">
                    {e.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant={TAG_VARIANT[tag] ?? 'default'}>{tag}</Badge>
                    ))}
                    {e.tags.length > 3 && (
                      <span className="text-[10px] text-gray-400">+{e.tags.length - 3}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="text-[12px] text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
          >
            Previous
          </button>
          <span className="text-[12px] text-gray-400 tabular-nums">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="text-[12px] text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
