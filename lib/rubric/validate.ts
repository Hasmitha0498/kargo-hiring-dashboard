// Rubric rules shared by the calibration output check, the review screen and the approval step.
import { ROLES, type Role } from '../domain';

export const MIN_CRITERIA = 4;
export const MAX_CRITERIA = 6;

export interface WeightedItem {
  role: Role;
  criterion_key: string;
  weight: number;
}

export interface RubricCheck {
  ok: boolean;
  totals: Record<Role, number>;
  problems: string[];
}

export function checkRubric(criteria: WeightedItem[]): RubricCheck {
  const totals = { PM: 0, SPM: 0 } as Record<Role, number>;
  const problems: string[] = [];
  for (const role of ROLES) {
    const items = criteria.filter((c) => c.role === role);
    const total = Math.round(items.reduce((a, c) => a + Number(c.weight), 0) * 100) / 100;
    totals[role] = total;
    if (items.length < MIN_CRITERIA || items.length > MAX_CRITERIA) problems.push(`${role} needs ${MIN_CRITERIA}-${MAX_CRITERIA} criteria (has ${items.length}).`);
    if (total !== 100) problems.push(`${role} weights total ${total}%, they must total exactly 100%.`);
    if (items.some((c) => !(Number(c.weight) > 0))) problems.push(`${role}: every weight must be above 0.`);
    const keys = items.map((c) => c.criterion_key);
    if (new Set(keys).size !== keys.length) problems.push(`${role}: criterion keys must be unique.`);
  }
  return { ok: problems.length === 0, totals, problems };
}
