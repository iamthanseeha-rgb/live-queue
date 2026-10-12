-- Reserve 'token-display-price' so no clinic can claim it as its public slug.
--
-- Every name in this list is also a route in the React app. If a desk held one
-- of them, the app would render the route and that clinic's waiting-room page
-- would silently stop resolving — patients scanning its QR poster would land on
-- a marketing page instead of their token number.
--
-- This list must stay in step with RESERVED_SLUGS in src/lib/slug.js and
-- STATIC_PAGES in src/App.jsx. The app-side check is the friendly error; this
-- one is the guarantee.
--
-- Checked before applying: no existing row uses the new name.

alter table public.queue_details
  drop constraint if exists queue_details_slug_not_reserved;

alter table public.queue_details
  add constraint queue_details_slug_not_reserved
  check (slug <> all (array[
    'contact', 'privacy', 'terms', 'refunds', 'welcome', 'admin', 'login',
    'home', 'status', 'assets', 'api', 'signup', 'dashboard', 'dev',
    'app', 'auth', 'about', 'help', 'support', 'pricing', 'blog', 'docs',
    'sitemap', 'robots', 'static', 'account', 'settings',
    'token-display-price'
  ]));
