'use client';

interface Props {
  story: string[];
}

export function StoryView({ story }: Props) {
  if (!story.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
      <h3 className="text-[15px] font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center text-xs">📝</span>
        Detailed Narrative
      </h3>
      <div className="space-y-3">
        {story.map((line, i) => (
          <div key={i} className="flex items-start gap-3 group">
            <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[11px] font-semibold flex-shrink-0 mt-0.5 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
              {i + 1}
            </span>
            <p className="text-[13px] text-gray-600 leading-relaxed">{line}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
