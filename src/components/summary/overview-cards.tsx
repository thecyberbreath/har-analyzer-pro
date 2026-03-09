'use client';

import type { AnalysisSummary } from '@/types/har';
import { formatBytes, formatDuration } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

interface Props {
  summary: AnalysisSummary;
}

interface MetricCardData {
  label: string;
  value: string;
  tip: string;
  accent?: string;
  alert?: boolean;
  icon: string;
}

export function OverviewCards({ summary }: Props) {
  const slowest = summary.slowestRequest?.duration ?? 0;
  const ttfb = summary.highestTTFB?.ttfb ?? 0;

  const cards: MetricCardData[] = [
    {
      label: 'Total Requests',
      value: String(summary.totalRequests),
      tip: 'Number of HTTP requests captured in the HAR file',
      icon: '📡',
    },
    {
      label: 'Total Size',
      value: formatBytes(summary.totalTransferSize),
      tip: 'Total bytes transferred across all requests',
      icon: '📦',
      accent: summary.totalTransferSize > 5_000_000 ? 'ring-amber-300 bg-amber-50' : undefined,
      alert: summary.totalTransferSize > 5_000_000,
    },
    {
      label: 'Load Duration',
      value: formatDuration(summary.totalDuration),
      tip: 'Time from first request to last response',
      icon: '⏱️',
      accent: summary.totalDuration > 5000 ? 'ring-red-300 bg-red-50' : undefined,
      alert: summary.totalDuration > 5000,
    },
    {
      label: 'Failed',
      value: String(summary.failedRequests),
      tip: 'Requests that returned 4xx or 5xx status codes',
      icon: '❌',
      accent: summary.failedRequests > 0 ? 'ring-red-300 bg-red-50' : undefined,
      alert: summary.failedRequests > 0,
    },
    {
      label: 'Redirects',
      value: String(summary.redirectCount),
      tip: 'HTTP 3xx redirect responses',
      icon: '🔀',
      accent: summary.redirectCount > 3 ? 'ring-amber-300 bg-amber-50' : undefined,
      alert: summary.redirectCount > 3,
    },
    {
      label: 'Third-Party',
      value: String(summary.thirdPartyRequests),
      tip: 'Requests to domains other than the main page domain',
      icon: '🌐',
    },
    {
      label: 'Slowest Request',
      value: formatDuration(slowest),
      tip: summary.slowestRequest ? `Slowest: ${summary.slowestRequest.url}` : 'Duration of the single longest request',
      icon: '🐢',
      accent: slowest > 3000 ? 'ring-amber-300 bg-amber-50' : undefined,
      alert: slowest > 3000,
    },
    {
      label: 'Highest TTFB',
      value: formatDuration(ttfb),
      tip: summary.highestTTFB ? `Highest TTFB: ${summary.highestTTFB.url}` : 'Time to First Byte - how long the server took to start responding',
      icon: '🏷️',
      accent: ttfb > 1500 ? 'ring-amber-300 bg-amber-50' : undefined,
      alert: ttfb > 1500,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Tooltip key={c.label} content={c.tip} side="bottom">
          <div
            className={`relative rounded-xl border p-4 transition-shadow hover:shadow-sm cursor-default ${
              c.accent ? `ring-1 ${c.accent}` : 'bg-white border-gray-200/80'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs text-gray-500 font-medium">{c.label}</span>
              <span className="text-sm">{c.icon}</span>
            </div>
            <p className={`text-xl font-bold tracking-tight ${c.alert ? 'text-red-600' : 'text-gray-900'}`}>
              {c.value}
            </p>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}
