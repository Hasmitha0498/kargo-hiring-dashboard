// Pure helpers for candidate emails (no network). The AI writes {{first_name}}; code inserts the real first name
// from the private record just before display/sending.

export const FIRST_NAME_TOKEN = '{{first_name}}';

export function personalize(text: string, firstName: string | null): string {
  return text.split(FIRST_NAME_TOKEN).join(firstName?.trim() || 'there');
}

/** Where an email will actually go. In TEST MODE everything is redirected to the test inbox. */
export function resolveRecipient(candidateEmail: string | null, testEmail: string | null | undefined): { deliverTo: string | null; testMode: boolean } {
  if (testEmail) return { deliverTo: testEmail, testMode: true };
  return { deliverTo: candidateEmail, testMode: false };
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Minimal, readable HTML version of a plain-text email. */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 14px;font:15px/1.55 -apple-system,Segoe UI,Arial,sans-serif;color:#1f2937">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export const isEmailAddress = (s: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(s.trim());
