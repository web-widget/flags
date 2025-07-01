import {
  defineRouteComponent,
  defineMeta,
  defineRouteHandler,
} from '@web-widget/helpers';
import { firstMarketingABTest, secondMarketingABTest } from '#config/flags';
import Layout from '../(components)/Layout.tsx';
import VisitorIdControls from './VisitorIdControls@widget.tsx';
import styles from './marketing-pages.module.css';

export const meta = defineMeta({
  title: 'Marketing Pages - Flags SDK',
});

interface MarketingData {
  flag1: boolean;
  flag2: boolean;
  flagsCode: string;
}

export const handler = defineRouteHandler<MarketingData>({
  async GET({ request, render }) {
    // Get the precomputed flags code from the custom header set by middleware
    const flagsCode = request.headers.get('x-flags-code') || 'unknown';

    // Evaluate flags normally (these should match the precomputed results)
    const flag1 = await firstMarketingABTest(request);
    const flag2 = await secondMarketingABTest(request);

    return render({
      data: { flag1, flag2, flagsCode },
    });
  },
});

export default defineRouteComponent<MarketingData>(function MarketingPagesPage({
  data,
}) {
  const { flag1, flag2, flagsCode } = data;

  return (
    <Layout>
      <div className={styles.container}>
        <h1 className={styles.title}>Marketing Pages</h1>
        <p className={styles.description}>
          This example demonstrates using feature flags on content-driven pages
          with precomputed routes. Multiple flags are evaluated based on the
          visitor ID. The URL stays clean using header-based precomputation.
        </p>

        <div className={styles.flagResults}>
          <div
            className={
              flag1
                ? styles.flagResult + ' ' + styles.flagTrue
                : styles.flagResult + ' ' + styles.flagFalse
            }
          >
            <div className={styles.flagMessage}>
              The feature flag{' '}
              <span className={styles.flagName}>firstMarketingABTest</span>{' '}
              evaluated to{' '}
              <span className={styles.flagValue}>
                {flag1 ? 'true' : 'false'}
              </span>
              .
            </div>
          </div>

          <div
            className={
              flag2
                ? styles.flagResult + ' ' + styles.flagTrue
                : styles.flagResult + ' ' + styles.flagFalse
            }
          >
            <div className={styles.flagMessage}>
              The feature flag{' '}
              <span className={styles.flagName}>secondMarketingABTest</span>{' '}
              evaluated to{' '}
              <span className={styles.flagValue}>
                {flag2 ? 'true' : 'false'}
              </span>
              .
            </div>
          </div>
        </div>

        <div className={styles.content}>
          <h2>Content Based on Flags:</h2>
          {flag1 && flag2 ? (
            <div className={styles.variant}>
              <h3>🌟 Both Flags Active - Premium Experience</h3>
              <p>
                You&apos;re seeing our premium content with both features
                enabled!
              </p>
            </div>
          ) : flag1 ? (
            <div className={styles.variant}>
              <h3>🎯 First Flag Active - Feature A</h3>
              <p>
                You&apos;re seeing content with the first marketing feature
                enabled.
              </p>
            </div>
          ) : flag2 ? (
            <div className={styles.variant}>
              <h3>🚀 Second Flag Active - Feature B</h3>
              <p>
                You&apos;re seeing content with the second marketing feature
                enabled.
              </p>
            </div>
          ) : (
            <div className={styles.variant}>
              <h3>📋 Default Experience</h3>
              <p>
                You&apos;re seeing the default content with no special features.
              </p>
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: '2rem',
            padding: '1rem',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
          <h3
            style={{
              margin: '0 0 0.5rem 0',
              fontSize: '1rem',
              color: '#374151',
            }}
          >
            🔧 Implementation Details
          </h3>
          <p
            style={{
              margin: '0 0 0.5rem 0',
              fontSize: '0.875rem',
              color: '#64748b',
            }}
          >
            <strong>Precomputed Flags Code:</strong>{' '}
            <code
              style={{
                fontFamily: 'monospace',
                background: '#fff',
                padding: '0.25rem',
                borderRadius: '4px',
              }}
            >
              {flagsCode}
            </code>
          </p>
          <p style={{ margin: '0', fontSize: '0.875rem', color: '#64748b' }}>
            This example uses header-based precomputation (
            <code>x-flags-code</code>) instead of URL redirection, keeping the
            user-facing URL clean.
          </p>
        </div>

        <VisitorIdControls />
      </div>
    </Layout>
  );
});
