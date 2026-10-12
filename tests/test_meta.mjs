// SEO regression test for per-route <title> and <meta name="description">.
//
// It does not reimplement the logic. It lifts the real PAGE_META literal and
// the real body of the title/description effect out of src/App.jsx, runs that
// body against index.html loaded in a DOM, and asserts what the head ends up
// looking like for each route.
//
//   node tests/test_meta.mjs
//
// The thing it exists to catch: the home page and /welcome going back to
// sharing a title or a description. They target two different searchers, and
// two pages on one site competing for one phrase means Google picks one of
// them and may pick the wrong one.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSrc = readFileSync(join(root, 'src/App.jsx'), 'utf8');
const htmlSrc = readFileSync(join(root, 'index.html'), 'utf8');

let failures = 0;
const ok = (cond, label) => {
  if (cond) {
    console.log(`  pass  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
  }
};

// ── Extract the real source under test ──────────────────────────────────────

// Balanced-brace slice starting at a marker, so the extraction does not depend
// on how the literal happens to be indented.
function sliceBalanced(src, marker, open, close) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`could not find ${JSON.stringify(marker)} in App.jsx`);
  let i = src.indexOf(open, start);
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === open) depth += 1;
    else if (src[j] === close) {
      depth -= 1;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error(`unbalanced ${open} after ${JSON.stringify(marker)}`);
}

const pageMetaLiteral = sliceBalanced(appSrc, 'const PAGE_META = ', '{', '}');
const PAGE_META = new Function(`return ${pageMetaLiteral};`)();

// The effect body: everything between its first statement and its dependency
// array. Lifted verbatim so the test runs the shipped code, not a copy of it.
const effectStart = appSrc.indexOf('const meta = PAGE_META[currentPage];');
const effectEnd = appSrc.indexOf(
  '}, [currentPage, activeQueue?.queue_position, activeQueue?.queue_title]);',
  effectStart,
);
if (effectEnd === -1) throw new Error('could not find the end of the title/description effect');
const effectBody = appSrc.slice(effectStart, effectEnd);

// The canonical + robots effect, lifted the same way.
const robotsStart = appSrc.indexOf('const indexable = INDEXABLE.includes(currentPage);');
if (robotsStart === -1) throw new Error('could not find the canonical/robots effect');
const robotsEnd = appSrc.indexOf('}, [currentPage]);', robotsStart);
if (robotsEnd === -1) throw new Error('could not find the end of the canonical/robots effect');
const robotsBody = appSrc.slice(robotsStart, robotsEnd);

// The routes that are allowed in the index. Mirrors INDEXABLE in App.jsx; the
// test reads that list back so the two cannot drift.
const indexableLiteral = sliceBalanced(appSrc, 'const INDEXABLE = ', '[', ']');
const INDEXABLE = new Function(`return ${indexableLiteral};`)();

// ── Run the real effect bodies against the real index.html ──────────────────

function headFor(currentPage, activeQueue = null, pathname = '/') {
  const dom = new JSDOM(htmlSrc, {
    runScripts: 'outside-only',
    url: `https://livequeue.co.in${pathname}`,
  });
  const { document, window } = dom.window;

  const STATIC_META = {
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '',
    ogDescription: document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '',
  };

  new Function('document', 'PAGE_META', 'STATIC_META', 'currentPage', 'activeQueue', effectBody)(
    document, PAGE_META, STATIC_META, currentPage, activeQueue,
  );
  new Function('document', 'window', 'INDEXABLE', 'currentPage', robotsBody)(
    document, window, INDEXABLE, currentPage,
  );

  return {
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '',
    ogDescription: document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '',
    descriptionTags: document.querySelectorAll('meta[name="description"]').length,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null,
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') || null,
    static: STATIC_META,
  };
}

console.log('App.jsx compiles');
try {
  esbuild.transformSync(appSrc, { loader: 'jsx' });
  ok(true, 'src/App.jsx parses as JSX');
} catch (err) {
  ok(false, `src/App.jsx parses as JSX — ${err.message}`);
}

console.log('\nThe two money pages do not collide');
const home = headFor('home');
const welcome = headFor('welcome');
ok(home.title !== welcome.title, 'home and /welcome have different titles');
ok(home.description !== welcome.description, 'home and /welcome have different descriptions');
ok(/token number/i.test(home.title), 'the home title speaks to a patient checking a token');
ok(
  /clinic/i.test(welcome.title) && /display|token/i.test(welcome.title),
  'the /welcome title speaks to a clinic buying a display',
);
ok(home.descriptionTags === 1, 'the page carries exactly one description tag');

console.log('\nEvery indexable route has its own title and description');
const titles = new Map();
const descriptions = new Map();
for (const page of INDEXABLE) {
  const head = headFor(page);
  ok(Boolean(PAGE_META[page]?.title), `${page}: has a title in PAGE_META`);
  ok(Boolean(PAGE_META[page]?.description), `${page}: has a description in PAGE_META`);
  ok(head.description === PAGE_META[page]?.description, `${page}: its description reaches the DOM`);
  ok(head.title === PAGE_META[page]?.title, `${page}: its title reaches the DOM`);

  const titleSeen = titles.get(head.title);
  ok(!titleSeen, `${page}: title is not already used by /${titleSeen || ''}`);
  titles.set(head.title, page);

  const descSeen = descriptions.get(head.description);
  ok(!descSeen, `${page}: description is not already used by /${descSeen || ''}`);
  descriptions.set(head.description, page);
}

console.log('\nDescriptions are a length Google will actually print');
for (const page of INDEXABLE) {
  const d = PAGE_META[page].description;
  ok(d.length >= 70 && d.length <= 165, `${page}: description is ${d.length} chars (want 70–165)`);
  ok(!/\s{2,}|^\s|\s$/.test(d), `${page}: description has no stray whitespace`);
}

console.log('\nNon-indexable routes are left alone');
const login = headFor('admin_login');
ok(login.title === 'Sign in – LiveQueue', 'the sign-in page keeps its title');
ok(
  login.description === login.static.description,
  'a route with no description of its own falls back to the static one, not to blank',
);
const dash = headFor('admin_dash');
ok(dash.title === 'Desk Manager – LiveQueue', 'the desk dashboard keeps its title');
const dev = headFor('dev');
ok(dev.title === 'Owner dashboard – LiveQueue', 'the owner dashboard keeps its title');
ok(!INDEXABLE.includes('dev'), 'the owner dashboard is still not indexable');

console.log('\nA clinic display still titles itself from its own numbers');
const status = headFor('status', { queue_position: 24, queue_title: 'City Clinic' });
ok(status.title === 'Now serving 24 · City Clinic – LiveQueue', 'a running queue shows the live number');
const notStarted = headFor('status', { queue_position: 0, queue_title: 'City Clinic' });
ok(notStarted.title === 'Not started · City Clinic – LiveQueue', 'a queue at zero says "Not started"');
const noQueue = headFor('status', null);
ok(noQueue.title === 'Live queue – LiveQueue', 'an unresolved slug gets the neutral title');
ok(
  status.ogTitle === status.static.ogTitle,
  "a clinic's display does not overwrite og:title with a patient's token number",
);

console.log('\nOnly the six public pages are offered to Google');
for (const page of INDEXABLE) {
  const head = headFor(page, null, page === 'home' ? '/' : `/${page}`);
  ok(head.robots === null, `${page}: carries no noindex tag`);
  ok(
    head.canonical === `https://livequeue.co.in/${page === 'home' ? '' : page}`,
    `${page}: canonical points at its own URL (got ${head.canonical})`,
  );
}

console.log('\nEverything else is explicitly kept out');
for (const page of ['status', 'admin_login', 'admin_dash', 'reset_password', 'dev']) {
  const head = headFor(page, page === 'status' ? { queue_position: 7, queue_title: 'City Clinic' } : null, '/dr-adam');
  ok(head.robots === 'noindex, follow', `${page}: carries noindex, follow (got ${head.robots})`);
  ok(head.canonical === null, `${page}: has no canonical tag`);
}

console.log("\nA clinic's page must stay crawlable so Google can read the noindex");
const robotsTxt = readFileSync(join(root, 'public/robots.txt'), 'utf8');
const disallows = [...robotsTxt.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);
ok(disallows.length > 0, `robots.txt still blocks the private routes (${disallows.join(', ')})`);
ok(
  !disallows.includes('/'),
  'robots.txt does not block the whole site',
);
for (const d of disallows) {
  const slug = d.replace(/^\//, '');
  ok(
    !INDEXABLE.includes(slug),
    `${d} is blocked in robots.txt and is not one of the pages meant to be indexed`,
  );
}
// The trap this guards: blocking a path in robots.txt stops Googlebot fetching
// it, so it never reads the noindex and can still list a bare URL. Only /login
// and /dev may be blocked, and both are also noindex-ed in the app.
ok(
  disallows.every((d) => ['/login', '/dev'].includes(d)),
  `only /login and /dev are blocked in robots.txt (found ${disallows.join(', ')})`,
);

console.log('\nThe sitemap offers exactly the indexable pages');
const sitemap = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
ok(locs.length === INDEXABLE.length, `sitemap lists ${locs.length} URLs for ${INDEXABLE.length} indexable routes`);
for (const page of INDEXABLE) {
  const want = `https://livequeue.co.in/${page === 'home' ? '' : page}`;
  ok(locs.includes(want), `sitemap lists ${want}`);
}
ok(!locs.some((l) => /\/(login|dev)$/.test(l)), 'sitemap does not list a private route');

console.log('\nindex.html stays a fallback, not a second source of truth');
ok(!/<link[^>]+rel="canonical"/.test(htmlSrc), 'index.html still has no canonical tag');
ok((htmlSrc.match(/<meta name="description"/g) || []).length === 1, 'index.html has one description tag');
ok(/FALLBACK, not the real tags/.test(htmlSrc), 'index.html says why its tags are only a fallback');

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
