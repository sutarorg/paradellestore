import { EmptyState } from '@/components/ui';
export default function NotFound() {
  return (
    <div className="frame state-page">
      <div className="eyebrow">PARADELLE / 404</div>
      <h1 className="sr-only">Page not found</h1>
      <EmptyState title="This page isn’t here." cta="Back to the collection">
        The link may have changed, or this piece is no longer in the collection.
      </EmptyState>
    </div>
  );
}
