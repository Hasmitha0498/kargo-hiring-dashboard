// Resend API call. Used ONLY from the Confirm & Send route, after explicit founder confirmation.
import 'server-only';
import { env } from '../env';
import { textToHtml } from './compose';

export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailSendError';
  }
}

export async function sendViaResend(input: { to: string; subject: string; text: string; idempotencyKey: string }): Promise<string> {
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey()}`,
        'Content-Type': 'application/json',
        // Resend drops a repeated request with the same key, so a network retry cannot send twice.
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({ from: env.resendFrom(), to: [input.to], subject: input.subject, text: input.text, html: textToHtml(input.text) }),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
  } catch (error) {
    throw new EmailSendError(error instanceof Error && error.name === 'TimeoutError' ? 'Resend did not respond within 20 seconds.' : 'Could not reach Resend (network error).');
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok || !body.id) {
    const hint =
      res.status === 401 || res.status === 403
        ? ' Check RESEND_API_KEY, and that RESEND_FROM_EMAIL uses a verified domain (or onboarding@resend.dev, which can only send to your own Resend account email).'
        : res.status === 429
          ? ' Rate limited: wait a moment and retry.'
          : '';
    throw new EmailSendError(`Resend refused the email (${res.status}${body.message ? `: ${body.message.slice(0, 200)}` : ''}).${hint}`);
  }
  return body.id;
}
