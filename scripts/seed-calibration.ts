// Loads calibration data (job descriptions + past hires with outcomes) from a local, gitignored folder into Supabase.
// Usage: npm run seed:calibration [-- path/to/folder]   (default: ./calibration-data, which must hold manifest.json)
// Safe to re-run: hires already loaded (same file name) and unchanged JDs are skipped.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { extractText } from '../lib/parse/extract-text';
import { separateIdentity } from '../lib/parse/identity';

interface Manifest {
  roles: { role: 'PM' | 'SPM'; title: string; file: string }[];
  hires: { file: string; label: string; role_hired: string; outcome: 'EXCEEDS' | 'MEETS' | 'BELOW'; notes?: string }[];
}

const dir = path.resolve(process.argv[2] ?? 'calibration-data');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
const db = createClient(url, key, { auth: { persistSession: false } });
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;

async function text(file: string) {
  const { text } = await extractText(file, new Uint8Array(fs.readFileSync(path.join(dir, file))));
  return text;
}

for (const r of manifest.roles) {
  const jd = await text(r.file);
  const { error } = await db.from('role_profiles').upsert({ role: r.role, title: r.title, jd_text: jd, updated_at: new Date().toISOString() });
  if (error) throw new Error(`JD ${r.role}: ${error.message}`);
  console.log(`JD ${r.role}: stored (${jd.length} chars)`);
}

const { data: existing, error: listError } = await db.from('calibration_hires').select('original_file_name');
if (listError) throw new Error(listError.message);
const have = new Set((existing ?? []).map((e) => e.original_file_name));

for (const h of manifest.hires) {
  if (have.has(h.file)) {
    console.log(`hire ${h.file}: already loaded, skipped`);
    continue;
  }
  const { professionalText } = separateIdentity(await text(h.file));
  const { error } = await db.from('calibration_hires').insert({
    private_label: h.label,
    role_hired: h.role_hired,
    performance_outcome: h.outcome,
    original_file_name: h.file,
    professional_text: professionalText,
    notes: h.notes ?? null,
  });
  if (error) throw new Error(`hire ${h.file}: ${error.message}`);
  console.log(`hire ${h.file}: loaded (${h.role_hired}, ${h.outcome})`);
}
await db.from('activity_log').insert({ event_type: 'CALIBRATION_HIRE_ADDED', detail: { source: 'seed script', hires: manifest.hires.length } });
console.log('Done. Open /calibration and press Generate Rubric.');
