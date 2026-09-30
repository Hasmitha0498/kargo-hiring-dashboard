// CONFIRM & SEND. The only place an email can leave the system. Requires: a founder decision of Interview or Reject,
// a draft of the matching type, explicit confirmation, and no email already sending/sent for this candidate.
import { z } from 'zod';
import * as repo from '@/lib/db/repo';
import { emailTypeForDecision } from '@/lib/domain';
import { env } from '@/lib/env';
import { isEmailAddress, personalize, resolveRecipient } from '@/lib/email/compose';
import { EmailSendError, sendViaResend } from '@/lib/email/resend';
import { handle, jsonError, readBody } from '@/lib/http';
import { log } from '@/lib/log';
import { firstName } from '@/lib/parse/identity';

export const runtime = 'nodejs';

const Body = z.object({
  confirm: z.literal(true),
  email_type: z.enum(['INTERVIEW_INVITE', 'WARM_REJECTION']),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

const STALE_SENDING_MS = 10 * 60_000;

export const POST = handle('email.send', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const parsed = await readBody(request, Body);
  if ('error' in parsed) return jsonError('Sending needs explicit confirmation from the Confirm & Send dialog.');
  const { email_type, subject, body } = parsed.data;

  const candidate = await repo.getCandidate(id);
  if (!candidate) return jsonError('Candidate not found.', 404);
  const decision = (await repo.getDecisions([id]))[0]?.founder_decision ?? 'UNDECIDED';
  const expected = emailTypeForDecision(decision);
  if (!expected) return jsonError('Record a founder decision (Interview or Reject) before sending.', 409);
  if (expected !== email_type) return jsonError('The draft type does not match your decision. Reload the page and review the draft again.', 409);

  // Keep the founder's final text even if sending fails.
  await repo.saveEmailDraft(id, { email_type, email_subject: subject, email_body: body });

  const priv = await repo.getPrivate(id);
  const testEmail = env.resendTestEmail();
  const { deliverTo, testMode } = resolveRecipient(priv?.email ?? null, testEmail);
  if (!deliverTo || !isEmailAddress(deliverTo)) return jsonError('No valid candidate email address. Add one in the candidate details first.', 409);

  const finalSubject = personalize(subject, firstName(priv?.candidate_name));
  const finalBody = personalize(body, firstName(priv?.candidate_name));
  const row = { candidate_id: id, recipient: deliverTo, intended_recipient: priv?.email ?? null, test_mode: testMode, message_type: email_type, subject: finalSubject, body: finalBody };

  let eventId = await repo.claimEmailSend(row);
  if (!eventId) {
    const live = (await repo.getEmailEvents([id])).find((e) => e.status === 'SENDING' || e.status === 'SENT');
    if (live?.status === 'SENDING' && Date.now() - new Date(live.created_at).getTime() > STALE_SENDING_MS) {
      await repo.finishEmailSend(live.id, { status: 'FAILED', error_message: 'Interrupted before Resend confirmed delivery.' });
      eventId = await repo.claimEmailSend(row);
    }
    if (!eventId) return jsonError(live?.status === 'SENT' ? 'An email has already been sent to this candidate. Duplicate sends are blocked.' : 'An email to this candidate is already being sent.', 409);
  }

  try {
    const providerId = await sendViaResend({ to: deliverTo, subject: finalSubject, text: finalBody, idempotencyKey: `kargo-email-${eventId}` });
    await repo.finishEmailSend(eventId, { status: 'SENT', provider_message_id: providerId });
    await repo.setStatus(id, 'EMAIL_SENT');
    await repo.logActivity('EMAIL_SENT', { candidate_id: id, detail: { message_type: email_type, test_mode: testMode, provider_message_id: providerId } });
    log.info('email.sent', { candidateId: id, eventId, testMode });
    return Response.json({ ok: true, providerMessageId: providerId, testMode });
  } catch (error) {
    const message = error instanceof EmailSendError ? error.message : 'Unexpected error while sending.';
    await repo.finishEmailSend(eventId, { status: 'FAILED', error_message: message });
    await repo.logActivity('EMAIL_FAILED', { candidate_id: id, detail: { message_type: email_type, error: message } });
    return jsonError(`${message} Your draft is saved; you can retry.`, 502);
  }
});
