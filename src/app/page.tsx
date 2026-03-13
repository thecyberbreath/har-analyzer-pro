'use client';

import { useState } from 'react';
import { HarUpload } from '@/components/upload/har-upload';
import { Dashboard } from '@/components/dashboard/dashboard';
import { DiffUpload } from '@/components/diff/diff-upload';
import { DiffDashboard } from '@/components/diff/diff-dashboard';
import { useHarAnalysis } from '@/hooks/use-har-analysis';
import { useHarDiff } from '@/hooks/use-har-diff';
import { cn } from '@/lib/utils';

type AppMode = 'analyze' | 'compare';

export default function Home() {
  const [appMode, setAppMode] = useState<AppMode>('analyze');
  const { state: analyzeState, analyze, reset: resetAnalysis } = useHarAnalysis();
  const { state: diffState, compare, reset: resetDiff } = useHarDiff();

  // Single HAR analysis done → show dashboard
  if (analyzeState.status === 'done') {
    return <Dashboard analysis={analyzeState.analysis} onReset={() => { resetAnalysis(); }} />;
  }

  // Diff done → show diff dashboard
  if (diffState.status === 'done') {
    return <DiffDashboard diff={diffState.result} onReset={() => { resetDiff(); }} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="text-center mb-10 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-50 text-brand-700 text-xs font-medium mb-6 ring-1 ring-brand-200/60">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Performance Analysis Tool
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight leading-tight">
            Understand your page load
            <br />
            <span className="text-brand-600">in plain English</span>
          </h1>
          <p className="text-gray-500 mt-4 text-base leading-relaxed text-balance">
            {appMode === 'analyze'
              ? 'Upload a HAR file and get a clear story of what happened. No more guessing what the waterfall means.'
              : 'Compare two HAR files to see what changed, what got slower, and why.'}
          </p>
        </div>

        {/* ── Mode Toggle ── */}
        <div className="flex items-center bg-gray-100/80 rounded-xl p-1 mb-8">
          <button
            onClick={() => { setAppMode('analyze'); resetDiff(); }}
            className={cn(
              'px-5 py-2 text-[13px] font-semibold rounded-lg transition-all',
              appMode === 'analyze'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            Analyze HAR
          </button>
          <button
            onClick={() => { setAppMode('compare'); resetAnalysis(); }}
            className={cn(
              'px-5 py-2 text-[13px] font-semibold rounded-lg transition-all',
              appMode === 'compare'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            Compare HARs
          </button>
        </div>

        {/* ── Upload Section ── */}
        {appMode === 'analyze' ? (
          <HarUpload
            onFileSelected={analyze}
            isLoading={analyzeState.status === 'parsing' || analyzeState.status === 'analyzing'}
          />
        ) : (
          <DiffUpload
            onFilesSelected={compare}
            isLoading={diffState.status === 'parsing'}
            loadingStep={diffState.status === 'parsing' ? diffState.step : undefined}
          />
        )}

        {/* ── Error display ── */}
        {analyzeState.status === 'error' && (
          <ErrorBanner message={analyzeState.error} />
        )}
        {diffState.status === 'error' && (
          <ErrorBanner message={diffState.error} />
        )}

        {/* ── Feature cards ── */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl w-full">
          {appMode === 'analyze' ? (
            <>
              <FeatureCard emoji="📖" title="Story-First" description="Get a plain-language explanation of what happened, not raw data." />
              <FeatureCard emoji="⚡" title="Auto-Detect Issues" description="Bottlenecks, slow APIs, large assets, and more - found automatically." />
              <FeatureCard emoji="🔒" title="Privacy First" description="Everything runs in your browser. No data is sent to any server." />
            </>
          ) : (
            <>
              <FeatureCard emoji="🔍" title="Smart Matching" description="Intelligently matches requests between runs, even with versioned URLs." />
              <FeatureCard emoji="🎯" title="Root Cause" description="Identifies why the page got slower - backend, assets, third-party, or network." />
              <FeatureCard emoji="📊" title="Stage Comparison" description="See how each phase of the page load changed between both runs." />
            </>
          )}
        </div>
      </div>

      <footer className="py-6 flex flex-col items-center gap-3">
        <img src="/mascot.png" alt="" className="w-10 h-10 opacity-60" />
        <span className="text-xs text-gray-400">HAR Analyzer - All processing happens locally in your browser.</span>
      </footer>
    </div>
  );
}

function FeatureCard({ emoji, title, description }: { emoji: string; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-white border border-gray-200/80 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center mb-3 text-lg">
        {emoji}
      </div>
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{description}</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-6 px-5 py-4 rounded-xl bg-red-50 border border-red-200 max-w-lg animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="text-red-500 text-lg flex-shrink-0">🔴</span>
        <div>
          <p className="text-sm font-semibold text-red-800">Could not analyze file</p>
          <p className="text-xs text-red-600 mt-1 leading-relaxed">{message}</p>
        </div>
      </div>
    </div>
  );
}
