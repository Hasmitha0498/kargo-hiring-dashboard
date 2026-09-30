// Save the founder's edits to the email draft. Saving never sends.
import { z } from 'zod';
import * as repo from '@/lib/db/repo';
import { handle, jsonError, readBody } from '@/lib/http';

const Body = z.object({
  email_type: z.enum(['INTERVIEW_INVITE', 'WARM_REJECTION']),
  subject: z.string().trim().min(1, 'Subject is empty').max(200),
  body: z.string().trim().min(1, 'Body is empty').max(5000),
  reset: z.boolean().optional(),
});

export const PUT = handle('draft.save', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await readBody(request, Body);
  if ('error' in body) return body.error;
  const outputs = (await repo.getOutputs([id]))[0];
  if (!outputs) return jsonError('No draft exists yet for this candidate.', 404);
  await repo.saveEmailDraft(id, { email_type: body.data.email_type, email_subject: body.data.subject, email_body: body.data.body });
  return Response.json({ ok: true });
});
