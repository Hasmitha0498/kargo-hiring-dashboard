// Founder override of the shortlist recommendation (IN / OUT), or null to follow the recommendation again.
import { z } from 'zod';
import * as repo from '@/lib/db/repo';
import { handle, jsonError, readBody } from '@/lib/http';

const Body = z.object({ override: z.enum(['IN', 'OUT']).nullable() });

export const POST = handle('shortlist.override', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await readBody(request, Body);
  if ('error' in body) return body.error;
  if (!(await repo.getCandidate(id))) return jsonError('Candidate not found.', 404);
  await repo.setShortlistOverride(id, body.data.override);
  await repo.logActivity('SHORTLIST_OVERRIDE', { candidate_id: id, detail: { override: body.data.override } });
  return Response.json({ ok: true });
});
