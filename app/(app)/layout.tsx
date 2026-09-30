import { Nav } from '@/components/Nav';
import { configStatus } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { missing, testEmail } = configStatus();
  const dbMissing = missing.some((m) => m.includes('SUPABASE'));
  return (
    <>
      <Nav />
      {testEmail ? (
        <div className="border-b border-sky-200 bg-sky-50 px-4 py-1.5 text-center text-xs text-sky-900">
          <span className="mr-2 rounded bg-sky-600 px-1.5 py-px font-semibold text-white">TEST MODE</span>
          Emails are delivered to a test inbox, never to candidates.
        </div>
      ) : (
        <div className="border-b border-red-200 bg-red-50 px-4 py-1.5 text-center text-xs text-red-900">
          <span className="mr-2 rounded bg-red-600 px-1.5 py-px font-semibold text-white">LIVE EMAIL</span>
          Confirmed emails go to real candidate addresses.
        </div>
      )}
      {missing.length > 0 && !dbMissing && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900">
          Some features are unavailable until the server is configured ({missing.join(', ')}).
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {dbMissing ? (
          <div className="card mx-auto max-w-xl p-6 text-sm text-slate-700">
            <h1 className="text-base font-semibold text-navy-900">The database is not connected</h1>
            <p className="mt-2">This deployment is missing its Supabase configuration, so there is nothing to show yet. See README → Supabase setup.</p>
          </div>
        ) : (
          children
        )}
      </main>
    </>
  );
}
