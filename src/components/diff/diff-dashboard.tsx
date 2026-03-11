'use client';

import { useState } from 'react';
import type { HarDiffResult } from '@/types/diff';
import { DiffSummary } from './diff-summary';
import { DiffFlow } from './diff-flow';
import { DiffDetails } from './diff-details';
import { cn } from '@/lib/utils';

type DiffTab = 'summary' | 'flow' | 'details' | 'added-removed';

const TABS: { id: DiffTab; label: string; icon: string; description: string }[] = [
  { id: 'summary',       label: 'What Changed',    icon: '📊', description: 'Overview & insights' },
  { id: 'flow',          label: 'Flow Comparison',  icon: '🔄', description: 'Stage-by-stage diff' },
  { id: 'details',       label: 'Regressions',      icon: '🔍', description: 'Request-level changes' },
  { id: 'added-removed', label: 'Added / Removed',  icon: '📋', description: 'New & missing requests' },
];

interface Props {
  diff: HarDiffResult;
  onReset: () => void;
}

export function DiffDashboard({ diff, onReset }: Props) {
  const [activeTab, setActiveTab] = useState<DiffTab>('summary');

  const regressionsCount = diff.topRegressions.length;

  return (
    <div className="min-h-screen bg-gray-50/80">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 glass border-b border-gray-200/60 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={onReset} className="flex items-center gap-2 text-brand-600 hover:text-brand-800 transition-colors flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm font-bold hidden sm:inline">HAR Analyzer</span>
              </button>
              <span className="w-px h-5 bg-gray-200" />
              <div className="flex items-center gap-2 text-[12px] text-gray-500 truncate">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[11px] font-medium">
                  A
                </span>
                <span className="truncate max-w-[120px]" title={diff.labelA}>{diff.labelA}</span>
                <span className="text-gray-300">vs</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 text-[11px] font-medium">
                  B
                </span>
                <span className="truncate max-w-[120px]" title={diff.labelB}>{diff.labelB}</span>
              </div>
            </div>

            <button
              onClick={onReset}
              className="text-[12px] text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
            >
              New Comparison
            </button>
          </div>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <div className="bg-white border-b border-gray-200/60">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto -mb-px py-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const showBadge = tab.id === 'details' && regressionsCount > 0;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-all flex-shrink-0',
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span className="text-sm">{tab.icon}</span>
                  <span>{tab.label}</span>
                  {showBadge && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded-full font-bold bg-red-100 text-red-700">
                      {regressionsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ── Content ── */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-6 animate-fade-in" key={activeTab}>
          {activeTab === 'summary' && <DiffSummary diff={diff} />}
          {activeTab === 'flow' && <DiffFlow diff={diff} />}
          {activeTab === 'details' && <DiffDetails diff={diff} mode="regressions" />}
          {activeTab === 'added-removed' && <DiffDetails diff={diff} mode="added-removed" />}
        </div>
      </main>
    </div>
  );
}
