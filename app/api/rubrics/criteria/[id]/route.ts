// Edit a criterion of a DRAFT rubric (description / evidence definitions / weight). Approved rubrics are immutable.
import { z } from 'zod';
import * as repo from '@/lib/db/repo';
import { handle, jsonError, readBody } from '@/lib/http';

const Body = z
  .object({
    description: z.string().trim().min(10).max(1000).optional(),
    strong_evidence_description: z.string().trim().min(5).max(800).optional(),
    weak_evidence_description: z.string().trim().min(5).max(800).optional(),
    observable_evidence: z.string().trim().min(10).max(1000).optional(),
    scoring_guidance: z.string().trim().min(10).max(1500).optional(),
    weight: z.number().min(1).max(100).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

export const PATCH = handle('rubric.edit_criterion', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await readBody(request, Body);
  if ('error' in body) return body.error;
  try {
    const rubricId = await repo.updateDraftCriterion(id, { ...body.data, ...(body.data.weight !== undefined ? { weight: Math.round(body.data.weight * 100) / 100 } : {}) });
    await repo.logActivity('RUBRIC_DRAFT_EDITED', { rubric_id: rubricId, detail: { fields: Object.keys(body.data) } });
  } catch (error) {
    if (error instanceof Error && /DRAFT|not found/.test(error.message)) return jsonError(error.message, 409);
    throw error;
  }
  return Response.json({ ok: true });
});
