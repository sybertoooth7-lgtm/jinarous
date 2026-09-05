// frontend/src/components/PageControls.tsx
// Shared Previous/Next pagination control, used by every admin list view.

export default function PageControls({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-3 mt-4">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="text-xs text-white/60 hover:text-white border border-white/15 rounded-lg px-3 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Previous
      </button>
      <span className="text-xs text-white/40">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="text-xs text-white/60 hover:text-white border border-white/15 rounded-lg px-3 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Next
      </button>
    </div>
  );
}
