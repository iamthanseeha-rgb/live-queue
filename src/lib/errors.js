// Turn Supabase / network errors into messages a receptionist can act on.
// Raw database text ("new row violates row-level security policy…") never reaches the screen.

const KNOWN = {
  QUOTA_EXHAUSTED: 'Your call balance is 0. Recharge to call the next token.',
  ACCOUNT_BLOCKED: 'This account is paused. Please contact LiveQueue support on WhatsApp.',
  QUEUE_NOT_FOUND: 'This counter could not be found. Refresh the page and try again.',
  NOT_AUTHENTICATED: 'Your session has expired. Please sign in again.',
  PACK_NOT_FOUND: 'That recharge pack is no longer available. Please pick another.',
};

export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  const msg = String(error.message || error.error_description || error || '');
  for (const [code, text] of Object.entries(KNOWN)) {
    if (msg.includes(code)) return text;
  }
  if (error.code === '23505') return 'This link is already taken. Please choose another.';
  if (error.code === '23514') return 'Some details are too long or use characters that aren’t allowed.';
  if (/fetch|network|timeout|Failed to fetch|NetworkError/i.test(msg)) {
    return 'No internet connection. Check your network and try again.';
  }
  if (/JWT|session|refresh token/i.test(msg)) return KNOWN.NOT_AUTHENTICATED;
  return fallback;
}
