// The founder's decision. Stored as a new row next to (never over) the system suggestion. Sends nothing.
import { z } from 'zod';
import * as repo from '@/lib/db/repo';
import { emailTypeForDecision } from '@/lib/domain';
import { handle, jsonError, readBody } from '@/lib/http';
import { suggestedActionFor } from '@/lib/pipeline/process';

const Body = z.object({ decision: z.enum(['UNDECIDED', 'INTERVIEW', 'REJECT', 'HOLD']), notes: z.string().trim().max(2000).optional() });

export const POST = handle('decision.save', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await readBody(request, Body);
  if ('error' in body) return body.error;
  const candidate = await repo.getCandidate(id);
  if (!candidate) return jsonError('Candidate not found.', 404);
  const rank = (await repo.getRoleScores([id])).find((r) => r.role === candidate.applied_role)?.rank;
  const scored = rank !== undefined;
  const ai = scored ? suggestedActionFor(rank) : null;
  await repo.addDecision({ candidate_id: id, ai_suggested_action: ai, founder_decision: body.data.decision, decision_notes: body.data.notes || null });

  // Show the matching draft. Switching type resets the editable draft to the AI draft of that type.
  const type = emailTypeForDecision(body.data.decision);
  const outputs = (await repo.getOutputs([id]))[0];
  if (type && outputs && outputs.email_type !== type) {
    await repo.saveEmailDraft(id, {
      email_type: type,
      email_subject: type === 'INTERVIEW_INVITE' ? outputs.invite_subject : outputs.rejection_subject,
      email_body: type === 'INTERVIEW_INVITE' ? outputs.invite_body : outputs.rejection_body,
    });
  }
  await repo.logActivity('FOUNDER_DECISION', { candidate_id: id, detail: { decision: body.data.decision, ai_suggested_action: ai, overrides_ai: Boolean(ai && body.data.decision !== 'UNDECIDED' && body.data.decision !== 'HOLD' && body.data.decision !== ai) } });
  return Response.json({ ok: true });
});
