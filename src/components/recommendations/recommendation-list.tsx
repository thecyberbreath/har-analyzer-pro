'use client';

import type { Recommendation } from '@/types/har';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const SEV_STYLE: Record<string, { badge: string; icon: string; accent: string }> = {
  critical: { badge: 'critical', icon: '🔴', accent: 'border-l-red-500' },
  warning:  { badge: 'warning',  icon: '🟡', accent: 'border-l-amber-500' },
  info:     { badge: 'info',     icon: '🔵', accent: 'border-l-blue-400' },
};

interface Props {
  recommendations: Recommendation[];
  showDerived?: boolean;
}

export function RecommendationList({ recommendations, showDerived }: Props) {
  if (!recommendations.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-10 text-center">
        <p className="text-sm text-gray-400">No recommendations generated.</p>
      </div>
    );
  }

  const sorted = [...recommendations].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 px-1">
        <h3 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs">✅</span>
          Recommended Actions
        </h3>
        <span className="text-[12px] text-gray-400">{sorted.length} suggestions</span>
      </div>

      <div className="space-y-3">
        {sorted.map((rec, i) => {
          const s = SEV_STYLE[rec.severity] ?? SEV_STYLE.info;
          return (
            <div key={rec.id} className={cn('bg-white rounded-xl border border-gray-200/80 border-l-4 p-5 hover:shadow-sm transition-shadow', s.accent)}>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[12px] font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-[14px] font-semibold text-gray-900">{rec.title}</span>
                    <Badge variant={s.badge} dot>{rec.severity}</Badge>
                  </div>
                  <p className="text-[13px] text-gray-600 leading-relaxed">{rec.description}</p>
                  <p className="text-[12px] text-emerald-700 font-medium mt-2">{rec.impact}</p>

                  {showDerived && rec.derivedFrom && (
                    <p className="text-[11px] text-gray-400 mt-2 border-t border-gray-100 pt-2">
                      <span className="font-medium text-gray-500">Derived from:</span> {rec.derivedFrom}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
