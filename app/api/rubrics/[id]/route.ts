import * as repo from '@/lib/db/repo';
import { handle, jsonError } from '@/lib/http';

export const DELETE = handle('rubric.delete_draft', async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const rubric = await repo.getRubric(id);
  if (!rubric) return jsonError('Rubric not found.', 404);
  if (rubric.status !== 'DRAFT') return jsonError('Only drafts can be discarded. Approved versions are kept for audit.', 409);
  await repo.deleteDraftRubric(id);
  await repo.logActivity('RUBRIC_DRAFT_DISCARDED', { detail: { version: rubric.version } });
  return Response.json({ ok: true });
});
