'use client';

import { HarUpload } from '@/components/upload/har-upload';
import { Dashboard } from '@/components/dashboard/dashboard';
import { useHarAnalysis } from '@/hooks/use-har-analysis';

export default function Home() {
  const { state, analyze, reset } = useHarAnalysis();

  if (state.status === 'done') {
    return <Dashboard analysis={state.analysis} onReset={reset} />;
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
            Upload a HAR file and get a clear story of what happened.
            No more guessing what the waterfall means.
          </p>
        </div>

        <HarUpload
          onFileSelected={analyze}
          isLoading={state.status === 'parsing' || state.status === 'analyzing'}
        />

        {state.status === 'error' && (
          <div className="mt-6 px-5 py-4 rounded-xl bg-red-50 border border-red-200 max-w-lg animate-fade-in">
            <div className="flex items-start gap-3">
              <span className="text-red-500 text-lg flex-shrink-0">🔴</span>
              <div>
                <p className="text-sm font-semibold text-red-800">Could not analyze file</p>
                <p className="text-xs text-red-600 mt-1 leading-relaxed">{state.error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl w-full">
          <FeatureCard
            emoji="📖"
            title="Story-First"
            description="Get a plain-language explanation of what happened, not raw data."
          />
          <FeatureCard
            emoji="⚡"
            title="Auto-Detect Issues"
            description="Bottlenecks, slow APIs, large assets, and more - found automatically."
          />
          <FeatureCard
            emoji="🔒"
            title="Privacy First"
            description="Everything runs in your browser. No data is sent to any server."
          />
        </div>
      </div>

      <footer className="py-6 text-center text-xs text-gray-400">
        HAR Analyzer - All processing happens locally in your browser.
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
