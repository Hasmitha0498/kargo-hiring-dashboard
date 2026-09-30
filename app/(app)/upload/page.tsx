import { UploadForm } from '@/components/UploadForm';
import { getActiveRubric } from '@/lib/db/repo';

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const active = await getActiveRubric().catch(() => null);
  return (
    <div className="space-y-5">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-navy-900">Upload Candidate</h1>
        <p className="text-sm text-slate-500">Upload a CV and select the role they applied for.</p>
      </div>
      <UploadForm rubricReady={Boolean(active)} />
    </div>
  );
}
