'use client';

import { useState } from 'react';
import type { HarAnalysis, ParsedEntry } from '@/types/har';
import { OverviewCards } from '@/components/summary/overview-cards';
import { StoryView } from '@/components/summary/story-view';
import { ResourceBreakdown } from '@/components/summary/resource-breakdown';
import { BeginnerSummaryView } from '@/components/summary/beginner-summary';
import { FlowTimeline } from '@/components/flow/flow-timeline';
import { CriticalPath } from '@/components/flow/critical-path';
import { WaterfallChart } from '@/components/waterfall/waterfall-chart';
import { RequestTable } from '@/components/requests/request-table';
import { DomainBreakdown } from '@/components/domains/domain-breakdown';
import { BottleneckList } from '@/components/bottlenecks/bottleneck-list';
import { RecommendationList } from '@/components/recommendations/recommendation-list';
import { RequestDetail } from '@/components/detail/request-detail';
import { shortenUrl, cn } from '@/lib/utils';

type Tab = 'summary' | 'flow' | 'waterfall' | 'requests' | 'domains' | 'bottlenecks' | 'recommendations';

interface DashboardProps {
  analysis: HarAnalysis;
  onReset: () => void;
}

const TABS: { id: Tab; label: string; icon: string; description: string }[] = [
  { id: 'summary',         label: 'Summary',   icon: '📊', description: 'Overview & story' },
  { id: 'flow',            label: 'Flow',       icon: '🔄', description: 'Load stages' },
  { id: 'bottlenecks',     label: 'Issues',     icon: '⚡', description: 'Detected problems' },
  { id: 'recommendations', label: 'Actions',    icon: '✅', description: 'What to fix' },
  { id: 'waterfall',       label: 'Waterfall',  icon: '📈', description: 'Request timing' },
  { id: 'requests',        label: 'Requests',   icon: '📋', description: 'All requests' },
  { id: 'domains',         label: 'Domains',    icon: '🌐', description: 'By domain' },
];

export function Dashboard({ analysis, onReset }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [selectedEntry, setSelectedEntry] = useState<ParsedEntry | null>(null);
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');

  const { entries, domains, flowStages, bottlenecks, recommendations, criticalPath, summary, story, beginnerSummary } = analysis;
  const criticalCount = bottlenecks.filter((b) => b.severity === 'critical').length;
  const warningCount = bottlenecks.filter((b) => b.severity === 'warning').length;

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
              <span className="text-[12px] text-gray-500 truncate" title={summary.documentUrl}>
                {shortenUrl(summary.documentUrl, 50)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Mode toggle */}
              <div className="flex items-center bg-gray-100/80 rounded-lg p-0.5">
                <button
                  onClick={() => setMode('simple')}
                  className={cn(
                    'px-3 py-1.5 text-[12px] font-medium rounded-md transition-all',
                    mode === 'simple' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  Simple
                </button>
                <button
                  onClick={() => setMode('advanced')}
                  className={cn(
                    'px-3 py-1.5 text-[12px] font-medium rounded-md transition-all',
                    mode === 'advanced' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  Advanced
                </button>
              </div>

              <button
                onClick={onReset}
                className="text-[12px] text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                New Analysis
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <div className="bg-white border-b border-gray-200/60">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto -mb-px py-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const showBadge = tab.id === 'bottlenecks' && (criticalCount > 0 || warningCount > 0);

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
                    <span className={cn(
                      'px-1.5 py-0.5 text-[10px] rounded-full font-bold',
                      criticalCount > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    )}>
                      {criticalCount || warningCount}
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
          {activeTab === 'summary' && (
            <>
              {/* Hero: beginner summary is always first */}
              <BeginnerSummaryView summary={beginnerSummary} />
              <OverviewCards summary={summary} />

              {mode === 'advanced' && (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <StoryView story={story} />
                    </div>
                    <div>
                      <ResourceBreakdown summary={summary} />
                    </div>
                  </div>
                  <CriticalPath nodes={criticalPath} entries={entries} />
                </>
              )}
            </>
          )}

          {activeTab === 'flow' && (
            <>
              <FlowTimeline stages={flowStages} entries={entries} showRules={mode === 'advanced'} />
              {mode === 'advanced' && (
                <CriticalPath nodes={criticalPath} entries={entries} />
              )}
            </>
          )}

          {activeTab === 'waterfall' && (
            <WaterfallChart entries={entries} onSelectEntry={setSelectedEntry} />
          )}

          {activeTab === 'requests' && (
            <RequestTable entries={entries} onSelectEntry={setSelectedEntry} />
          )}

          {activeTab === 'domains' && (
            <DomainBreakdown domains={domains} />
          )}

          {activeTab === 'bottlenecks' && (
            <BottleneckList
              insights={bottlenecks}
              entries={entries}
              onSelectEntry={setSelectedEntry}
              showRules={mode === 'advanced'}
            />
          )}

          {activeTab === 'recommendations' && (
            <RecommendationList recommendations={recommendations} showDerived={mode === 'advanced'} />
          )}
        </div>
      </main>

      {/* ── Request detail drawer ── */}
      {selectedEntry && (
        <RequestDetail entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  );
}
