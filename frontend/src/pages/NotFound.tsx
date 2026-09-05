// frontend/src/pages/NotFound.tsx
// Catch-all route for any path that doesn't match — wired as the last
// <Route path="*"> entry in App.tsx.

import { Link } from 'react-router';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-navy-base text-white flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="font-serif text-lg text-alux-gold mb-2">ALUX PLAZA</p>
        <p className="text-7xl font-bold font-mono text-white/10 mb-4">404</p>
        <h1 className="text-xl font-semibold mb-2">Page not found</h1>
        <p className="text-white/50 mb-8">
          The page you're looking for doesn't exist, or may have moved.
        </p>
        <Link
          to="/"
          className="inline-block bg-alux-cyan text-navy-base font-semibold px-6 py-2.5 rounded-lg hover:bg-alux-cyan/90 transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
