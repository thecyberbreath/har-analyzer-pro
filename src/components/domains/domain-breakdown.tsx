'use client';

import type { DomainStats } from '@/types/har';
import { formatBytes, formatDuration, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface Props {
  domains: DomainStats[];
}

export function DomainBreakdown({ domains }: Props) {
  const sorted = [...domains].sort((a, b) => b.totalTime - a.totalTime);
  const maxTime = Math.max(...sorted.map((d) => d.totalTime), 1);
  const maxSize = Math.max(...sorted.map((d) => d.totalSize), 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-sky-50 text-sky-600 flex items-center justify-center text-xs">🌐</span>
          Domains
        </h3>
        <p className="text-[13px] text-gray-500 mt-1">{sorted.length} domains contacted</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500 text-[11px] uppercase tracking-wider font-semibold">
              <th className="pl-5 pr-2 py-3 text-left">Domain</th>
              <th className="px-2 py-3 text-right">Requests</th>
              <th className="px-2 py-3 text-left">Total Time</th>
              <th className="px-2 py-3 text-left">Total Size</th>
              <th className="px-2 py-3 text-right">Avg Time</th>
              <th className="px-2 py-3 text-right pr-5">Failed</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => (
              <tr key={d.domain} className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
                <td className="pl-5 pr-2 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">{d.domain}</span>
                    {d.isThirdParty && (
                      <Badge variant="third-party">
                        {d.thirdPartyCategory || '3P'}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-2 py-3 text-right text-gray-600 tabular-nums">{d.requestCount}</td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${(d.totalTime / maxTime) * 100}%` }} />
                    </div>
                    <span className="text-gray-500 tabular-nums">{formatDuration(d.totalTime)}</span>
                  </div>
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-violet-400" style={{ width: `${(d.totalSize / maxSize) * 100}%` }} />
                    </div>
                    <span className="text-gray-500 tabular-nums">{formatBytes(d.totalSize)}</span>
                  </div>
                </td>
                <td className="px-2 py-3 text-right text-gray-500 tabular-nums">{formatDuration(d.averageTime)}</td>
                <td className={cn(
                  'px-2 py-3 text-right pr-5 tabular-nums font-medium',
                  d.failedCount > 0 ? 'text-red-600' : 'text-gray-400'
                )}>
                  {d.failedCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
