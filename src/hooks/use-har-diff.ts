'use client';

import { useState, useCallback } from 'react';
import type { HarAnalysis } from '@/types/har';
import type { HarDiffResult } from '@/types/diff';
import { validateHar, parseHar } from '@/lib/har-parser';
import { reconstructFlow, reconstructRedirectChains } from '@/lib/flow-engine';
import { generateInsights, estimateCriticalPath, generateStory, generateBeginnerSummary } from '@/lib/insight-engine';
import { generateRecommendations } from '@/lib/recommendation-engine';
import { compareHars } from '@/lib/diff-engine';

export type DiffState =
  | { status: 'idle' }
  | { status: 'parsing'; step: string }
  | { status: 'error'; error: string }
  | { status: 'done'; result: HarDiffResult };

async function analyzeFile(file: File): Promise<HarAnalysis> {
  const text = await file.text();
  const validation = validateHar(text);
  if (!validation.valid || !validation.har) {
    throw new Error(validation.error ?? 'Invalid HAR file.');
  }

  const { entries, domains, summary } = parseHar(validation.har);
  const redirectChains = reconstructRedirectChains(entries);
  const flowStages = reconstructFlow(entries);
  const bottlenecks = generateInsights(entries, redirectChains);
  const criticalPath = estimateCriticalPath(entries);
  const recommendations = generateRecommendations(entries, bottlenecks, summary, domains);
  const story = generateStory(entries, flowStages);
  const beginnerSummary = generateBeginnerSummary(entries, summary, bottlenecks, flowStages);

  return {
    entries, domains, flowStages, bottlenecks,
    recommendations, criticalPath, redirectChains,
    summary, story, beginnerSummary,
  };
}

export function useHarDiff() {
  const [state, setState] = useState<DiffState>({ status: 'idle' });

  const compare = useCallback(async (fileA: File, fileB: File) => {
    try {
      setState({ status: 'parsing', step: 'Analyzing baseline HAR...' });
      await new Promise((r) => requestAnimationFrame(r));
      const analysisA = await analyzeFile(fileA);

      setState({ status: 'parsing', step: 'Analyzing comparison HAR...' });
      await new Promise((r) => requestAnimationFrame(r));
      const analysisB = await analyzeFile(fileB);

      setState({ status: 'parsing', step: 'Comparing...' });
      await new Promise((r) => requestAnimationFrame(r));

      const labelA = fileA.name.replace(/\.har$/i, '');
      const labelB = fileB.name.replace(/\.har$/i, '');

      const result = compareHars(analysisA, analysisB, labelA, labelB);

      setState({ status: 'done', result });
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : 'An unexpected error occurred while comparing HAR files.',
      });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return { state, compare, reset };
}
