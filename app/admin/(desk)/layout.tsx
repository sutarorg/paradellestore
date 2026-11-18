import { redirect } from 'next/navigation';
import { access } from '@/lib/admin/gateway';
import { Shell } from '@/components/admin/shell';
import { Heading, StateBox } from '@/components/admin/workbench';
export default async function Desk({ children }: { children: React.ReactNode }) {
  const a = await access();
  if (a.mode === 'denied') redirect('/admin/login');
  return (
    <Shell session={a}>
      {a.mode === 'unavailable' ? (
        <>
          <Heading label="Administration" title="Session unavailable" />
          <StateBox
            state={{ state: 'error', message: 'The private service could not verify your session.' }}
          />
        </>
      ) : (
        children
      )}
    </Shell>
  );
}
