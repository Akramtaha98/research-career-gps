export default function MetricCard({ label, value, sublabel, accent = 'brand' }) {
  const accentClasses = {
    brand: 'text-brand-600',
    sky: 'text-sky-600',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
  };
  return (
    <div className="card">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${accentClasses[accent] || accentClasses.brand}`}>{value}</p>
      {sublabel && <p className="mt-1 text-xs text-slate-400">{sublabel}</p>}
    </div>
  );
}
