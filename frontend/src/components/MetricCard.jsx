/**
 * Headline metric tile (H-index, citations, tracked papers, average).
 *
 * The accent now drives a soft tinted icon chip and a matching top hairline
 * rather than only the number's text colour — with four of these sitting in
 * a row, colour alone on the digits made them read as one undifferentiated
 * block. The chip gives each tile an anchor the eye can land on, which is
 * what makes the row scannable rather than just colourful.
 */
const ACCENTS = {
  brand: { text: 'text-brand-600', chip: 'bg-brand-50 text-brand-600', rule: 'from-brand-400' },
  sky: { text: 'text-sky-600', chip: 'bg-sky-50 text-sky-600', rule: 'from-sky-400' },
  emerald: { text: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-600', rule: 'from-emerald-400' },
  amber: { text: 'text-amber-600', chip: 'bg-amber-50 text-amber-600', rule: 'from-amber-400' },
};

export default function MetricCard({ label, value, sublabel, accent = 'brand', icon }) {
  const a = ACCENTS[accent] || ACCENTS.brand;
  return (
    <div className="card relative overflow-hidden">
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${a.rule} to-transparent`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 truncate">{label}</p>
          <p className={`mt-1.5 text-3xl font-bold tabular-nums ${a.text}`}>{value}</p>
          {sublabel && <p className="mt-1 text-xs text-slate-400">{sublabel}</p>}
        </div>
        {icon && (
          <span
            aria-hidden="true"
            className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-base ${a.chip}`}
          >
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}
