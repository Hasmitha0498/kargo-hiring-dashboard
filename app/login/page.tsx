'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    if (res.ok) {
      window.location.href = '/';
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(body.error ?? 'Sign-in failed.');
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h1 className="text-lg font-semibold text-navy-900">Kargo Hiring Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Internal tool. Founder access only.</p>
        <label className="label mt-5" htmlFor="password">
          Password
        </label>
        <input id="password" type="password" autoComplete="current-password" autoFocus className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button className="btn-primary mt-4 w-full py-2" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
