// Checks that the evidence the AI quotes actually appears in the CV text. A failed check does not change the score;
// it is shown to the founder as a warning so a paraphrased or invented quote is never mistaken for a real one.

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"'‘’`]/g, '')
    .replace(/[^\p{L}\p{N}%₹$]+/gu, ' ')
    .trim();

/** Splits evidence into the quoted fragments the model was asked to use (joined with " … " or ";"). */
export function evidenceFragments(evidence: string): string[] {
  return evidence
    .split(/\s*(?:…|\.\.\.|;|\n| \| )\s*/)
    .map((f) => f.trim())
    .filter((f) => norm(f).split(' ').length >= 4);
}

export function isEvidenceGrounded(evidence: string, cvText: string): boolean {
  const fragments = evidenceFragments(evidence);
  if (fragments.length === 0) return false;
  const haystack = norm(cvText);
  return fragments.every((f) => haystack.includes(norm(f)));
}
