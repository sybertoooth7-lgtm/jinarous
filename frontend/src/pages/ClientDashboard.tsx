// frontend/src/pages/ClientDashboard.tsx
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { secureFetch } from '@/lib/security';
import { Link } from 'react-router';
import { Shield, AlertTriangle, FileText, Activity, CheckCircle, XCircle, Clock } from 'lucide-react';

interface ComplianceItem {
  id: number;
  framework: string;
  item_key: string;
  title: string;
  description: string;
  status: string;
  notes: string | null;
  updated_at: string;
}

interface RiskScore {
  overall: number;
  categories: Record<string, number>;
  updated_at: string;
}

interface SecurityEvent {
  id: number;
  event_type: string;
  severity: string;
  ip_address: string;
  created_at: string;
}

export default function ClientDashboard() {
  const [client, setClient] = useState<any>(null);
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [meRes, complianceRes, scoreRes, securityRes] = await Promise.all([
          secureFetch('/api/client/me'),
          secureFetch('/api/client/compliance'),
          secureFetch('/api/client/risk-score'),
          secureFetch('/api/client/security-events'),
        ]);

        if (!meRes.ok || !complianceRes.ok || !scoreRes.ok || !securityRes.ok) {
          throw new Error('Failed to load dashboard data');
        }

        const [meData, complianceData, scoreData, securityData] = await Promise.all([
          meRes.json(),
          complianceRes.json(),
          scoreRes.json(),
          securityRes.json(),
        ]);

        setClient(meData);
        setCompliance(complianceData.compliance || []);
        setRiskScore(scoreData.riskScore || null);
        setSecurityEvents(securityData.events || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-base text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-alux-gold" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-navy-base text-white flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-alux-red mx-auto mb-4" />
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-base text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-serif text-alux-gold mb-2">Client Dashboard</h1>
          <p className="text-white/60">{client?.company_name}</p>
        </div>

        {/* Risk Score */}
        {riskScore && (
          <div className="bg-navy-surface border border-white/10 rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-serif text-alux-gold flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Risk Score
              </h2>
              <span className={`text-2xl font-bold ${
                riskScore.overall >= 80 ? 'text-alux-green' :
                riskScore.overall >= 60 ? 'text-alux-orange' :
                'text-alux-red'
              }`}>
                {riskScore.overall}/100
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(riskScore.categories).map(([category, score]) => (
                <div key={category} className="bg-navy-base rounded-lg p-4">
                  <p className="text-sm text-white/60 mb-1">{category}</p>
                  <p className={`text-lg font-bold ${
                    score >= 80 ? 'text-alux-green' :
                    score >= 60 ? 'text-alux-orange' :
                    'text-alux-red'
                  }`}>
                    {score}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compliance Status */}
        <div className="bg-navy-surface border border-white/10 rounded-2xl p-6 mb-8">
          <h2 className="text-xl font-serif text-alux-gold flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5" />
            Compliance Status
          </h2>
          <div className="space-y-3">
            {compliance.map((item) => (
              <div key={item.id} className="flex items-center justify-between bg-navy-base rounded-lg p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">{item.title}</span>
                    <span className="text-xs text-white/40">({item.framework})</span>
                  </div>
                  <p className="text-sm text-white/60">{item.description}</p>
                  {item.notes && (
                    <p className="text-sm text-white/40 mt-1">{item.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {item.status === 'passing' && <CheckCircle className="h-5 w-5 text-alux-green" />}
                  {item.status === 'failing' && <XCircle className="h-5 w-5 text-alux-red" />}
                  {item.status === 'pending' && <Clock className="h-5 w-5 text-alux-orange" />}
                  <span className={`text-sm font-medium ${
                    item.status === 'passing' ? 'text-alux-green' :
                    item.status === 'failing' ? 'text-alux-red' :
                    'text-alux-orange'
                  }`}>
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security Events */}
        <div className="bg-navy-surface border border-white/10 rounded-2xl p-6">
          <h2 className="text-xl font-serif text-alux-gold flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5" />
            Security Events
          </h2>
          <div className="space-y-2">
            {securityEvents.length === 0 && (
              <p className="text-white/40 text-sm">No security events recorded.</p>
            )}
            {securityEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between bg-navy-base rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${
                    event.severity === 'high' ? 'bg-alux-red' :
                    event.severity === 'medium' ? 'bg-alux-orange' :
                    'bg-alux-green'
                  }`} />
                  <span className="text-sm text-white">{event.event_type}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-white/40">
                  <span>{event.ip_address}</span>
                  <span>{new Date(event.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
