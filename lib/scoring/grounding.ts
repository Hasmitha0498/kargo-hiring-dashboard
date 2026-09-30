// Checks that the evidence the AI quotes actually appears in the CV text. A failed check does not change the score;
// it is shown to the founder as a warning so a paraphrased or invented quote is never mistaken for a real one.

/** Words for display-level splitting. */
const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}%₹$]+/gu) ?? [];

/**
 * Letters and digits only, no spaces: PDF exports often hard-wrap mid-word ("co\nnfigurable"), so comparing without
 * any whitespace or punctuation is what makes a verbatim quote match its source.
 */
const squash = (s: string) => words(s).join('');

/** Splits evidence into the quoted fragments the model was asked to use (joined with " … " or ";"). */
export function evidenceFragments(evidence: string): string[] {
  return evidence
    .split(/\s*(?:…|\.\.\.|;|\n| \| )\s*/)
    .map((f) => f.trim())
    .filter((f) => words(f).length > 0);
}

export function isEvidenceGrounded(evidence: string, cvText: string): boolean {
  const fragments = evidenceFragments(evidence);
  if (fragments.length === 0) return false;
  const haystack = squash(cvText);
  return fragments.every((f) => {
    const needle = squash(f);
    // Very short fragments (a single skill word) are checked as whole words so "AI" doesn't match "maintain".
    if (words(f).length < 3) return words(f).every((w) => words(cvText).includes(w));
    return haystack.includes(needle);
  });
}
