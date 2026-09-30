// Job descriptions used as calibration context (never sent at runtime scoring).
import { z } from 'zod';
import { requireApiSession } from '@/lib/auth/guard';
import * as repo from '@/lib/db/repo';
import { handle, readBody } from '@/lib/http';

const Body = z.object({ role: z.enum(['PM', 'SPM']), title: z.string().trim().min(2).max(120), jd_text: z.string().trim().min(100, 'Paste the full job description').max(20000) });

export const PUT = handle('calibration.save_role', async (request: Request) => {
  const denied = await requireApiSession();
  if (denied) return denied;
  const body = await readBody(request, Body);
  if ('error' in body) return body.error;
  await repo.upsertRoleProfile(body.data.role, body.data.title, body.data.jd_text);
  await repo.logActivity('JD_UPDATED', { detail: { role: body.data.role } });
  return Response.json({ ok: true });
});
