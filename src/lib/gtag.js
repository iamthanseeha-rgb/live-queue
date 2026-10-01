// Google Ads tag (gtag.js) — loaded from React, never from index.html.
//
// Same rule as the Meta Pixel in lib/pixel.js: the waiting-room display at
// /<slug> is opened by PATIENTS, so no advertising tag may ever load there.
// App.jsx calls initGoogleAds() from the same ALLOWLIST of host-facing pages
// (see PIXEL_PAGES), and nothing in this file runs on a patient's screen.
//
// The conversion ID is public — it ships in the page source of every site that
// advertises — so it is hardcoded as a fallback and can still be overridden per
// environment. The conversion LABELS are created in Google Ads under
// Goals → Conversions; until they are filled in, the base tag still loads (so
// "Test installation" in Google Ads passes) and the conversion calls no-op.

const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};

const ADS_ID = ENV.VITE_GOOGLE_ADS_ID || 'AW-18485752698';
const SIGNUP_LABEL = ENV.VITE_GOOGLE_ADS_SIGNUP_LABEL || '';
const PURCHASE_LABEL = ENV.VITE_GOOGLE_ADS_PURCHASE_LABEL || '';

let loaded = false;

function gtag(...args) {
  if (typeof window === 'undefined' || !window.gtag) return;
  try { window.gtag(...args); } catch (err) { console.warn('gtag call failed', err); }
}

// The standard gtag.js loader, in module form.
function injectBaseCode() {
  if (loaded || typeof window === 'undefined' || window.gtag) return;
  /* eslint-disable */
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ADS_ID)}`;
  document.head.appendChild(s);
  window.gtag('js', new Date());
  /* eslint-enable */
  loaded = true;
}

/**
 * Start the Google Ads tag. Safe to call repeatedly — the loader runs once.
 * Call it only from the allowlisted host-facing pages.
 */
export function initGoogleAds() {
  if (!ADS_ID) return;
  injectBaseCode();
  gtag('config', ADS_ID);
}

/** A host signed up — this is the conversion the Search ads are paying for. */
export function trackAdsSignUp() {
  if (!ADS_ID || !SIGNUP_LABEL) return;
  gtag('event', 'conversion', { send_to: `${ADS_ID}/${SIGNUP_LABEL}` });
}

/** A recharge succeeded. Value is in rupees. */
export function trackAdsPurchase(rupees) {
  if (!ADS_ID || !PURCHASE_LABEL) return;
  gtag('event', 'conversion', {
    send_to: `${ADS_ID}/${PURCHASE_LABEL}`,
    value: Number(rupees) || 0,
    currency: 'INR',
  });
}
