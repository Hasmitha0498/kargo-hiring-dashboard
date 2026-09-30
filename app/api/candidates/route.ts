// Upload one CV and run the full pipeline, streaming progress. Nothing here sends email or decides anything.
import { isRole } from '@/lib/domain';
import { jsonError, ndjson } from '@/lib/http';
import { MAX_FILE_BYTES } from '@/lib/parse/extract-text';
import { processUpload } from '@/lib/pipeline/process';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return jsonError('Expected a file upload.');
  const role = form.get('applied_role');
  const file = form.get('file');
  if (!isRole(role)) return jsonError('Choose the role applied for: Product Manager or Senior Product Manager.');
  if (!(file instanceof File)) return jsonError('Attach a CV file.');
  if (file.size > MAX_FILE_BYTES) return jsonError('The file is larger than 4 MB. Upload a smaller copy.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  return ndjson((emit) => processUpload(role, file.name || 'cv', bytes, emit));
}
