# Application audit (1 Oct 2026)

Status of each area **before** this round of changes, and what was done. "After" is the state now deployed.

| # | Area | Before | What changed | After |
|---|---|---|---|---|
| 1 | Routes | UNNECESSARILY COMPLEX: login gate, `/` was the dashboard, Calibration in main nav | Login removed; `/` → `/dashboard`; nav = Dashboard, Upload Candidate, Hiring Rubric, Activity; Calibration is a secondary admin page linked from Hiring Rubric | WORKING |
| 2 | Database tables | WORKING (14 tables, RLS on) | No schema change needed; no orphaned records found (every scored candidate has scores, criterion rows and outputs) | WORKING |
| 3 | API routes | WORKING, but every route checked a session | Session checks removed; all AI / DB / email calls still server-side | WORKING |
| 4 | CV upload flow | PARTIAL: plain file input, technical wording, no success/next-step screen | Three numbered steps, large role cards, drag & drop, "Analyse Candidate" disabled until role + file, success screen (View Candidate / Back to Dashboard) | WORKING |
| 5 | CV parsing | WORKING (PDF/DOCX/TXT, clear errors) | — | WORKING |
| 6 | Personal-data separation | WORKING (deterministic, name/email/phone never sent to AI) | UI now shows one short reassurance line instead of implementation detail | WORKING |
| 7 | Gemini scoring | WORKING (Zod-validated, temperature 0) | — | WORKING |
| 8–9 | PM / SPM scoring | WORKING: every candidate scored on both | — | WORKING |
| 10 | Ranking | WORKING, but applicant counts included unreadable uploads | Failed uploads excluded from counts, ranks and "Rank x of N" | WORKING |
| 11 | Interview brief | PARTIAL: the brief once attributed an achievement to the wrong employer | Briefs and emails may not name employers; prompt `outputs-v5`; all briefs regenerated | WORKING |
| 12 | Email generation | PARTIAL: one-paragraph emails; rubric wording ("scrappy problem-solving") slipped through; a rejection stated a reason | Paragraphs enforced; criterion-name check ignores punctuation; rejections may not give reasons (validated, with tests) | WORKING |
| 13 | Founder decision | UNNECESSARILY COMPLEX: 4 small buttons including "Undecided", recommendation as prominent as the choice | Three large choices (Interview / Hold / Reject), none pre-selected; system recommendation is a small secondary line; "Clear decision" link | WORKING |
| 14 | Resend | WORKING (confirm, idempotency, duplicate block, test mode) | Email section appears only after a decision, badge "DRAFT — NOT SENT"; confirm dialog lists candidate / email / delivered-to / decision / subject; failure shows "Email could not be sent." + Retry | WORKING |
| 15 | Activity logging | PARTIAL: technical log (event codes, raw key/value details); analysis failures not recorded | Plain sentences with candidate names, grouped by day, All / Uploads / Decisions / Emails filters, repeated clicks collapsed; analysis failures now logged | WORKING |
| 16 | Rubric page | UNNECESSARILY COMPLEX: editor, drafts, versions and calibration jargon on one screen | "How Candidates Are Evaluated": PM/SPM tabs, weight, what it measures, strong evidence, "How this rubric was created"; editing/versions moved to admin setup | WORKING |
| 17 | Loading states | WORKING (live stage checklist) | Stage names now match the journey; failed stage named in plain words | WORKING |
| 18 | Empty states | PARTIAL: some pages had terse text | Dashboard "No candidates yet" + "Upload your first candidate"; Activity "No activity yet"; Rubric "The rubric hasn't been configured" + next action | WORKING |
| 19 | Error states | PARTIAL | Each error says what happened, whether data was saved, and what to do next; consistency guard shows Retry if a "ready" candidate is missing results | WORKING |
| 20 | Mobile | PARTIAL: table columns hidden on narrow screens | Dashboard switches to cards below 768 px; candidate page single column; verified at 390, 1024 and 1440 px with no horizontal scroll | WORKING |

## Removed / cleaned up

- Login page, `/api/auth/*`, the proxy auth check, session-cookie code, `ADMIN_PASSWORD`.
- Unused UI components (three badge variants), "Maybe / Hold" wording, the dashboard's global test-inbox address (shown only in the email panel and confirmation dialog now).
- No hard-coded candidates, scores, mock AI responses or historical-hire comparisons exist in runtime code (checked by `tests/security.test.ts`, which fails if any calibration hire's name appears in `app/`, `lib/`, `components/`, `supabase/` or `scripts/`).
