// frontend/src/pages/AdminSubmissions.tsx
// Contact-form submissions management: filter by status, search, update
// status, delete. Migrated from the static admin panel (backend/public/
// admin/dashboard.js) to bring feature parity to the React admin surface.

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { secureFetch } from '@/lib/security';
import AdminLayout from '@/components/AdminLayout';
import PageControls from '@/components/PageControls';

type Status = 'new' | 'read' | 'replied' | 'archived';

interface Submission {
  id: number;
  name: string;
  email: string;
  company: string | null;
  message: string;
  status: Status;
  created_at: string;
  updated_at: string;
}

const STATUS_STYLES: Record<Status, string> = {
  new: 'bg-alux-cyan/15 text-alux-cyan',
  read: 'bg-white/10 text-white/60',
  replied: 'bg-alux-green/15 text-alux-green',
  archived: 'bg-white/5 text-white/30',
};

const STATUS_OPTIONS: Status[] = ['new', 'read', 'replied', 'archived'];

export default function AdminSubmissions() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (statusFilter) params.set('status', statusFilter);
        if (search) params.set('search', search);
        const res = await fetch(`${API_BASE}/api/admin/submissions?${params}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to load submissions.');
        const data = await res.json();
        if (!mounted) return;
        setSubmissions(data.data);
        setTotalPages(data.totalPages || 1);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [page, statusFilter, search]);

  async function updateStatus(id: number, status: Status) {
    try {
      const res = await secureFetch(`/api/admin/submissions/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update status.');
      const data = await res.json();
      setSubmissions((prev) => prev.map((s) => (s.id === id ? data.submission : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    }
  }

  async function deleteSubmission(id: number) {
    if (!confirm('Delete this submission? This cannot be undone.')) return;
    try {
      const res = await secureFetch(`/api/admin/submissions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete submission.');
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete submission.');
    }
  }

  return (
    <AdminLayout>
      {() => (
        <div className="max-w-5xl mx-auto px-6 py-10">
          <h2 className="font-serif text-lg text-alux-gold mb-6">Contact Submissions</h2>

          <div className="flex flex-wrap gap-3 mb-6">
            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value as Status | '');
              }}
              className="bg-navy-surface border border-white/15 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search name, email, company, message…"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              className="flex-1 min-w-[200px] bg-navy-surface border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/30"
            />
          </div>

          {error && <p className="text-alux-red text-sm mb-4">{error}</p>}

          {loading ? (
            <p className="text-white/50 text-sm">Loading…</p>
          ) : submissions.length === 0 ? (
            <p className="text-white/50 text-sm">No submissions match this filter.</p>
          ) : (
            <div className="space-y-2">
              {submissions.map((s) => {
                const isExpanded = expandedId === s.id;
                return (
                  <div
                    key={s.id}
                    className="bg-navy-surface border border-white/10 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : s.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{s.name}</span>
                          <span className="text-white/40 text-sm truncate">{s.email}</span>
                          {s.company && (
                            <span className="text-white/30 text-xs">· {s.company}</span>
                          )}
                        </div>
                        {!isExpanded && (
                          <p className="text-white/50 text-sm truncate mt-1">{s.message}</p>
                        )}
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[s.status]}`}
                        >
                          {s.status}
                        </span>
                        <select
                          value={s.status}
                          onChange={(e) => updateStatus(s.id, e.target.value as Status)}
                          className="bg-navy-base border border-white/15 rounded-lg px-2 py-1 text-white text-xs"
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => deleteSubmission(s.id)}
                          className="text-alux-red text-xs border border-alux-red/30 rounded-lg px-2 py-1 hover:bg-alux-red/10"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <p className="text-white/70 text-sm mt-3 whitespace-pre-wrap border-t border-white/10 pt-3">
                        {s.message}
                      </p>
                    )}
                    <p className="text-white/25 text-xs mt-2">
                      Received {new Date(s.created_at).toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          <PageControls page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </AdminLayout>
  );
}
