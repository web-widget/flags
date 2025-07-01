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
}

export const handler = defineRouteHandler<MarketingData>({
  async GET({ request, render }) {
    const flag1 = await firstMarketingABTest(request);
    const flag2 = await secondMarketingABTest(request);

    return render({
      data: { flag1, flag2 },
    });
  },
});

export default defineRouteComponent<MarketingData>(function MarketingPagesPage({
  data,
}) {
  const { flag1, flag2 } = data;

  return (
    <Layout>
      <div className={styles.container}>
        <h1 className={styles.title}>Marketing Pages</h1>
        <p className={styles.description}>
          This example demonstrates using feature flags on static pages with
          precomputed routes. Multiple flags are evaluated based on the visitor
          ID.
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

        <VisitorIdControls />
      </div>
    </Layout>
  );
});
