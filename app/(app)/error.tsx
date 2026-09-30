'use client';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-xl p-6 text-sm">
      <h1 className="text-base font-semibold text-navy-900">Something went wrong loading this page</h1>
      <p className="mt-2 text-slate-600">This is usually a temporary database or network problem. Your data is safe.</p>
      {error.digest && <p className="mt-1 font-mono text-xs text-slate-400">Reference: {error.digest}</p>}
      <button className="btn-primary mt-4" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
