import { useMemo } from 'react';
import { useResearcher } from '../context/ResearcherContext';
import { generateActionItems } from '../utils/actionItems';

const priorityStyles = {
  high: 'bg-red-50 text-red-700 border-red-100',
  medium: 'bg-amber-50 text-amber-700 border-amber-100',
  low: 'bg-slate-50 text-slate-600 border-slate-100',
  info: 'bg-sky-50 text-sky-700 border-sky-100',
};

export default function Actions() {
  const { papers, researcher } = useResearcher();

  const items = useMemo(() => generateActionItems({ papers }), [papers]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Action Items</h1>
        <p className="text-sm text-slate-500 mt-1">
          Auto-generated recommendations for {researcher.name} based on current citation data.
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className={`card border ${priorityStyles[item.priority]}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
              </div>
              <span className={`shrink-0 text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-full border ${priorityStyles[item.priority]}`}>
                {item.priority}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
