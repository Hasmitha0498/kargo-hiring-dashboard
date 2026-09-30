'use client';
import { useRouter } from 'next/navigation';

/** A table row that opens a page when clicked anywhere (links inside it still work normally). */
export function ClickableRow({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <tr
      className={`cursor-pointer ${className ?? ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button')) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
