// Approve a DRAFT: it becomes ACTIVE and the previous ACTIVE version is archived. Existing candidate scores keep the
// version they were scored with; nothing is re-scored automatically.
import { z } from 'zod';
import { requireApiSession } from '@/lib/auth/guard';
import * as repo from '@/lib/db/repo';
import { handle, jsonError, readBody } from '@/lib/http';
import { checkRubric } from '@/lib/rubric/validate';

const Body = z.object({ confirmReplace: z.boolean().default(false) });

export const POST = handle('rubric.approve', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const denied = await requireApiSession();
  if (denied) return denied;
  const { id } = await params;
  const body = await readBody(request, Body);
  if ('error' in body) return body.error;
  const rubric = await repo.getRubric(id);
  if (!rubric) return jsonError('Rubric not found.', 404);
  if (rubric.status !== 'DRAFT') return jsonError('Only a DRAFT rubric can be approved.', 409);
  const check = checkRubric(rubric.criteria);
  if (!check.ok) return jsonError(check.problems.join(' '), 422);
  const active = await repo.getActiveRubric();
  if (active && !body.data.confirmReplace) return jsonError(`Version ${active.version} is active. Confirm that version ${rubric.version} should replace it.`, 409);
  await repo.approveRubric(id);
  await repo.logActivity('RUBRIC_APPROVED', { rubric_id: id, detail: { version: rubric.version, replaced_version: active?.version ?? null } });
  return Response.json({ ok: true });
});
