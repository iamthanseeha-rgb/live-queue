// Shared slug rules: used when a host saves a slug AND when a patient searches,
// so "Dr Adam", "dr-adam" and a pasted "livequeue.co.in/dr-adam" all resolve the same way.

export const RESERVED_SLUGS = [
  'contact', 'privacy', 'terms', 'refunds', 'welcome', 'admin', 'login',
  'home', 'status', 'assets', 'api', 'signup', 'dashboard',
];

export const SLUG_MAX = 40;

export function normalizeSlug(input) {
  let s = String(input ?? '').trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // strip protocol (https://)
  s = s.replace(/^[^/\s]+\.[a-z]{2,}(?=\/)/, ''); // strip a domain before a path (livequeue.co.in/dr-adam)
  s = s.split(/[?#]/)[0];
  return s
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Returns an error message, or null when the slug is fine.
export function validateSlug(raw, clean) {
  if (!clean) {
    return /[^\x00-\x7F]/.test(String(raw))
      ? 'Use English letters (a–z), numbers and hyphens for the link, e.g. dr-adam.'
      : 'Enter a link name, e.g. dr-adam.';
  }
  if (/^\d+$/.test(clean)) return 'The link can’t be numbers only. Add some letters, e.g. room-12.';
  if (clean.length > SLUG_MAX) return `Keep the link to ${SLUG_MAX} characters or fewer.`;
  if (RESERVED_SLUGS.includes(clean)) return `“/${clean}” is used by LiveQueue itself. Please choose a different link.`;
  return null;
}

export function safeDecode(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path; // malformed %-encoding (e.g. "/50%") – treat literally instead of crashing
  }
}
