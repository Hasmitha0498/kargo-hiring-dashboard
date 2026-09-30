// Retry a failed stage, or re-evaluate with the currently ACTIVE rubric (creates a new evaluation; old ones are kept).
import { z } from 'zod';
import { requireApiSession } from '@/lib/auth/guard';
import { ndjson, readBody } from '@/lib/http';
import { processExisting } from '@/lib/pipeline/process';

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z.object({ from: z.enum(['auto', 'score', 'outputs']).default('auto') });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const { id } = await params;
  const body = await readBody(request, Body);
  if ('error' in body) return body.error;
  return ndjson((emit) => processExisting(id, body.data.from, emit));
}
