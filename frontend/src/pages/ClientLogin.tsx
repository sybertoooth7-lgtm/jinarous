// frontend/src/pages/ClientLogin.tsx — SECURE VERSION
// Uses secureFetch (CSRF auto-attached) + honeypot field.
// Does NOT use broken client-side request signing.

import { useState } from 'react';
import { secureFetch, isHoneypotTriggered } from '@/lib/security';
import { SecurityHoneypot } from '@/components/SecurityHoneypot';

export default function ClientLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Honeypot check: if filled, it's a bot
    if (isHoneypotTriggered()) {
      setError('Security check failed.');
      setLoading(false);
      return;
    }

    try {
      const res = await secureFetch('/api/client/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Login failed');
      }

      const data = await res.json();
      if (data.newDeviceAlert) {
        // Show a banner: "New device detected, email sent"
        console.warn('New device login detected — check your email');
      }

      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-dark">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md p-8 bg-navy rounded-xl border border-white/10 relative"
      >
        <SecurityHoneypot />
        <h2 className="text-2xl font-bold text-white mb-6">Client Portal</h2>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm text-white/70 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-navy-light border border-white/10 rounded-lg px-3.5 py-2.5 text-white"
            placeholder="you@company.com"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm text-white/70 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-navy-light border border-white/10 rounded-lg px-3.5 py-2.5 text-white"
            placeholder="••••••••"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-alux-cyan text-navy-dark font-semibold py-2.5 rounded-lg hover:bg-alux-cyan/90 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
