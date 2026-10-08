-- A clinic must never be able to take a slug the app itself answers on.
--
-- The app resolves /<slug> by checking its own route names first, so a desk
-- called /login or /welcome would simply stop resolving for its patients — the
-- clinic would see its QR poster lead to the wrong page with no error anywhere.
-- Until now that rule lived only in React (RESERVED_SLUGS in lib/slug.js), which
-- anyone calling the REST API directly could skip. This puts it in the database,
-- where it cannot be bypassed.
--
-- 'dev' is on the list because the owner dashboard lives at /dev. A desk was
-- briefly using that slug and was renamed before this went live; from here on
-- the database refuses it, so no clinic can take it by accident.

alter table public.queue_details
  drop constraint if exists queue_details_slug_not_reserved;

alter table public.queue_details
  add constraint queue_details_slug_not_reserved
  check (slug not in (
    'contact', 'privacy', 'terms', 'refunds', 'welcome', 'admin', 'login',
    'home', 'status', 'assets', 'api', 'signup', 'dashboard', 'dev',
    'app', 'auth', 'about', 'help', 'support', 'pricing', 'blog', 'docs',
    'sitemap', 'robots', 'static', 'account', 'settings'
  ));
