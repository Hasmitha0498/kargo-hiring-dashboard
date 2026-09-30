// Add a past hire (calibration data). The CV is parsed and its identity removed exactly like a candidate's; only the
// identity-free text is ever sent to the AI during calibration.
import { requireApiSession } from '@/lib/auth/guard';
import * as repo from '@/lib/db/repo';
import { OUTCOMES, type Outcome } from '@/lib/domain';
import { handle, jsonError } from '@/lib/http';
import { extractText, ParseError } from '@/lib/parse/extract-text';
import { separateIdentity } from '@/lib/parse/identity';

export const runtime = 'nodejs';

export const POST = handle('calibration.add_hire', async (request: Request) => {
  const denied = await requireApiSession();
  if (denied) return denied;
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const roleHired = String(form?.get('role_hired') ?? '').trim();
  const outcome = String(form?.get('performance_outcome') ?? '') as Outcome;
  const label = String(form?.get('private_label') ?? '').trim();
  const notes = String(form?.get('notes') ?? '').trim();
  if (!(file instanceof File)) return jsonError('Attach the past hire’s CV or profile.');
  if (!roleHired) return jsonError('Enter the role they were hired into.');
  if (!OUTCOMES.includes(outcome)) return jsonError('Choose a performance outcome.');
  try {
    const { text } = await extractText(file.name, new Uint8Array(await file.arrayBuffer()));
    const { identity, professionalText } = separateIdentity(text);
    const id = await repo.insertCalibrationHire({
      private_label: label || identity.candidate_name || file.name,
      role_hired: roleHired.slice(0, 120),
      performance_outcome: outcome,
      original_file_name: file.name.slice(0, 200),
      professional_text: professionalText,
      notes: notes ? notes.slice(0, 2000) : null,
    });
    await repo.logActivity('CALIBRATION_HIRE_ADDED', { detail: { role_hired: roleHired, outcome } });
    return Response.json({ ok: true, id });
  } catch (error) {
    if (error instanceof ParseError) return jsonError(error.message);
    throw error;
  }
});
