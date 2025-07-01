import { createVisitorId } from '../../../config/precomputed-flags.ts';
import styles from '../(components)/FlagControls.module.css';

export default function VisitorIdControls() {
  const generateNewVisitorId = () => {
    const newVisitorId = createVisitorId();
    document.cookie = `visitorId=${newVisitorId}; Path=/`;
    window.location.href = '/flags/marketing-pages';
  };

  const clearVisitorId = () => {
    document.cookie =
      'visitorId=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.href = '/flags/marketing-pages';
  };

  return (
    <div className={styles.controls}>
      <p className={styles.controlsTitle}>Test different visitor IDs:</p>
      <div className={styles.buttons}>
        <button className={styles.button} onClick={generateNewVisitorId}>
          Generate new visitor ID
        </button>
        <button
          className={styles.button + ' ' + styles.buttonSecondary}
          onClick={clearVisitorId}
        >
          Clear visitor ID
        </button>
      </div>
      <p
        style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.75rem' }}
      >
        The visitor ID determines which combination of flags you see. Each ID
        produces a consistent set of flag values.
      </p>
    </div>
  );
}
