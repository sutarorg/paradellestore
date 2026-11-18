import { getJob, getJobs } from '@/lib/admin/gateway';
import { ImportStudio } from '@/components/admin/importer';
import { listQuery, type Raw } from '@/lib/admin/rules';
export const metadata = { title: 'Import studio' };
export default async function Page({ searchParams }: { searchParams: Promise<Raw> }) {
  const r = await searchParams,
    q = listQuery('imports', r),
    id = typeof r.job === 'string' ? r.job : '';
  const [jobs, initial] = await Promise.all([getJobs(q), id ? getJob(id) : null]);
  const step = typeof r.step === 'string' && /^[1-8]$/.test(r.step) ? Number(r.step) : 1;
  return (
    <ImportStudio
      key={`${id}:${JSON.stringify(q)}`}
      initialStep={step}
      initial={initial}
      query={q}
      jobs={jobs}
    />
  );
}
