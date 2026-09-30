// Turns an uploaded CV file (PDF, DOCX or TXT) into plain text. Every failure becomes a ParseError with a message
// the founder can act on; nothing here throws a raw library error at the UI.

export type ParseErrorCode = 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'EMPTY_FILE' | 'CORRUPT_FILE' | 'NO_TEXT';

export class ParseError extends Error {
  constructor(
    readonly code: ParseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'txt'] as const;
export type FileKind = (typeof SUPPORTED_EXTENSIONS)[number];
/** Vercel caps request bodies at 4.5 MB; stay under it. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
/** Below this many letters the file is almost certainly a scan, an image or a broken export. */
const MIN_LETTERS = 150;

export function detectKind(fileName: string, bytes: Uint8Array): FileKind {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const magic = String.fromCharCode(...bytes.slice(0, 5));
  if (ext === 'pdf' || magic.startsWith('%PDF')) return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt') return 'txt';
  if (ext === 'doc') throw new ParseError('UNSUPPORTED_TYPE', 'Old Word .doc files are not supported. Save the CV as .docx or PDF and upload again.');
  throw new ParseError('UNSUPPORTED_TYPE', `".${ext || fileName}" files are not supported. Upload a PDF, DOCX or TXT file.`);
}

/** Cleans extraction artefacts while keeping line structure (identity extraction relies on lines). */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .replace(/[​-‍﻿\u0000]/g, '')
    .replace(/[\t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : text;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/password/i.test(msg)) throw new ParseError('CORRUPT_FILE', 'This PDF is password-protected. Upload an unlocked copy.');
    throw new ParseError('CORRUPT_FILE', 'This PDF could not be read (it may be damaged or not a real PDF). Try re-exporting it.');
  }
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const mammoth = await import('mammoth');
  try {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return value;
  } catch {
    throw new ParseError('CORRUPT_FILE', 'This Word file could not be opened (it may be damaged or not a real .docx). Try re-saving it.');
  }
}

function txtText(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const controls = (text.match(/[\u0000-\u0008\u000e-\u001f�]/g) ?? []).length;
  if (controls > text.length * 0.05) throw new ParseError('CORRUPT_FILE', 'This .txt file does not contain readable text.');
  return text;
}

export async function extractText(fileName: string, bytes: Uint8Array): Promise<{ kind: FileKind; text: string }> {
  if (bytes.byteLength === 0) throw new ParseError('EMPTY_FILE', 'The file is empty.');
  if (bytes.byteLength > MAX_FILE_BYTES) throw new ParseError('TOO_LARGE', 'The file is larger than 4 MB. Upload a smaller copy.');
  const kind = detectKind(fileName, bytes);
  const raw = kind === 'pdf' ? await pdfText(bytes) : kind === 'docx' ? await docxText(bytes) : txtText(bytes);
  const text = normalizeText(raw);
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters < MIN_LETTERS) {
    throw new ParseError(
      'NO_TEXT',
      kind === 'pdf'
        ? 'No readable text was found. This PDF is probably a scanned image; upload a text-based PDF or DOCX.'
        : 'The file contains too little text to be a CV.',
    );
  }
  return { kind, text };
}
