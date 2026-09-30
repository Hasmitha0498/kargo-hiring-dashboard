import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kargo Hiring Dashboard',
  description: 'Evidence-based PM / SPM hiring decision support. AI recommends, the founder decides.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
