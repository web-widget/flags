import { defineRouteComponent, defineMeta } from '@web-widget/helpers';

export const meta = defineMeta({
  title: 'Marketing Pages - Flags SDK',
});

export default defineRouteComponent(function MarketingPagesRedirect() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <p>Computing marketing flags and redirecting...</p>
      <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '1rem' }}>
        This page should automatically redirect to a precomputed route based on
        your visitor ID.
      </p>
    </div>
  );
});
