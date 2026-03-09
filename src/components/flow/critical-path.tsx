'use client';

import { useState } from 'react';
import type { CriticalPathNode, ParsedEntry } from '@/types/har';
import { formatDuration, shortenUrl, cn } from '@/lib/utils';

interface Props {
  nodes: CriticalPathNode[];
  entries: ParsedEntry[];
}

export function CriticalPath({ nodes, entries }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!nodes.length) return null;

  const entryMap = new Map(entries.map((e) => [e.id, e]));
  const maxContrib = Math.max(...nodes.map((n) => n.contribution), 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
      <div className="mb-5">
        <h3 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center text-xs">🔥</span>
          Critical Path
        </h3>
        <p className="text-[13px] text-gray-500 mt-1">
          The chain of requests most responsible for your total load time
        </p>
      </div>

      <div className="space-y-1.5">
        {nodes.map((node, i) => {
          const entry = entryMap.get(node.entryId);
          if (!entry) return null;
          const isOpen = expandedId === node.entryId;
          const barPct = Math.max((node.contribution / maxContrib) * 100, 4);
          const depEntry = node.dependsOn ? entryMap.get(node.dependsOn) : null;

          return (
            <button
              key={node.entryId}
              onClick={() => setExpandedId(isOpen ? null : node.entryId)}
              className={cn(
                'w-full text-left rounded-xl border border-gray-200/80 p-4 transition-all hover:shadow-sm',
                isOpen && 'bg-orange-50/30 border-orange-200/60 shadow-sm'
              )}
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-medium text-gray-800 truncate">{shortenUrl(entry.url, 50)}</span>
                    <span className="text-[11px] text-gray-400 flex-shrink-0 tabular-nums">{formatDuration(entry.totalDuration)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500 transition-all duration-500"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-gray-500 tabular-nums flex-shrink-0">
                      {formatDuration(node.contribution)}
                    </span>
                  </div>
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 pl-9 space-y-1.5 text-[12px] animate-fade-in">
                  <p className="text-gray-600">{node.reason}</p>
                  {node.rule && (
                    <p className="text-gray-400"><span className="font-medium text-gray-500">Rule:</span> {node.rule}</p>
                  )}
                  {depEntry && (
                    <p className="text-gray-400">
                      <span className="font-medium text-gray-500">Depends on:</span>{' '}
                      {shortenUrl(depEntry.url, 40)}
                    </p>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
