'use client';

import { useState } from 'react';
import type { BeginnerSummary, StoryLine, Severity } from '@/types/har';
import { Term } from '@/components/ui/tooltip';

const VERDICT_STYLES: Record<string, { bg: string; ring: string; text: string; label: string; emoji: string }> = {
  fast:     { bg: 'bg-emerald-50', ring: 'ring-emerald-200', text: 'text-emerald-700', label: 'Fast', emoji: '🟢' },
  moderate: { bg: 'bg-amber-50',   ring: 'ring-amber-200',   text: 'text-amber-700',   label: 'Moderate', emoji: '🟡' },
  slow:     { bg: 'bg-red-50',     ring: 'ring-red-200',     text: 'text-red-700',     label: 'Slow', emoji: '🔴' },
  broken:   { bg: 'bg-red-100',    ring: 'ring-red-300',     text: 'text-red-800',     label: 'Broken', emoji: '🚨' },
};

const SEVERITY_COLORS: Record<Severity, { dot: string; bg: string; text: string; border: string }> = {
  critical: { dot: 'bg-red-500',    bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
  warning:  { dot: 'bg-amber-500',  bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  info:     { dot: 'bg-blue-400',   bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
};

interface Props {
  summary: BeginnerSummary;
}

export function BeginnerSummaryView({ summary }: Props) {
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const v = VERDICT_STYLES[summary.verdict] ?? VERDICT_STYLES.moderate;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Verdict Hero ── */}
      <div className={`relative rounded-2xl ${v.bg} ring-1 ${v.ring} overflow-hidden`}>
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }}
        />
        <div className="relative px-8 py-10 text-center">
          <div className={`inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full ${v.bg} ring-1 ${v.ring} mb-5`}>
            <span className="text-lg">{v.emoji}</span>
            <span className={`text-sm font-semibold ${v.text}`}>{v.label} Page Load</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight text-balance max-w-2xl mx-auto leading-snug">
            {summary.headline}
          </h2>
        </div>
      </div>

      {/* ── What Happened (Story) ── */}
      <section>
        <h3 className="text-[15px] font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center text-xs">📖</span>
          What Happened
        </h3>
        <div className="relative pl-8">
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gradient-to-b from-brand-200 via-brand-100 to-transparent" />
          <div className="space-y-1">
            {summary.storyLines.map((line, i) => (
              <StoryStep key={i} line={line} index={i} isLast={i === summary.storyLines.length - 1} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Top Issues ── */}
      {summary.topIssues.length > 0 && (
        <section>
          <h3 className="text-[15px] font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-red-50 text-red-600 flex items-center justify-center text-xs">⚡</span>
            Top Issues
            <span className="ml-1.5 text-xs text-gray-400 font-normal">({summary.topIssues.length})</span>
          </h3>
          <div className="space-y-2">
            {summary.topIssues.map((issue, i) => {
              const c = SEVERITY_COLORS[issue.severity] ?? SEVERITY_COLORS.info;
              const isOpen = expandedIssue === i;
              return (
                <button
                  key={i}
                  onClick={() => setExpandedIssue(isOpen ? null : i)}
                  className={`w-full text-left rounded-xl border ${c.border} ${c.bg} p-4 transition-all hover:shadow-sm group`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-2 h-2 rounded-full ${c.dot} mt-1.5 flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${c.text}`}>{issue.title}</span>
                        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      {isOpen && (
                        <p className="text-[13px] text-gray-600 mt-2 leading-relaxed animate-fade-in">
                          {issue.explanation}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Glossary ── */}
      {summary.glossary.length > 0 && (
        <section className="bg-gray-50/70 rounded-xl border border-gray-200/60 p-5">
          <h4 className="text-[13px] font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="text-xs">📚</span> Terms Used Above
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {summary.glossary.map((g) => (
              <div key={g.term} className="flex items-baseline gap-2 text-[13px]">
                <Term definition={g.definition}>
                  <span className="font-medium text-gray-700">{g.term}</span>
                </Term>
                <span className="text-gray-400 hidden sm:inline">- {g.definition}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StoryStep({ line, index, isLast }: { line: StoryLine; index: number; isLast: boolean }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="relative flex items-start gap-3 group">
      <div className="absolute left-[-21px] w-[22px] h-[22px] rounded-full bg-white border-2 border-brand-200 flex items-center justify-center text-xs z-10 group-hover:border-brand-400 transition-colors">
        <span>{line.icon || (index + 1)}</span>
      </div>
      <div className={`flex-1 rounded-lg px-4 py-2.5 ${!isLast ? 'mb-1' : ''} bg-white border border-gray-100 hover:border-gray-200 transition-colors`}>
        <p className="text-[13px] text-gray-700 leading-relaxed">{line.text}</p>
        {line.detail && (
          <>
            <button
              onClick={() => setShowDetail(!showDetail)}
              className="text-[11px] text-brand-600 hover:text-brand-700 mt-1 font-medium"
            >
              {showDetail ? 'Less detail' : 'More detail'}
            </button>
            {showDetail && (
              <p className="text-[12px] text-gray-500 mt-1 leading-relaxed animate-fade-in">{line.detail}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
