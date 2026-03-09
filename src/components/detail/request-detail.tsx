'use client';

import { useState, useEffect } from 'react';
import type { ParsedEntry } from '@/types/har';
import { formatBytes, formatDuration, getTimingColor, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Term } from '@/components/ui/tooltip';

interface Props {
  entry: ParsedEntry;
  onClose: () => void;
}

const TAG_VARIANT: Record<string, string> = {
  slow: 'slow', failed: 'failed', 'render-blocking': 'render-blocking',
  'third-party': 'third-party', large: 'large', redirect: 'redirect',
  api: 'api', cached: 'success', compressed: 'info',
};

export function RequestDetail({ entry, onClose }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  });

  const t = entry.timings;
  const total = entry.totalDuration || 1;
  const timingPhases = [
    { key: 'blocked', label: 'Blocked', val: t.blocked, tip: 'Time spent waiting in the browser queue' },
    { key: 'dns', label: 'DNS', val: t.dns, tip: 'Time to resolve the domain name' },
    { key: 'connect', label: 'Connect', val: t.connect, tip: 'Time to establish TCP connection' },
    { key: 'ssl', label: 'SSL', val: t.ssl, tip: 'Time for TLS handshake' },
    { key: 'send', label: 'Send', val: t.send, tip: 'Time to send the request' },
    { key: 'wait', label: 'Wait (TTFB)', val: t.wait, tip: 'Time waiting for the server to respond' },
    { key: 'receive', label: 'Receive', val: t.receive, tip: 'Time downloading the response' },
  ];

  const allTags = [...entry.tags];
  if (entry.servedFromCache) allTags.push('cached');
  if (entry.isCompressed) allTags.push('compressed');

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn('fixed inset-0 z-50 bg-black/30 transition-opacity duration-200', visible ? 'opacity-100' : 'opacity-0')}
        onClick={handleClose}
      />

      {/* Panel */}
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl border-l border-gray-200 overflow-y-auto transition-transform duration-200',
        visible ? 'translate-x-0' : 'translate-x-full'
      )}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={cn(
                  'text-sm font-bold font-mono rounded-md px-2 py-0.5',
                  entry.statusCode >= 400 ? 'text-red-700 bg-red-50' :
                  entry.statusCode >= 300 ? 'text-amber-700 bg-amber-50' :
                  'text-emerald-700 bg-emerald-50'
                )}>
                  {entry.statusCode}
                </span>
                <span className="text-sm font-semibold text-gray-500">{entry.method}</span>
              </div>
              <p className="text-[13px] text-gray-600 break-all leading-relaxed">{entry.url}</p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {allTags.map((tag) => (
                <Badge key={tag} variant={TAG_VARIANT[tag] ?? 'default'} dot>{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Quick info grid */}
          <section>
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Overview</h4>
            <div className="grid grid-cols-2 gap-3">
              <InfoCell label="Type" value={entry.resourceType} />
              <InfoCell label="Total Time" value={formatDuration(entry.totalDuration)} highlight={entry.totalDuration > 2000} />
              <InfoCell label="Response Size" value={formatBytes(entry.transferSize)} highlight={entry.transferSize > 500_000} />
              <InfoCell label="TTFB" value={formatDuration(t.wait)} highlight={t.wait > 800} />
              <InfoCell label="Protocol" value={entry.protocol || 'unknown'} />
              <InfoCell label="MIME Type" value={entry.mimeType || 'unknown'} />
              {entry.isThirdParty && (
                <InfoCell label="Third-Party" value={entry.thirdPartyCategory || 'Yes'} />
              )}
              {entry.isRenderBlocking && (
                <InfoCell label="Render Blocking" value={entry.renderBlockingReason || 'Yes'} />
              )}
              {entry.servedFromCache && (
                <InfoCell label="Cache" value="Served from cache" />
              )}
              {entry.isCompressed && (
                <InfoCell label="Compression" value={entry.compressionType || 'Yes'} />
              )}
            </div>
          </section>

          {/* Timing breakdown */}
          <section>
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
              <Term definition="How time was spent during this request">Timing Breakdown</Term>
            </h4>

            {/* Stacked bar */}
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex mb-4">
              {timingPhases
                .filter((p) => p.val > 0)
                .map((p) => (
                  <div
                    key={p.key}
                    className="h-full transition-all"
                    style={{ width: `${(p.val / total) * 100}%`, backgroundColor: getTimingColor(p.key), minWidth: '2px' }}
                  />
                ))}
            </div>

            <div className="space-y-2">
              {timingPhases.map((p) => (
                <div key={p.key} className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: getTimingColor(p.key) }} />
                  <Term definition={p.tip}>
                    <span className="text-[12px] text-gray-600 w-24">{p.label}</span>
                  </Term>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max((p.val / total) * 100, 0)}%`, backgroundColor: getTimingColor(p.key) }}
                    />
                  </div>
                  <span className="text-[12px] text-gray-500 tabular-nums w-16 text-right font-medium">
                    {formatDuration(p.val)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Query params */}
          {entry.queryParams.length > 0 && (
            <CollapsibleSection title="Query Parameters" count={entry.queryParams.length}>
              <div className="divide-y divide-gray-100">
                {entry.queryParams.map((q, i) => (
                  <div key={i} className="flex gap-3 py-2 text-[12px]">
                    <span className="font-mono text-gray-500 font-medium flex-shrink-0">{q.name}</span>
                    <span className="text-gray-600 break-all">{q.value}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Request headers */}
          {entry.requestHeaders.length > 0 && (
            <CollapsibleSection title="Request Headers" count={entry.requestHeaders.length}>
              <div className="divide-y divide-gray-100">
                {entry.requestHeaders.map((h, i) => (
                  <div key={i} className="flex gap-3 py-2 text-[12px]">
                    <span className="font-mono text-gray-500 font-medium flex-shrink-0 w-40 truncate" title={h.name}>{h.name}</span>
                    <span className="text-gray-600 break-all">{h.value}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Response headers */}
          {entry.responseHeaders.length > 0 && (
            <CollapsibleSection title="Response Headers" count={entry.responseHeaders.length}>
              <div className="divide-y divide-gray-100">
                {entry.responseHeaders.map((h, i) => (
                  <div key={i} className="flex gap-3 py-2 text-[12px]">
                    <span className="font-mono text-gray-500 font-medium flex-shrink-0 w-40 truncate" title={h.name}>{h.name}</span>
                    <span className="text-gray-600 break-all">{h.value}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}
        </div>
      </div>
    </>
  );
}

function InfoCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">{label}</p>
      <p className={cn('text-[13px] font-medium truncate', highlight ? 'text-red-600' : 'text-gray-800')} title={value}>
        {value}
      </p>
    </div>
  );
}

function CollapsibleSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="border border-gray-200/80 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-[13px] font-medium text-gray-700">{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">{count}</span>
          <svg className={cn('w-4 h-4 text-gray-400 transition-transform', open && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 animate-fade-in">
          {children}
        </div>
      )}
    </section>
  );
}
