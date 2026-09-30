import { UploadForm } from '@/components/UploadForm';
import { getActiveRubric } from '@/lib/db/repo';

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const active = await getActiveRubric().catch(() => null);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Upload Candidate</h1>
        <p className="text-sm text-slate-500">Contact details are separated from the CV before any AI step. The AI only sees professional content.</p>
      </div>
      <UploadForm rubricReady={Boolean(active)} />
    </div>
  );
}
