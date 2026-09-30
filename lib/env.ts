// Reads server configuration. Missing values raise a clear, secret-free error instead of a crash deep inside a call.
import 'server-only';

export class MissingEnvError extends Error {
  constructor(readonly names: string[]) {
    super(`Missing environment variable${names.length > 1 ? 's' : ''}: ${names.join(', ')}. Add ${names.length > 1 ? 'them' : 'it'} to .env.local (or Vercel -> Settings -> Environment Variables).`);
    this.name = 'MissingEnvError';
  }
}

function read(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function required(name: string): string {
  const v = read(name);
  if (!v) throw new MissingEnvError([name]);
  return v;
}

export const env = {
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseServiceKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  geminiApiKey: () => required('GEMINI_API_KEY'),
  geminiModel: () => read('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  geminiFallbackModel: () => read('GEMINI_FALLBACK_MODEL') ?? 'gemini-3.1-flash-lite',
  resendApiKey: () => required('RESEND_API_KEY'),
  resendFrom: () => required('RESEND_FROM_EMAIL'),
  resendTestEmail: () => read('RESEND_TEST_EMAIL'),
  companyName: () => read('COMPANY_NAME') ?? 'Kargo',
  senderName: () => read('SENDER_NAME') ?? 'Arjun Mehta',
  senderTitle: () => read('SENDER_TITLE') ?? 'Founder',
};

/** Which integrations are configured, for the setup banner. Reports names only, never values. */
export function configStatus() {
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL'];
  return { missing: names.filter((n) => !read(n)), testEmail: read('RESEND_TEST_EMAIL') ?? null };
}
