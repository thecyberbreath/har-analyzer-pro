'use client';

import { useState, useCallback } from 'react';
import type { HarAnalysis } from '@/types/har';
import { validateHar, parseHar } from '@/lib/har-parser';
import { reconstructFlow, reconstructRedirectChains } from '@/lib/flow-engine';
import { generateInsights, estimateCriticalPath, generateStory, generateBeginnerSummary } from '@/lib/insight-engine';
import { generateRecommendations } from '@/lib/recommendation-engine';

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'parsing' }
  | { status: 'analyzing' }
  | { status: 'error'; error: string }
  | { status: 'done'; analysis: HarAnalysis };

export function useHarAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });

  const analyze = useCallback(async (file: File) => {
    setState({ status: 'parsing' });

    try {
      const text = await file.text();
      const validation = validateHar(text);

      if (!validation.valid || !validation.har) {
        setState({ status: 'error', error: validation.error ?? 'Invalid HAR file.' });
        return;
      }

      setState({ status: 'analyzing' });

      // Yield to let the UI update before heavy computation
      await new Promise((r) => requestAnimationFrame(r));

      // Phase 1: Parse + normalize + classify
      const { entries, domains, summary } = parseHar(validation.har);

      // Phase 2: Reconstruct redirect chains
      const redirectChains = reconstructRedirectChains(entries);

      // Phase 3: Reconstruct flow stages
      const flowStages = reconstructFlow(entries);

      // Phase 4: Detect bottlenecks and findings
      const bottlenecks = generateInsights(entries, redirectChains);

      // Phase 5: Estimate critical path
      const criticalPath = estimateCriticalPath(entries);

      // Phase 6: Generate recommendations from findings
      const recommendations = generateRecommendations(entries, bottlenecks, summary, domains);

      // Phase 7: Generate human-readable story
      const story = generateStory(entries, flowStages);

      // Phase 8: Generate beginner-friendly summary
      const beginnerSummary = generateBeginnerSummary(entries, summary, bottlenecks, flowStages);

      const analysis: HarAnalysis = {
        entries,
        domains,
        flowStages,
        bottlenecks,
        recommendations,
        criticalPath,
        redirectChains,
        summary,
        story,
        beginnerSummary,
      };

      setState({ status: 'done', analysis });
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : 'An unexpected error occurred while analyzing the HAR file.',
      });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return { state, analyze, reset };
}
