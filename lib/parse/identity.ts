// Separates who the candidate is from what they have done. Deterministic code only: identity is found with patterns
// and never sent to an AI model. The professional text that comes out is the only candidate text the AI ever sees.

export interface Identity {
  candidate_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  address: string | null;
  other: Record<string, string>;
}

export interface Separated {
  identity: Identity;
  professionalText: string;
}

export const NAME_PLACEHOLDER = '[Candidate]';
const REDACTED = '[redacted]';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LINKEDIN = /(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/[^\s|,·•;()]+/gi;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s|,·•;()]+/gi;
// Explicit URLs, plus bare domains only when they carry a path (so "B.Com" or "Node.js" are never mistaken for links).
const URL = /(?:https?:\/\/|www\.)[^\s|,·•;()]+|\b[a-z0-9][a-z0-9-]{1,62}\.(?:com|io|dev|me|in|co|net|org|app|site|xyz|ai|page|so|link)\/[^\s|,·•;()]*/gi;
const PHONE_CANDIDATE = /(?<![\w+])\+?\d[\d\s().-]{8,17}\d(?!\w)/g;
const SEPARATORS = /\s*(?:\||·|•|◦|▪|‣|⋅|∙)\s*/;

const PERSONAL_FIELD = /^(address|location|current location|residence|dob|d\.o\.b\.?|date of birth|birth ?date|age|gender|sex|marital status|nationality|religion|father'?s name|mother'?s name|passport(?: no\.?| number)?|pronouns)\s*[:\-–]\s*(.+)$/i;
const SECTION_HEADING = /^(?:professional |career |executive )?(?:summary|profile|experience|work experience|work history|employment|employment history|education|skills|key skills|about(?: me)?|objective|projects|certifications?|achievements)\b/i;
const NOT_A_NAME = /\b(resume|résumé|curriculum|vitae|cv|profile|summary|manager|engineer|product|sales|marketing|consultant|executive|analyst|developer|designer|lead|director|head|officer|associate|saas|b2b|operations|leader)\b/i;
const LOCATION_BLOCKLIST = /\b(certif\w*|member|engineer|manager|product|sales|marketing|saas|b2b|lead|operations|school|university|college|institute|mba|b\.?tech|b\.?e\.?|reforge|award|speaker|years?)\b/i;

function digitsOf(s: string): string {
  return s.replace(/\D/g, '');
}

function isPhone(candidate: string): boolean {
  const d = digitsOf(candidate);
  if (d.length < 10 || d.length > 13) return false;
  // Year ranges such as "2014 2017 2018" are not phone numbers.
  if (/^(?:(?:19|20)\d{2}[\s.-]*){2,}$/.test(candidate.trim())) return false;
  return true;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
}

function looksLikeName(line: string): string | null {
  const cleaned = line.replace(/^name\s*[:\-–]\s*/i, '').trim();
  if (!cleaned || cleaned.length > 50 || /\d|@|\//.test(cleaned)) return null;
  if (SECTION_HEADING.test(cleaned) || NOT_A_NAME.test(cleaned)) return null;
  const tokens = cleaned.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 5) return null;
  if (!tokens.every((t) => /^\p{L}[\p{L}.'’-]*$/u.test(t))) return null;
  if (!tokens.every((t) => /^\p{Lu}/u.test(t))) return null;
  return cleaned === cleaned.toUpperCase() ? titleCase(cleaned) : cleaned;
}

function isLocationLike(piece: string): boolean {
  const p = piece.trim();
  if (!p || p.length > 60) return false;
  if (/\d/.test(p.replace(/\b\d{6}\b/, ''))) return false; // allow an Indian PIN code, nothing else numeric
  if (LOCATION_BLOCKLIST.test(p)) return false;
  const words = p.split(/[\s,/]+/).filter(Boolean);
  return words.length >= 1 && words.length <= 6 && words.every((w) => /^\p{Lu}/u.test(w) || /^(and|&)$/i.test(w));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace the candidate's name (full, first or last) everywhere in the professional text. */
export function redactName(text: string, name: string | null): string {
  if (!name) return text;
  let out = text.replace(new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi'), NAME_PLACEHOLDER);
  const tokens = name.split(/\s+/).filter((t) => t.replace(/\W/g, '').length >= 3);
  for (const t of tokens) {
    // Case-sensitive (Title or UPPER case) so ordinary lower-case words are left alone.
    const variants = [...new Set([t, t.toUpperCase()])].map(escapeRegex).join('|');
    out = out.replace(new RegExp(`(?<![\\p{L}])(?:${variants})(?:'s|’s)?(?![\\p{L}])`, 'gu'), NAME_PLACEHOLDER);
  }
  return out;
}

export function separateIdentity(text: string): Separated {
  const identity: Identity = {
    candidate_name: null,
    email: null,
    phone: null,
    linkedin_url: null,
    github_url: null,
    portfolio_url: null,
    address: null,
    other: {},
  };
  const addressParts: string[] = [];

  const lines = text.split('\n');
  // The header is everything before the first section heading (capped): that is where contact details live.
  let headerEnd = lines.findIndex((l, i) => i > 0 && l.length < 45 && SECTION_HEADING.test(l));
  if (headerEnd === -1 || headerEnd > 12) headerEnd = Math.min(lines.length, 8);

  const out: string[] = [];
  lines.forEach((original, i) => {
    let line = original;
    const inHeader = i < headerEnd;

    const personal = line.match(PERSONAL_FIELD);
    if (personal && line.length < 160) {
      const key = personal[1]!.toLowerCase();
      if (/address|location|residence/.test(key)) addressParts.push(personal[2]!.trim());
      else identity.other[key] = personal[2]!.trim();
      return; // the whole line is personal data
    }

    if (inHeader && !identity.candidate_name) {
      const name = looksLikeName(line);
      if (name) {
        identity.candidate_name = name;
        return;
      }
    }

    let touched = false;
    const take = (re: RegExp, set: (v: string) => void) => {
      line = line.replace(re, (m) => {
        set(m.replace(/[.,;:]+$/, ''));
        touched = true;
        return ' ';
      });
    };
    take(EMAIL, (v) => (identity.email ??= v));
    take(LINKEDIN, (v) => (identity.linkedin_url ??= v));
    take(GITHUB, (v) => (identity.github_url ??= v));
    take(URL, (v) => {
      if (inHeader) identity.portfolio_url ??= v;
      else identity.other[`url_${Object.keys(identity.other).length + 1}`] = v;
    });
    if (inHeader || /\b(phone|mobile|mob|tel|contact|whatsapp)\b/i.test(line)) {
      line = line.replace(PHONE_CANDIDATE, (m) => {
        if (!isPhone(m)) return m;
        identity.phone ??= m.trim();
        touched = true;
        return ' ';
      });
      line = line.replace(/\b(phone|mobile|mob|tel|email|e-mail|linkedin|github|portfolio|website)\s*[:\-–]\s*/gi, (m) => (touched ? '' : m));
    }

    if (touched) {
      // What is left of a contact line is usually a location; anything else (e.g. a certification) stays.
      const kept = line
        .split(SEPARATORS)
        .map((p) => p.trim())
        .filter((p) => p && !/^[|·•,;:\-–—\s]+$/.test(p))
        .filter((p) => {
          if (inHeader && isLocationLike(p)) {
            addressParts.push(p);
            return false;
          }
          return true;
        });
      if (kept.length) out.push(kept.join(' · '));
      return;
    }
    out.push(line);
  });

  // Any contact detail that survived outside the header is removed from the professional text too.
  let professional = out
    .join('\n')
    .replace(EMAIL, REDACTED)
    .replace(LINKEDIN, REDACTED)
    .replace(GITHUB, REDACTED);
  professional = redactName(professional, identity.candidate_name)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  identity.address = addressParts.length ? [...new Set(addressParts)].join(', ') : null;
  return { identity, professionalText: professional };
}

/** First name for email greetings. Falls back to a neutral greeting target when no name was found. */
export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}
