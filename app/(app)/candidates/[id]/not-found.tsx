import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-md p-6 text-sm">
      <h1 className="font-semibold text-navy-900">Candidate not found</h1>
      <p className="mt-1 text-slate-600">It may have been deleted.</p>
      <Link href="/dashboard" className="btn-secondary mt-4">
        Back to dashboard
      </Link>
    </div>
  );
}
