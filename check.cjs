/* Full pre-flight check.  Run:  node check.cjs
 *
 * Exists because a blank page shipped twice while every test was green:
 * the tests all validated JavaScript, and both faults were in the HTML shells.
 * This checks the files on disk AND simulates a real page startup.
 */
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log(`  FAIL  ${msg}`); } };
const head = (t) => console.log(`\n${t}`);

const PAGES = ['index.html', 'portfolio.html', 'clients.html', 'detail.html'];

/* ---- 1. file integrity ------------------------------------------------- */
head('file integrity');
for (const f of [...PAGES, 'site.js', 'style.css']) {
  const buf = fs.readFileSync(f);
  const ctl = [...buf].filter((c) => c < 9 || (c > 13 && c < 32));
  ok(ctl.length === 0, `${f}: ${ctl.length} stray control byte(s) — a \\1 backreference bug writes 0x01`);
}

/* ---- 2. html structure -------------------------------------------------- */
head('html structure');
for (const f of PAGES) {
  const h = fs.readFileSync(f, 'utf8');
  ok(/<main[^>]*>/.test(h), `${f}: <main> tag is malformed or unclosed`);
  ok((h.match(/<main/g) || []).length === (h.match(/<\/main>/g) || []).length, `${f}: <main> open/close mismatch`);
  ok(h.includes('site.js') && h.includes('style.css'), `${f}: missing script or stylesheet link`);
  ok(h.includes('width=device-width'), `${f}: missing viewport meta`);
  ok(h.includes('id="main"'), `${f}: skip-link target #main missing`);
  // attribute markup leaking into visible text — the "id=&quot;detail&quot;>" bug
  const body = h.slice(h.indexOf('<body>'));
  const leak = body.match(/>\s*[a-z-]+="[^"]*"\s*>/);
  ok(!leak, `${f}: attribute text leaking into page content -> ${leak && leak[0]}`);
}
const detail = fs.readFileSync('detail.html', 'utf8');
ok(/<div id="detail">|<main[^>]*id="detail"/.test(detail), 'detail.html: no element with id="detail" for the router to fill');

/* ---- 3. css ------------------------------------------------------------- */
head('css');
const css = fs.readFileSync('style.css', 'utf8');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
ok((bare.match(/{/g) || []).length === (bare.match(/}/g) || []).length, 'style.css: brace imbalance');
ok(!/\{\s*>/.test(css), 'style.css: stray ">" where a declaration should start');

/* ---- 4. runtime: real startup, every page, every route ------------------ */
head('runtime');
const El = () => ({
  _h: '', set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; },
  classList: { add() {}, remove() {}, toggle() { return true; } }, style: {}, dataset: {},
  hidden: false, tabIndex: 0, textContent: '',
  addEventListener() {}, focus() {}, setAttribute() {}, getAttribute() { return 'x'; },
  checkValidity() { return true; }, reportValidity() {}, reset() {},
  querySelector() { return El(); }, querySelectorAll() { return []; },
});

function boot(search) {
  delete require.cache[require.resolve('./site.js')];
  const nodes = {};
  global.document = {
    addEventListener: (e, f) => { if (e === 'DOMContentLoaded') global.__r = f; },
    getElementById: (i) => (nodes[i] ||= El()),
    querySelector: (s) => (/form|status|year|nav/.test(s) ? El() : null),
    querySelectorAll: (s) => (s.includes('reveal') || s.includes('data-cta') ? [El(), El()] : []),
    body: { classList: { add() {}, remove() {}, toggle() { return true; } } },
  };
  global.window = {}; global.location = { search };
  global.IntersectionObserver = class { observe() {} unobserve() {} };
  global.setTimeout = (f) => f();
  require('./site.js');
  global.__r();
  return nodes;
}

const home = boot('');
for (const id of ['header', 'footer', 'hero', 'pillars', 'fit', 'services', 'process',
                  'why-us', 'portfolio', 'stack', 'sectors', 'testimonials', 'contact']) {
  ok((home[id]?.innerHTML || '').length > 50, `home section "${id}" rendered empty`);
}

// Routes are taken from what the page actually links to, not from parsing the
// source — that way a link the user can click is always a link that resolves.
const services = [...(home.services?.innerHTML || '')
  .matchAll(/href="detail\.html\?service=([^"]+)"/g)].map((m) => m[1]);
const cases = [...(home.portfolio?.innerHTML || '')
  .matchAll(/href="detail\.html\?case=([^"]+)"/g)].map((m) => m[1]);
ok(services.length === 12, `expected 12 service links on the homepage, found ${services.length}`);
ok(cases.length >= 3, `expected at least 3 case-study links, found ${cases.length}`);
for (const s of services) {
  const n = boot(`?service=${s}`);
  ok((n.detail?.innerHTML || '').length > 1000, `service route "${s}" rendered empty`);
}
for (const c of cases) {
  const n = boot(`?case=${c}`);
  const h = n.detail?.innerHTML || '';
  ok(h.length > 1000, `case route "${c}" rendered empty`);
  ok(h.includes('gate-form'), `case route "${c}" missing the lead-capture gate`);
}
const nf = boot('?service=does-not-exist');
ok((nf.detail?.innerHTML || '').includes('Page Not Found'), 'unknown slug should show Not Found');

/* ---- 5. the in-browser self-check --------------------------------------- */
head('self-check');
{
  const out = {};
  delete require.cache[require.resolve('./site.js')];
  global.document = {
    addEventListener: (e, f) => { if (e === 'DOMContentLoaded') global.__r = f; },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  };
  Object.defineProperty(global.document, 'body', { get: () => out, set: () => {} });
  global.window = {}; global.location = { search: '?selftest' };
  require('./site.js'); global.__r();
  const text = (out.innerHTML || '').replace(/<[^>]+>/g, '');
  ok(text.includes('PASS'), `data self-check failed:\n${text}`);
}

console.log(fails ? `\n${fails} FAILURE(S)\n` : `\nALL CHECKS PASSED — ${services.length} services, ${cases.length} case studies, ${PAGES.length} pages\n`);
process.exit(fails ? 1 : 0);
