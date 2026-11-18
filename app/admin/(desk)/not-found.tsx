import { Heading, ALink } from '@/components/admin/workbench';
export default function NotFound() {
  return (
    <>
      <Heading
        title="Workspace page not found"
        label="Private studio"
        description="This address does not match an administration page."
      />
      <div>
        <ALink href="/admin" primary>
          Return to overview
        </ALink>
      </div>
    </>
  );
}
