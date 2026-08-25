import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { API_BASE } from '@/lib/api';
import { secureFetch } from '@/lib/security';

interface ComplianceItem {
  id: number;
  framework: string;
  item_key: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'passing' | 'failing' | 'not_applicable';
  notes: string | null;
  updated_at: string | null;
}

interface LoginEvent {
  ipAddress: string;
  success: boolean;
  createdAt: string;
}

interface ClientInfo {
  id: number;
  company_name: string;
  email: string;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Not yet assessed', className: 'bg-white/10 text-white/60' },
  in_progress: { label: 'In progress', className: 'bg-alux-cyan/15 text-alux-cyan' },
  passing: { label: 'Passing', className: 'bg-alux-green/15 text-alux-green' },
  failing: { label: 'Needs attention', className: 'bg-alux-red/15 text-alux-red' },
  not_applicable: { label: 'Not applicable', className: 'bg-white/10 text-white/40' },
};

export default function ClientDashboard() {
  const navigate = useNavigate();
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [frameworks, setFrameworks] = useState<Record<string, ComplianceItem[]>>({});
  const [score, setScore] = useState<{ score: number | null; label: string } | null>(null);
  const [loginEvents, setLoginEvents] = useState<LoginEvent[]>([]);
  const [failedLoginCount, setFailedLoginCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDashboard() {
      try {
        const meRes = await fetch(`${API_BASE}/api/client/me`, { credentials: 'include' });
        if (meRes.status === 401) {
          navigate('/client/login');
          return;
        }
        if (!meRes.ok) throw new Error('Failed to load account.');
        const meData = await meRes.json();
        setClient(meData.client);

        const complianceRes = await fetch(`${API_BASE}/api/client/compliance`, { credentials: 'include' });
        if (!complianceRes.ok) throw new Error('Failed to load compliance status.');
        const complianceData = await complianceRes.json();
        setFrameworks(complianceData.frameworks || {});

        const scoreRes = await fetch(`${API_BASE}/api/client/risk-score`, { credentials: 'include' });
        if (scoreRes.ok) {
          const scoreData = await scoreRes.json();
          setScore({ score: scoreData.score, label: scoreData.label });
        }

        const securityRes = await fetch(`${API_BASE}/api/client/security-events`, { credentials: 'include' });
        if (securityRes.ok) {
          const securityData = await securityRes.json();
          setLoginEvents(securityData.events || []);
          setFailedLoginCount(securityData.failedCount || 0);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, [navigate]);

  async function handleLogout() {
    // POST — must go through secureFetch so the CSRF header is sent
    // (the backend enforces CSRF verification globally on all
    // non-GET requests, including this one).
    await secureFetch('/api/client/logout', { method: 'POST' }).catch(() => {});
    navigate('/client/login');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-base text-white flex items-center justify-center">
        <p className="text-white/50">Loading your compliance status…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-navy-base text-white flex items-center justify-center px-4">
        <p className="text-alux-red">{error}</p>
      </div>
    );
  }

  const frameworkNames = Object.keys(frameworks);
  const allItems = frameworkNames.flatMap((f) => frameworks[f]);
  const passingCount = allItems.filter((i) => i.status === 'passing').length;

  return (
    <div className="min-h-screen bg-navy-base text-white">
      <header className="border-b border-white/10 px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-alux-gold">{client?.company_name}</h1>
          <p className="text-sm text-white/50">{client?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-white/60 hover:text-white border border-white/15 rounded-lg px-4 py-2 transition-colors"
        >
          Logout
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {score && score.score !== null && (
          <div className="bg-navy-surface border border-alux-gold/20 rounded-2xl p-6 mb-6 flex items-center justify-between">
            <div>
              <p className="text-white/50 text-sm mb-1">Your Risk Score</p>
              <p className="text-3xl font-bold font-mono">{score.score}<span className="text-white/30 text-lg">/100</span></p>
              <p className="text-sm text-alux-gold mt-1">{score.label}</p>
            </div>
            <p className="text-xs text-white/40 max-w-[180px] text-right">
              Ask your admin for a shareable verification link to send to banks or partners.
            </p>
          </div>
        )}

        <div className="mb-8">
          <p className="text-white/60">
            {passingCount} of {allItems.length} checklist items currently passing.
          </p>
        </div>

        {frameworkNames.length === 0 && (
          <p className="text-white/50">No compliance items on file yet.</p>
        )}

        {frameworkNames.map((framework) => (
          <div key={framework} className="mb-10">
            <h2 className="font-serif text-lg text-alux-cyan mb-4">{framework}</h2>
            <div className="space-y-3">
              {frameworks[framework].map((item) => {
                const style = STATUS_STYLES[item.status] || STATUS_STYLES.pending;
                return (
                  <div
                    key={item.id}
                    className="bg-navy-surface border border-white/10 rounded-xl p-4 flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="font-medium">{item.title}</p>
                      {item.description && (
                        <p className="text-sm text-white/50 mt-1">{item.description}</p>
                      )}
                      {item.notes && (
                        <p className="text-sm text-white/40 mt-2 italic">Note: {item.notes}</p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${style.className}`}>
                      {style.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="mt-10">
          <h2 className="font-serif text-lg text-alux-cyan mb-4">Account Login Activity</h2>
          {failedLoginCount > 0 && (
            <div className="bg-alux-red/10 border border-alux-red/30 rounded-xl p-4 mb-4">
              <p className="text-alux-red text-sm font-medium">
                {failedLoginCount} failed login {failedLoginCount === 1 ? 'attempt' : 'attempts'} on your account recently.
              </p>
              <p className="text-white/50 text-xs mt-1">
                If this wasn't you, consider changing your password and contacting Alux Plaza.
              </p>
            </div>
          )}
          <div className="space-y-2">
            {loginEvents.length === 0 && (
              <p className="text-white/40 text-sm">No login activity recorded yet.</p>
            )}
            {loginEvents.map((event, idx) => (
              <div
                key={idx}
                className="bg-navy-surface border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${event.success ? 'bg-alux-green' : 'bg-alux-red'}`} />
                  <span className="text-white/80">{event.success ? 'Successful login' : 'Failed login attempt'}</span>
                  <span className="text-white/30 font-mono text-xs">{event.ipAddress}</span>
                </div>
                <span className="text-white/40 text-xs">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
