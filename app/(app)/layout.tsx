import { Nav } from '@/components/Nav';
import { requirePageSession } from '@/lib/auth/guard';
import { configStatus } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requirePageSession();
  const { missing, testEmail } = configStatus();
  return (
    <>
      <Nav />
      {missing.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          Setup incomplete. Missing: <span className="font-mono">{missing.join(', ')}</span>
        </div>
      )}
      {testEmail ? (
        <div className="border-b border-sky-200 bg-sky-50 px-4 py-1.5 text-center text-xs text-sky-900">
          <span className="mr-2 rounded bg-sky-600 px-1.5 py-px font-semibold text-white">TEST MODE</span>
          All candidate emails are delivered to <span className="font-mono">{testEmail}</span>, not to candidates.
        </div>
      ) : (
        <div className="border-b border-red-200 bg-red-50 px-4 py-1.5 text-center text-xs text-red-900">
          <span className="mr-2 rounded bg-red-600 px-1.5 py-px font-semibold text-white">LIVE EMAIL</span>
          RESEND_TEST_EMAIL is not set: confirmed emails go to real candidate addresses.
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {missing.some((m) => m.includes('SUPABASE')) ? (
          <div className="card mx-auto max-w-xl p-6 text-sm text-slate-700">
            <h1 className="text-base font-semibold text-navy-900">Connect the database</h1>
            <p className="mt-2">
              Add <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> to the environment, run{' '}
              <span className="font-mono">supabase/migrations/0001_init.sql</span> in the Supabase SQL editor, then reload. See README → Supabase setup.
            </p>
          </div>
        ) : (
          children
        )}
      </main>
    </>
  );
}
