// Register the service worker in production builds only. In dev the SW would
// intercept HMR requests and Astro's hot updates would break in confusing ways.
// PROD is true both under `astro build` output and `astro preview`.

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const swUrl = `${base}/sw.js`;
  const scope = `${base}/`;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[pwa] Service worker registration failed:', err);
    });
  });
}
