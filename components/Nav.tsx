'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/upload', label: 'Upload Candidate' },
  { href: '/rubric', label: 'Rubric' },
  { href: '/activity', label: 'Activity' },
  { href: '/calibration', label: 'Calibration', admin: true },
];

export function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === '/' ? path === '/' || path.startsWith('/candidates') : path.startsWith(href));
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return (
    <header className="bg-navy-900 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-[15px] font-semibold tracking-tight">
          Kargo Hiring Dashboard
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded px-2.5 py-1 ${active(l.href) ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'} ${l.admin ? 'md:ml-auto' : ''}`}
            >
              {l.label}
              {l.admin && <span className="ml-1.5 rounded bg-white/15 px-1 py-px text-[10px] uppercase tracking-wide">Admin</span>}
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="text-sm text-white/60 hover:text-white">
          Sign out
        </button>
      </div>
    </header>
  );
}
