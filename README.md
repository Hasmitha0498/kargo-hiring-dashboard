# Kargo Hiring Dashboard

Evidence-based decision support for hiring **Product Managers (PM)** and **Senior Product Managers (SPM)**.

> **AI recommends. The human decides.** The system extracts, scores, ranks, explains, briefs and drafts. It never makes a hiring decision, never sends an email on its own, and never moves a candidate between roles.

---

## 1. Business problem

A Series A founder with no HR function is the hiring manager for two open product roles. Eleven weeks in: sixty applications, nineteen opened, zero offers. Every review starts from scratch, late at night, on instinct, with no record of why anyone was shortlisted or passed over. Candidates who were not moved forward never heard back.

The deeper issue: the founder evaluates CVs against the job spec, but **the spec describes the role; it does not predict who succeeds in it.** His strongest past hires shared something the spec never asked for. This product surfaces that pattern once (calibration), turns it into an explicit rubric the founder approves, and applies it consistently to every new CV with the evidence shown.

## 2. Product flow

1. The founder opens the site. It goes straight to the **Dashboard** (`/` → `/dashboard`); there is no login (see §17a).
2. **Upload Candidate**: choose the applied role (PM / SPM), drop one or more CVs (PDF, DOCX, TXT).
3. Pipeline (progress streamed live): Reading CV → Separating personal details → Evaluating Product Manager evidence → Evaluating Senior Product Manager evidence → Calculating scores → Preparing interview brief → Preparing email draft. If a step fails, the page names it and offers **Retry Scoring**; the CV is never re-uploaded.
4. **Dashboard**: PM and SPM ranked lists (each ranks only applicants for that role, by that role's score). The top 5 are marked *Shortlist recommended*, which is a recommendation only.
5. **Candidate detail**: both scores, every criterion with raw score, weight, weighted points, CV evidence and reasoning; cross-role view; interview brief; email draft.
6. Founder decides (**Interview / Hold / Reject**, no default), optionally overrides the shortlist. The matching email appears only after a decision, marked *DRAFT — NOT SENT*; the founder edits it and clicks **Confirm & Send**, then **Send Email** in a confirmation dialog that shows exactly who receives it. Hold needs no email.
7. Resend delivers (to the test inbox in TEST MODE). The event, provider message id and timestamp are stored.

## 3. Calibration vs runtime evaluation

These are two separate stages with separate tables and code paths.

| | Calibration (admin, on request) | Runtime (every new CV) |
|---|---|---|
| Input | Past hires + performance outcomes + both JDs | One new CV |
| AI sees | Identity-free hire profiles labelled *Hire A, Hire B…*, outcomes, JDs | Identity-free professional CV text + the ACTIVE PM and SPM rubrics. Nothing else |
| Output | A **DRAFT** rubric version (patterns + 4–6 criteria per role) | Criterion raw scores + evidence + reasoning |
| Changes scoring? | Only after the founder reviews and **approves** it | No, it never changes the rubric |

- Historical hires are **calibration data**; uploaded CVs are **runtime candidates**. The runtime prompt builder (`lib/ai/prompts.ts → evaluationUser`) only accepts rubric criteria and CV text, so calibration data cannot reach it. There is no nearest-neighbour or "resembles hire X" logic anywhere.
- **No continuous self-learning.** New uploads and founder decisions never retrain or modify the rubric. Recalibration happens only when an admin clicks *Recalibrate Rubric* and then explicitly approves the new version.
- A test (`tests/security.test.ts`) fails if any application source file mentions a calibration hire by name.

## 4. Architecture

```
              CALIBRATION

Historical hires + outcomes + JDs
                |
                v
      Pattern identification
                |
                v
         PM/SPM Rubrics
                |
                v
      Approved Rubric Version
                |
                |
                v

               RUNTIME

       New Candidate CV
                |
                v
             Parser
                |
         +------+------+
         |             |
         v             v
      Identity     Professional CV
      Private           |
         |              v
         |        Gemini Evaluation
         |            /      \
         |           v        v
         |       PM Score   SPM Score
         |            \      /
         |             v    v
         |            Ranking
         |               |
         +-------------->|
                         v
                Interview Brief
                         |
                         v
                    Email Draft
                         |
                         v
                  Founder Review
                         |
                         v
                  Human Decision
                         |
                         v
                   Confirm Send
                         |
                         v
                      Resend
```

Code map:

| Path | Responsibility |
|---|---|
| `lib/parse/extract-text.ts` | PDF (unpdf), DOCX (mammoth), TXT → text; typed, user-readable errors |
| `lib/parse/identity.ts` | Deterministic identity separation (no AI) |
| `lib/ai/prompts.ts` | All prompts; runtime prompt built from the DB rubric |
| `lib/ai/schemas.ts` | Zod + JSON schemas; evaluation schema generated from the active criterion keys |
| `lib/ai/gemini.ts` | Gemini client: JSON mode, Zod validation, retries with validation feedback, model fallback |
| `lib/ai/evaluate.ts` / `outputs.ts` / `calibrate.ts` | The three AI steps |
| `lib/scoring/calculate.ts` | Weighted scores, totals, ranking, shortlist, strongest evidence / primary gap |
| `lib/pipeline/process.ts` | Stage orchestration, status updates, resumable retries |
| `lib/db/repo.ts` | All database access (server-only, service role) |
| `app/api/candidates/[id]/send` | **The only code path that can send an email** (enforced by a test) |

## 5. Tech stack

Next.js 16 (App Router, route handlers, streaming) · TypeScript · Tailwind CSS 4 · Supabase (Postgres) · Gemini (`@google/genai`, structured JSON output) · Zod 4 · Resend (REST API) · Vercel · Vitest + PGlite for tests.

## 6. Database schema

`supabase/migrations/0001_init.sql` (single file, run once). RLS is enabled on every table with no policies, so the public key can read nothing. The app uses the service role key on the server only.

**Calibration:** `role_profiles` (JDs) · `calibration_hires` (private label, role hired, outcome, identity-free text, `last_used_at`) · `rubrics` (`version`, `status` DRAFT/ACTIVE/ARCHIVED, `calibration_patterns`, `approved_at`; unique index guarantees one ACTIVE) · `rubric_criteria` (key, name, role, description, observable evidence, weak/strong evidence, scoring guidance, weight, sort order, calibration rationale) · `rubric_calibration_sources`.

**Runtime:** `candidates` (applied role, file name, professional text, processing status, failed stage, shortlist override) · `candidate_private` (name, email, phone, LinkedIn, GitHub, portfolio, address, other personal fields) · `evaluations` (candidate, rubric id + version, model, prompt version, timestamp) · `candidate_scores` (per criterion: raw score, weight, weighted score, evidence, evidence status, evidence verified, reasoning, model, rubric version) · `candidate_role_scores` (current PM and SPM totals + rank) · `candidate_outputs` (brief, uncertainty, probe, suggested action, AI invite + rejection drafts, the founder's editable draft) · `founder_decisions` (append-only; AI suggestion and founder decision in separate columns) · `email_events` (recipient, intended recipient, test mode, type, subject, body, provider id, status, sent_at; a unique partial index allows only one SENDING/SENT email per candidate) · `activity_log`.

Postgres functions: `activate_rubric` (checks both roles total 100%, archives the old ACTIVE, activates the draft in one transaction) · `record_evaluation` (writes an evaluation, all criterion scores and both totals atomically) · `recompute_ranks` (competition ranking on totals rounded to one decimal, so displayed ties share a rank; cross-role scores are not ranked).

## 7. Rubric design

- Calibration asks Gemini to compare *Exceeds* hires with *Meets/Below* hires and find **2–3 recurring patterns of observable professional evidence**, explicitly **not** years of experience, title, college, employer prestige, age, gender, location, certifications or keywords the JDs already demand.
- The patterns become **4–6 PM** and **4–6 SPM** criteria. Each has a key, name, description, what counts as evidence, weak and strong evidence definitions, scoring guidance, a weight and a calibration rationale (which cites hires only as *Hire A/B…*). PM and SPM may share dimensions with different weights and a higher SPM bar (independence, ambiguity, decision quality, consequences, scale, cross-functional ownership).
- **Review before use:** a generated rubric is a DRAFT. On the Rubric page the founder can edit descriptions, strong/weak evidence and weights (live validation that each role totals 100%) and then approve. Approving replaces the ACTIVE version only after a confirmation dialog.
- **Versioning:** approved rubrics are immutable. *Create new version from this* clones to a new DRAFT. Every score row records `rubric_id` and `rubric_version`. Existing candidates are never silently re-scored: the dashboard flags candidates scored on an older version, and *Re-evaluate with vN* creates a new evaluation while keeping the old one for audit.

## 8. Scoring calculation

The AI returns only a raw score per criterion on one shared scale:

| Raw | Meaning |
|---|---|
| 0 | No relevant evidence |
| 1 | Very weak / claim-level evidence |
| 2 | Some relevant evidence, but ownership, complexity or outcome is unclear |
| 3 | Clear evidence of ownership and outcome |
| 4 | Strong evidence of ownership in a complex/ambiguous context with meaningful observable consequences |

Application code (not the AI) then computes:

```
weighted_score = (raw_score / 4) × weight
role_score     = Σ weighted_score        (max 100, displayed to 1 decimal)
```

Weights are not shown to the model, so it cannot game the total. Each criterion also carries an `evidence_status` (PRESENT / ABSENT / NEGATIVE), which separates *no evidence* from *contrary evidence*: absence is never treated as inability. Quoted evidence is checked against the CV text, and a quote that cannot be found verbatim is flagged *Not found verbatim* in the UI.

Every candidate is scored against **both** rubrics. They are ranked only in the role they applied for; the other score is shown as information.

**Strongest evidence** = the criterion that earned the most points. **Primary gap** = the criterion that lost the most points. Both are computed in code.

**Shortlist:** the top 5 per role (ties at the boundary included) are *Shortlist recommended*. The founder can accept, reject, add or remove; overrides are stored separately.

## 9. Privacy model

```
CV → parser → Identity (name, email, phone, LinkedIn, GitHub, portfolio, address, DOB/gender/etc.) → candidate_private
            → Professional text (name replaced by [Candidate], contacts [redacted])  → AI
```

- Identity separation is deterministic code (`lib/parse/identity.ts`), so no AI model ever sees a candidate's name, email or phone.
- The interview brief and email drafts are generated from the structured scores only (no CV, no identity). The email uses a `{{first_name}}` placeholder that the app fills from the private record after generation.
- Candidate emails are validated to never mention scores, rankings, shortlists, rubrics or criteria.
- Logs contain IDs and stages only; a scrubber removes emails, phone numbers and API keys from any logged string. CV text is never logged.
- The founder can view the exact professional text sent to the AI on each candidate page.
- Original files are not stored; only the extracted text is kept.

## 10. Gemini integration

- `@google/genai` with `responseMimeType: application/json` and a JSON schema. For evaluation, the schema's `criterion_key` enum and array length are generated from the ACTIVE rubric, so criteria cannot be dropped or invented.
- Every response is validated again with **Zod** (all criteria exactly once, no extras, score 0–4 integer, score ≥ 2 requires present evidence, etc.).
- On validation failure the next attempt tells the model exactly what was wrong. It makes 2 attempts on `GEMINI_MODEL`, then 2 on `GEMINI_FALLBACK_MODEL`, with rate-limit-aware backoff.
- If everything fails, the candidate is kept with status `AI_FAILED` and the failed stage, and the UI shows **Retry**, which resumes from that stage.
- One evaluation call per candidate covers both rubrics (half the quota of two calls, and the model sees how the SPM bar differs). Temperature is 0.1.

## 11. Resend integration

- Drafts: an interview invite and a warm rejection are generated for every candidate. The draft shown follows the founder's decision (or the system suggestion until one is made).
- Sending requires: a founder decision of *Interview* or *Reject*, a matching draft, the **Confirm & Send** dialog (the API rejects requests without `confirm: true`), and no previous SENDING/SENT email for that candidate (a DB unique index blocks duplicates).
- An `Idempotency-Key` header makes network retries safe. Failures are stored (status FAILED, error message), the draft is kept, and the founder can retry.
- **TEST MODE**: when `RESEND_TEST_EMAIL` is set, every email is delivered to that inbox. The UI shows *TEST MODE · Actual candidate: … · Email delivered to: …* in a banner, the draft panel and the confirmation dialog.

## 12. Environment variables

See `.env.example`.

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (used server-side only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only DB key. Never exposed to the browser |
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL` | Default `gemini-3.5-flash` (`npm run gemini:models` lists what your key can use) |
| `GEMINI_FALLBACK_MODEL` | Optional, default `gemini-3.1-flash-lite` |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | Sender. `onboarding@resend.dev` works without a domain but only delivers to your Resend account email |
| `RESEND_TEST_EMAIL` | TEST MODE inbox. Keep it set for demos |
| `COMPANY_NAME`, `SENDER_NAME`, `SENDER_TITLE` | Optional email signature |

`.env` and `.env.local` are gitignored. So is `calibration-data/` (historical hire files).

## 13. Local setup

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```

## 14. Supabase setup

1. Create a project at supabase.com.
2. **SQL Editor → New query** → paste all of `supabase/migrations/0001_init.sql` → **Run**.
3. **Project Settings → API**: copy the Project URL to `NEXT_PUBLIC_SUPABASE_URL` and the `service_role` secret to `SUPABASE_SERVICE_ROLE_KEY`.
4. Load calibration data: put past-hire files and the two JDs in `calibration-data/` with a `manifest.json` (format in `scripts/seed-calibration.ts`), then run `npm run seed:calibration`. Alternatively, add hires and paste JDs on the **Calibration** page.
5. In the app: **Calibration → Generate Rubric** → **Rubric → review → Approve**. Candidates can now be scored.

## 15. Vercel deployment

1. Push to GitHub and import the repo in Vercel (framework: Next.js).
2. Add every variable from §12 under **Settings → Environment Variables** (Production + Preview).
3. Deploy. Upload and calibration routes set `maxDuration = 300` s (Fluid compute). Uploads are capped at 4 MB, under Vercel's request body limit.

## 16. Testing

```bash
npm test          # unit + database tests (no network, no secrets)
npm run check     # lint + typecheck + tests + production build
```

- `tests/scoring.test.ts`: weighted-score maths, totals, ties, shortlist, strongest/gap, rubric weight validation, evidence grounding.
- `tests/parse.test.ts`: real PDF/DOCX/TXT extraction; scanned/empty/corrupt/unsupported files; identity separation.
- `tests/ai.test.ts`: evaluation schema rejects missing/extra criteria and bad scores; weights applied in code; retry with validation feedback and fallback model; typed failures; runtime prompt contains only rubric and CV; candidate emails cannot leak scores or rankings.
- `tests/security.test.ts`: TEST MODE routing, only the send route calls Resend, log scrubbing, no historical names in source.
- `tests/migration.test.ts`: runs the real migration in PGlite, covering the 100% weight check, single ACTIVE rubric, versioned scores, per-role ranking with ties, audit trail on re-evaluation, duplicate-send guard, RLS on every table.

End-to-end acceptance (live Supabase + Gemini + Resend) is described in `docs/ACCEPTANCE.md`.

## 17a. Access model (demo)

For the assignment demo the site is intentionally **open: no login**, so an evaluator can use it without credentials. Secrets are still server-only (Supabase service key, Gemini and Resend keys never reach the browser, verified by scanning the production bundle).

Consequences to be aware of: anyone with the URL can view candidates (including their contact details), record decisions, send emails and run calibration. TEST MODE (`RESEND_TEST_EMAIL`) keeps every email in the test inbox, and the demo uses invented candidates with `@example.com` addresses. For real use, put the app behind authentication (e.g. Vercel Deployment Protection or an auth provider) before loading real CVs.

## Routes

| Route | Purpose |
|---|---|
| `/` | Redirects to `/dashboard` |
| `/dashboard` | PM / SPM ranked lists (`?role=SPM`) |
| `/upload` | Upload + live analysis |
| `/candidates/[id]` | Summary → why ranked here → brief → decision → email |
| `/rubric` | How candidates are evaluated (plain language) |
| `/calibration` | Rubric setup, draft review/approval, versions (admin, linked from the rubric page) |
| `/activity` | Founder-facing history with All / Uploads / Decisions / Emails filters |

## 17. Human decision boundary

| AI may | AI may not |
|---|---|
| Extract, score, rank, explain | Make the hiring decision |
| Generate the interview brief | Send any email automatically |
| Draft invite and rejection emails | Reject or invite automatically |
| Suggest *Interview* (top 5) or *Reject* | Move a candidate between roles |

The AI suggestion and the founder decision are stored in separate columns of an append-only table, so overriding never erases the suggestion. The shortlist override is separate again. Email sending is reachable only from the Confirm & Send dialog.
