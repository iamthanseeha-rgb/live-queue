// Meta Pixel — loaded from React rather than index.html, deliberately.
//
// The public waiting-room page (/<slug>) is opened by PATIENTS, not by customers.
// Loading a Meta tracking pixel on a screen that sits in a clinic waiting room would
// send Meta a signal about every patient who scans the QR code — something they never
// agreed to and we don't need. App.jsx therefore calls initPixel() from an ALLOWLIST
// of host-facing pages only; nothing here ever runs on a patient's screen.
//
// The Pixel ID comes from VITE_META_PIXEL_ID. With no ID set, every function here
// does nothing — so a missing env var degrades to "no tracking", never to a crash.

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID;

let loaded = false;

function fbq(...args) {
  if (typeof window === 'undefined' || !window.fbq) return;
  try { window.fbq(...args); } catch (err) { console.warn('pixel call failed', err); }
}

// The standard Meta base snippet, in module form.
function injectBaseCode() {
  if (loaded || typeof window === 'undefined' || window.fbq) return;
  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  loaded = true;
}

/**
 * Start the pixel. Safe to call repeatedly – the base code only ever loads once.
 * Call it only from the allowlisted host-facing pages (see PIXEL_PAGES in App.jsx).
 */
export function initPixel() {
  if (!PIXEL_ID) return;
  injectBaseCode();
  fbq('init', PIXEL_ID);
  fbq('track', 'PageView');
}

/** A visitor landed on a marketing page – the ad did its job. */
export function trackViewContent(name) {
  if (!PIXEL_ID) return;
  fbq('track', 'ViewContent', { content_name: name, content_category: 'marketing' });
}

/** A host signed up – the landing page did its job. */
export function trackSignUp() {
  if (!PIXEL_ID) return;
  fbq('track', 'CompleteRegistration', { content_name: 'desk_signup', status: true });
}

/** A recharge succeeded – the product did its job. Value is in rupees. */
export function trackPurchase(rupees, packName) {
  if (!PIXEL_ID) return;
  fbq('track', 'Purchase', {
    value: Number(rupees) || 0,
    currency: 'INR',
    content_name: packName || 'recharge',
  });
}
