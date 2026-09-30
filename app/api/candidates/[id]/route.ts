// Correct the private details (name / email) found by the parser, or delete a candidate.
import { z } from 'zod';
import * as repo from '@/lib/db/repo';
import { isEmailAddress } from '@/lib/email/compose';
import { handle, jsonError, readBody } from '@/lib/http';

const Patch = z.object({
  candidate_name: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
});

export const PATCH = handle('candidate.patch', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await readBody(request, Patch);
  if ('error' in body) return body.error;
  const { candidate_name, email } = body.data;
  if (email && !isEmailAddress(email)) return jsonError('That does not look like a valid email address.');
  if (!(await repo.getCandidate(id))) return jsonError('Candidate not found.', 404);
  await repo.updatePrivate(id, { ...(candidate_name !== undefined ? { candidate_name: candidate_name || null } : {}), ...(email !== undefined ? { email: email || null } : {}) });
  await repo.logActivity('PRIVATE_DETAILS_EDITED', { candidate_id: id, detail: { fields: Object.keys(body.data) } });
  return Response.json({ ok: true });
});

export const DELETE = handle('candidate.delete', async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const c = await repo.getCandidate(id);
  if (!c) return jsonError('Candidate not found.', 404);
  await repo.deleteCandidate(id);
  await repo.recomputeRanks(c.applied_role);
  await repo.logActivity('CANDIDATE_DELETED', { detail: { applied_role: c.applied_role } });
  return Response.json({ ok: true });
});
