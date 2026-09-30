// Explicit, human-triggered calibration. Produces a NEW DRAFT rubric version; nothing changes for scoring until the
// founder reviews and approves it on the Rubric page.
import { z } from 'zod';
import { calibrateRubric, hireLabel } from '@/lib/ai/calibrate';
import { defaultAiContext } from '@/lib/ai/default-context';
import { requireApiSession } from '@/lib/auth/guard';
import * as repo from '@/lib/db/repo';
import { OUTCOME_LABEL, ROLES } from '@/lib/domain';
import { handle, jsonError, readBody } from '@/lib/http';
import { friendlyError } from '@/lib/pipeline/process';

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z.object({ confirm: z.literal(true) });

export const POST = handle('calibration.generate', async (request: Request) => {
  const denied = await requireApiSession();
  if (denied) return denied;
  const body = await readBody(request, Body);
  if ('error' in body) return jsonError('Calibration must be confirmed explicitly.');

  const [profiles, hires] = await Promise.all([repo.getRoleProfiles(), repo.listCalibrationHires()]);
  const roles = ROLES.map((role) => profiles.find((p) => p.role === role));
  if (roles.some((r) => !r)) return jsonError('Add both job descriptions (PM and SPM) before calibrating.');

  const labelled = hires.map((h, i) => ({ id: h.id, input: { label: hireLabel(i), roleHired: h.role_hired, outcome: OUTCOME_LABEL[h.performance_outcome], professionalText: h.professional_text, notes: h.notes } }));
  let result;
  try {
    result = await calibrateRubric(defaultAiContext(), roles.map((r) => ({ role: r!.role, title: r!.title, jd: r!.jd_text })), labelled.map((l) => l.input));
  } catch (error) {
    await repo.logActivity('CALIBRATION_FAILED', { detail: { error: friendlyError(error) } });
    return jsonError(friendlyError(error), 502);
  }
  const { data, model } = result;
  const toRows = (role: 'PM' | 'SPM', items: typeof data.pm.criteria) =>
    items.map((c, i) => ({
      role,
      criterion_key: c.criterion_key,
      criterion_name: c.criterion_name,
      description: c.description,
      observable_evidence: c.observable_evidence,
      weak_evidence_description: c.weak_evidence,
      strong_evidence_description: c.strong_evidence,
      scoring_guidance: c.scoring_guidance,
      weight: c.weight,
      sort_order: i,
      calibration_rationale: c.calibration_rationale,
    }));
  const id = await repo.createDraftRubric({
    name: `Calibrated rubric (${labelled.length} past hires)`,
    source: 'CALIBRATION',
    patterns: data.patterns,
    model,
    criteria: [...toRows('PM', data.pm.criteria), ...toRows('SPM', data.spm.criteria)],
    calibrationHireIds: labelled.map((l) => l.id),
  });
  await repo.markHiresUsed(labelled.map((l) => l.id));
  await repo.logActivity('RUBRIC_DRAFT_CREATED', { rubric_id: id, detail: { source: 'CALIBRATION', hires: labelled.length, model } });
  return Response.json({ ok: true, rubricId: id });
});
