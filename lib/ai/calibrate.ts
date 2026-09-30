// Calibration (admin only): past hires + outcomes + JDs -> success patterns -> draft PM/SPM rubric.
// Hires are passed as anonymous labels; their names never reach the model.
import type { Role } from '../domain';
import type { AiContext } from './context';
import { generateJsonWithModel } from './gemini';
import { CALIBRATION_SYSTEM, calibrationUser, type CalibrationHireInput } from './prompts';
import { calibrationJsonSchema, calibrationSchema, type CalibrationOutput } from './schemas';

export function hireLabel(index: number): string {
  let n = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Hire ${label}`;
}

export async function calibrateRubric(
  ctx: AiContext,
  roles: { role: Role; title: string; jd: string }[],
  hires: CalibrationHireInput[],
): Promise<{ data: CalibrationOutput; model: string }> {
  if (hires.length < 3) throw new Error('Calibration needs at least 3 past hires with outcomes.');
  if (!hires.some((h) => /exceeds/i.test(h.outcome)) || !hires.some((h) => !/exceeds/i.test(h.outcome))) {
    throw new Error('Calibration needs both higher performers (Exceeds) and others (Meets / Below) to compare.');
  }
  return generateJsonWithModel(
    ctx.transport,
    {
      label: 'calibrate_rubric',
      models: ctx.models,
      system: CALIBRATION_SYSTEM,
      parts: [{ text: calibrationUser(roles, hires) }],
      jsonSchema: calibrationJsonSchema,
      schema: calibrationSchema,
      temperature: 0.2,
    },
    { ...ctx.retry, attemptsPerModel: 3 },
  );
}
