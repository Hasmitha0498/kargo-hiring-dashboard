import * as repo from '@/lib/db/repo';
import { handle } from '@/lib/http';

export const DELETE = handle('calibration.delete_hire', async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await repo.deleteCalibrationHire(id);
  await repo.logActivity('CALIBRATION_HIRE_REMOVED');
  return Response.json({ ok: true });
});
