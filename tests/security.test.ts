import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSessionToken, safeEqual, SESSION_TTL_SECONDS, verifySessionToken } from '@/lib/auth/session';
import { personalize, resolveRecipient } from '@/lib/email/compose';
import { redact } from '@/lib/log';

describe('session tokens (TEST 20)', () => {
  it('verifies a fresh token and rejects tampering, expiry and a changed password', async () => {
    const t = await createSessionToken('pw-1');
    expect(await verifySessionToken(t, 'pw-1')).toBe(true);
    expect(await verifySessionToken(t, 'pw-2')).toBe(false);
    expect(await verifySessionToken(t.replace(/\.v1|\.(\d+)\./, '.9999999999.'), 'pw-1')).toBe(false);
    expect(await verifySessionToken(t, 'pw-1', Date.now() + (SESSION_TTL_SECONDS + 5) * 1000)).toBe(false);
    expect(await verifySessionToken(undefined, 'pw-1')).toBe(false);
    expect(await verifySessionToken('garbage', 'pw-1')).toBe(false);
  });
  it('constant-time compare', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('email safety (TEST 13, 14)', () => {
  it('TEST MODE redirects every email to the test inbox', () => {
    expect(resolveRecipient('cand@example.com', 'me@example.com')).toEqual({ deliverTo: 'me@example.com', testMode: true });
    expect(resolveRecipient('cand@example.com', undefined)).toEqual({ deliverTo: 'cand@example.com', testMode: false });
  });
  it('inserts the first name from the private record', () => {
    expect(personalize('Hi {{first_name}},', 'Priya')).toBe('Hi Priya,');
    expect(personalize('Hi {{first_name}},', null)).toBe('Hi there,');
  });
  it('only the Confirm & Send route calls Resend', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f.name)) files.push(p);
      }
    };
    for (const d of ['app', 'lib', 'components']) walk(path.join(__dirname, '..', d));
    const callers = files.filter((f) => /sendViaResend\(/.test(fs.readFileSync(f, 'utf8')) && !f.endsWith(path.join('lib', 'email', 'resend.ts')));
    expect(callers.map((f) => path.relative(path.join(__dirname, '..'), f))).toEqual([path.join('app', 'api', 'candidates', '[id]', 'send', 'route.ts')]);
  });
});

describe('logs never carry contact details or keys', () => {
  it('redacts', () => {
    const out = redact('mail priya@example.com phone +91 99887 76655 key AIzaSyA1234567890abcdefghijk re_abcdefghijklmnopqrstu');
    expect(out).not.toMatch(/priya@|99887|AIza|re_abc/);
    expect(redact('candidateId 3f2a9c1e-1234-4bcd-8123-123456789012')).toContain('3f2a9c1e-1234-4bcd-8123-123456789012');
  });
});

describe('no historical identities in application code (TEST 18, 38, 50)', () => {
  const manifest = path.join(__dirname, '..', 'calibration-data', 'manifest.json');
  it.skipIf(!fs.existsSync(manifest))('source files never mention a calibration hire by name', () => {
    const names: string[] = (JSON.parse(fs.readFileSync(manifest, 'utf8')).hires as { label: string }[]).flatMap((h) => [h.label, ...h.label.split(' ').filter((p) => p.length > 3)]);
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.(ts|tsx|sql|md)$/.test(f.name)) {
          const text = fs.readFileSync(p, 'utf8');
          for (const n of names) if (new RegExp(`\\b${n}\\b`).test(text)) hits.push(`${path.basename(p)}: ${n}`);
        }
      }
    };
    for (const d of ['app', 'lib', 'components', 'supabase', 'scripts']) walk(path.join(__dirname, '..', d));
    expect(hits).toEqual([]);
  });
});
