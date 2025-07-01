import styles from '../(components)/FlagControls.module.css';

export default function VisitorIdControls() {
  const resetVisitorId = () => {
    // Clear the visitor ID cookie and let the middleware create a new one
    document.cookie =
      'visitorId=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.href = '/flags/marketing-pages';
  };

  return (
    <div className={styles.controls}>
      <p className={styles.controlsTitle}>Test different visitor IDs:</p>
      <div className={styles.buttons}>
        <button className={styles.button} onClick={resetVisitorId}>
          Reset visitor ID
        </button>
      </div>
      <p
        style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.75rem' }}
      >
        The visitor ID determines which combination of flags you see. Each ID
        produces a consistent set of flag values. Resetting will generate a new
        random visitor ID via middleware.
      </p>
    </div>
  );
}
