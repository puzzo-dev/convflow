'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiFetch('/platform/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      window.location.href = '/login';
    } catch (err: any) {
      setError(err?.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md p-10 glass-panel animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-br from-white to-secondary bg-clip-text text-transparent">Get Started</h1>
        <p className="text-secondary text-center mb-8 text-sm">Create your ConvFlow tenant account</p>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-lg bg-danger/15 border border-danger/30 text-danger text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="flex flex-col gap-5">
          <div>
            <label className="label" htmlFor="name">Your Name or Business Name</label>
            <input
              id="name"
              type="text"
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Acme Corp"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary mt-2" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-muted">
          Already have an account?{' '}
          <a href="/login" className="font-semibold text-accent hover:text-accent-hover transition-colors">Sign in</a>
        </div>
      </div>
    </div>
  );
}
