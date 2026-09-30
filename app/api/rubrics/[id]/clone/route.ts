// Start a new DRAFT version from an existing rubric, so an approved rubric is never edited in place.
import * as repo from '@/lib/db/repo';
import { handle, jsonError } from '@/lib/http';

export const POST = handle('rubric.clone', async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const source = await repo.getRubric(id);
  if (!source) return jsonError('Rubric not found.', 404);
  const newId = await repo.createDraftRubric({
    name: `${source.name.replace(/ \(edited from v\d+\)$/, '')} (edited from v${source.version})`,
    source: 'EDIT',
    parent_rubric_id: source.id,
    patterns: source.calibration_patterns,
    model: source.calibration_model,
    criteria: source.criteria.map(({ role, criterion_key, criterion_name, description, observable_evidence, weak_evidence_description, strong_evidence_description, scoring_guidance, weight, sort_order, calibration_rationale }) => ({
      role, criterion_key, criterion_name, description, observable_evidence, weak_evidence_description, strong_evidence_description, scoring_guidance, weight, sort_order, calibration_rationale,
    })),
  });
  await repo.logActivity('RUBRIC_DRAFT_CREATED', { rubric_id: newId, detail: { source: 'EDIT', from_version: source.version } });
  return Response.json({ ok: true, rubricId: newId });
});
