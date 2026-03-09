'use client';

import type { AnalysisSummary } from '@/types/har';
import { formatBytes, getTypeColor } from '@/lib/utils';

interface Props {
  summary: AnalysisSummary;
}

export function ResourceBreakdown({ summary }: Props) {
  const types = Object.entries(summary.resourceBreakdown)
    .map(([type, data]) => ({ type, ...data }))
    .sort((a, b) => b.size - a.size);

  const maxSize = Math.max(...types.map((t) => t.size), 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6 h-full">
      <h3 className="text-[15px] font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center text-xs">📊</span>
        Resource Breakdown
      </h3>
      <div className="space-y-3">
        {types.map((t) => {
          const pct = Math.max((t.size / maxSize) * 100, 2);
          return (
            <div key={t.type}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: getTypeColor(t.type) }} />
                  <span className="text-[13px] font-medium text-gray-700 capitalize">{t.type}</span>
                  <span className="text-[11px] text-gray-400">{t.count}</span>
                </div>
                <span className="text-[12px] text-gray-500 font-medium tabular-nums">{formatBytes(t.size)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: getTypeColor(t.type) }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
