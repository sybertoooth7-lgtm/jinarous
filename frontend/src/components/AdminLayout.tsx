// frontend/src/components/AdminLayout.tsx
// Shared header + nav for all authenticated admin pages. Fetches the
// current admin's identity itself (via /api/admin/me) so every page that
// uses this layout gets consistent auth-gating for free — a 401 redirects
// to /admin/login without each page needing to duplicate that check.

import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, Link, useLocation } from 'react-router';
import { API_BASE } from '@/lib/api';
import { secureFetch } from '@/lib/security';

interface AdminUser {
  id: number;
  email: string;
  role: 'readonly' | 'admin' | 'superadmin';
}

interface AdminLayoutProps {
  children: (admin: AdminUser) => ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/me`, { credentials: 'include' });
        if (res.status === 401) {
          navigate('/admin/login');
          return;
        }
        if (!res.ok) throw new Error('Failed to load admin account.');
        const data = await res.json();
        if (!mounted) return;
        setAdmin(data.user);
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
  }, [navigate]);

  async function handleLogout() {
    await secureFetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    navigate('/admin/login');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-base text-white flex items-center justify-center">
        <p className="text-white/50">Loading…</p>
      </div>
    );
  }

  if (error || !admin) {
    return (
      <div className="min-h-screen bg-navy-base text-white flex items-center justify-center px-4">
        <p className="text-alux-red">{error || 'Not signed in.'}</p>
      </div>
    );
  }

  const navLinks = [
    { to: '/admin/dashboard', label: 'Dashboard' },
    ...(admin.role === 'superadmin' ? [{ to: '/admin/users', label: 'Users' }] : []),
  ];

  return (
    <div className="min-h-screen bg-navy-base text-white">
      <header className="border-b border-white/10 px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="font-serif text-lg text-alux-gold">ALUX PLAZA</h1>
            <p className="text-xs text-white/40 uppercase tracking-wider">Admin</p>
          </div>
          <nav className="flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/50">{admin.email}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-white/60 hover:text-white border border-white/15 rounded-lg px-4 py-2 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <main>{children(admin)}</main>
    </div>
  );
}
