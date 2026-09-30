import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectKind, extractText, ParseError } from '@/lib/parse/extract-text';
import { firstName, NAME_PLACEHOLDER, separateIdentity } from '@/lib/parse/identity';

const fx = (f: string) => new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', f)));

/** Builds a small valid PDF with the given lines (correct xref offsets), so the PDF path is tested for real. */
function makePdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (m) => `\\${m}`);
  const content = `BT /F1 11 Tf 50 780 Td 14 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

describe('file support (PDF / DOCX / TXT)', () => {
  it('reads TXT', async () => {
    const { kind, text } = await extractText('cv.txt', fx('synthetic_cv.txt'));
    expect(kind).toBe('txt');
    expect(text).toContain('warehouse floors');
  });
  it('reads DOCX', async () => {
    const { kind, text } = await extractText('cv.docx', fx('synthetic_cv.docx'));
    expect(kind).toBe('docx');
    expect(text).toContain('Killed a barcode feature');
  });
  it('reads a text PDF', async () => {
    const lines = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_cv.txt'), 'utf8').split('\n').filter(Boolean);
    const { kind, text } = await extractText('cv.pdf', makePdf(lines));
    expect(kind).toBe('pdf');
    expect(text).toContain('dock scheduling');
  });
  it('rejects a PDF with no text (e.g. a scan) with a useful message', async () => {
    await expect(extractText('scan.pdf', makePdf(['']))).rejects.toMatchObject({ code: 'NO_TEXT' });
  });
  it('rejects corrupt, empty and unsupported files without crashing', async () => {
    await expect(extractText('x.pdf', fx('corrupt.pdf'))).rejects.toBeInstanceOf(ParseError);
    await expect(extractText('x.docx', fx('corrupt.docx'))).rejects.toMatchObject({ code: 'CORRUPT_FILE' });
    await expect(extractText('x.txt', new Uint8Array())).rejects.toMatchObject({ code: 'EMPTY_FILE' });
    expect(() => detectKind('photo.png', new Uint8Array([1, 2, 3]))).toThrow(/not supported/);
    expect(() => detectKind('old.doc', new Uint8Array([1, 2, 3]))).toThrow(/\.doc/);
  });
});

describe('identity separation', () => {
  it('moves contact details to the private record and out of the professional text', async () => {
    const { text } = await extractText('cv.txt', fx('synthetic_cv.txt'));
    const { identity, professionalText } = separateIdentity(text);
    expect(identity.candidate_name).toBe('Priya Raman');
    expect(identity.email).toBe('priya.raman.work@example.com');
    expect(identity.phone).toBe('+91 99887 76655');
    expect(identity.linkedin_url).toBe('linkedin.com/in/priyaraman-pm');
    expect(identity.portfolio_url).toBe('priyaraman.dev/portfolio');
    expect(identity.address).toBe('Pune, Maharashtra');
    for (const leak of ['Priya', 'Raman', 'example.com', '99887', 'linkedin.com', 'Pune']) expect(professionalText).not.toContain(leak);
    expect(professionalText).toContain(`${NAME_PLACEHOLDER} has owned inventory tooling`);
    expect(professionalText).toContain('Spent six weeks on warehouse floors');
    // Dates are not phone numbers
    expect(professionalText).toContain('2019 – 2022');
  });
  it('handles upper-case names, labelled personal fields and keeps certifications on contact lines', () => {
    const cv = ['ANIL KUMAR MENON', 'anil@example.org · +1 (415) 555-0134 · Kochi', 'Date of Birth: 01/02/1990', 'Gender: Male', 'SUMMARY', 'Menon led a carrier integration.', 'EXPERIENCE', 'Did things for 2014-2017.'].join('\n');
    const { identity, professionalText } = separateIdentity(cv);
    expect(identity.candidate_name).toBe('Anil Kumar Menon');
    expect(identity.phone).toBe('+1 (415) 555-0134');
    expect(identity.other['date of birth']).toBe('01/02/1990');
    expect(identity.other.gender).toBe('Male');
    expect(professionalText).not.toMatch(/Male|1990|Menon|Kochi/);
    expect(professionalText).toContain('[Candidate] led a carrier integration.');
    const withCert = separateIdentity(['Jane Doe', 'linkedin.com/in/jd | Certified Scrum Product Owner', 'EXPERIENCE', 'x'].join('\n'));
    expect(withCert.professionalText).toContain('Certified Scrum Product Owner');
  });
  it('first name for greetings', () => {
    expect(firstName('Priya Raman')).toBe('Priya');
    expect(firstName(null)).toBeNull();
  });
});
