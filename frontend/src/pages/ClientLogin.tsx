import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { API_BASE } from '@/lib/api';

export default function ClientLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/client/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // credentials: 'include' is required here (unlike the public contact
        // form fetch) because the frontend and backend run on different
        // origins — without this, the browser won't send or store the
        // httpOnly session cookie the backend sets on successful login.
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      navigate('/client/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-navy-base text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-navy-surface border border-alux-gold/20 rounded-2xl p-8 shadow-xl">
        <h1 className="font-serif text-2xl text-alux-gold mb-1">Client Portal</h1>
        <p className="text-sm text-white/60 mb-8">
          Sign in to view your compliance status.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="client-email" className="block text-sm text-white/70 mb-1.5">
              Email
            </label>
            <input
              id="client-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-navy-light border border-white/10 rounded-lg px-3.5 py-2.5 text-white
                         focus:outline-none focus:border-alux-cyan/60 focus:ring-1 focus:ring-alux-cyan/40"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="client-password" className="block text-sm text-white/70 mb-1.5">
              Password
            </label>
            <input
              id="client-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-navy-light border border-white/10 rounded-lg px-3.5 py-2.5 text-white
                         focus:outline-none focus:border-alux-cyan/60 focus:ring-1 focus:ring-alux-cyan/40"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-alux-red text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-alux-gold hover:bg-alux-gold-light disabled:opacity-50
                       text-navy-base font-semibold rounded-lg py-2.5 transition-colors"
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-white/40 mt-6 text-center">
          Credentials for this portal are issued directly by Alux Plaza after
          an engagement begins. Contact us if you haven't received yours.
        </p>
      </div>
    </div>
  );
}
