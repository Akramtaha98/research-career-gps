export default function EmptyState({ icon = '📄', title, description, action }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="text-3xl mb-3" aria-hidden>{icon}</div>
      <p className="font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
