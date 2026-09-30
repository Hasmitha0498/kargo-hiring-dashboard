'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', match: ['/dashboard', '/candidates'] },
  { href: '/upload', label: 'Upload Candidate', match: ['/upload'] },
  { href: '/rubric', label: 'Hiring Rubric', match: ['/rubric', '/calibration'] },
  { href: '/activity', label: 'Activity', match: ['/activity'] },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="bg-navy-900 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-white text-xs font-bold text-navy-900">K</span>
          Kargo Hiring
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const active = l.match.some((m) => path.startsWith(m));
            return (
              <Link key={l.href} href={l.href} className={`rounded px-3 py-1.5 ${active ? 'bg-white/15 font-medium text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
