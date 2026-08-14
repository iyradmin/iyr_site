/* Static page generator.  Run:  node build.cjs
 *
 * Why this exists: we sell SEO and AI Search Optimisation. Service pages that
 * live on query strings and render client-side are invisible to crawlers and
 * to answer engines — the exact failure we charge clients to fix. This bakes
 * every service and case study into a real indexed URL with its content in
 * the HTML source, then writes a sitemap.
 *
 *   /services/<slug>.html
 *   /work/<slug>.html
 *   /sitemap.xml
 *
 * detail.html stays as a fallback for old ?service= / ?case= links.
 * Re-run this after editing DATA in site.js.
 */
const fs = require('fs');
const path = require('path');

/* ---- load site.js under a minimal DOM so we can call its renderers ------ */
const El = () => ({
  set innerHTML(v) {}, get innerHTML() { return ''; },
  classList: { add() {}, remove() {}, toggle() { return true; } }, style: {},
  addEventListener() {}, focus() {}, setAttribute() {}, textContent: '',
  querySelector() { return El(); }, querySelectorAll() { return []; },
});
global.document = {
  addEventListener() {}, getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [],
  body: { classList: { add() {}, remove() {}, toggle() { return true; } } },
};
global.window = {}; global.location = { search: '' };
global.IntersectionObserver = class { observe() {} unobserve() {} };

const S = require('./site.js');
const { CONFIG, DATA, icon, serviceDetail, caseDetail } = S;
const NAV = DATA.nav.filter((n) => !n.when || n.when(DATA));

/* ---- site root. Change if you deploy to a subdirectory. ---------------- */
const ORIGIN = process.env.SITE_ORIGIN || 'https://www.inyourreach.example';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Nav and footer are rendered by site.js at runtime, but a crawler needs the
   links in the source — so we emit a no-JS nav too, hidden from sighted users
   only in the sense that site.js replaces it on load. */
function shell({ title, desc, body, depth, canonical, schema }) {
  const up = '../'.repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonical}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap">
  <link rel="stylesheet" href="${up}style.css">
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body data-base="${up}">
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header" id="header">
    <div class="container nav">
      <a class="brand" href="${up}index.html">In Your <span>Reach</span></a>
      <nav class="nav-links">
        ${NAV.map((n) => `<a href="${up}${n.href}">${esc(n.label)}</a>`).join('\n        ')}
        <a class="btn btn-primary" href="${up}index.html#contact">${esc(CONFIG.cta)}</a>
      </nav>
    </div>
  </header>

  <main id="main">
${body}
  </main>

  <footer class="site-footer" id="footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <a class="brand" href="${up}index.html">In Your <span>Reach</span></a>
          <p class="muted" style="margin-top:1rem;max-width:32ch;font-size:.9rem">${esc(CONFIG.tagline)}.</p>
        </div>
        <div>
          <h4>Services</h4>
          <ul>${Object.entries(DATA.services).map(([slug, s]) =>
            `<li><a href="${up}services/${slug}.html">${esc(s.title)}</a></li>`).join('')}</ul>
        </div>
        <div>
          <h4>Company</h4>
          <ul>${NAV.map((n) => `<li><a href="${up}${n.href}">${esc(n.label)}</a></li>`).join('')}</ul>
        </div>
        <div>
          <h4>Get in touch</h4>
          <ul>
            <li><a href="mailto:${CONFIG.email}">${CONFIG.email}</a></li>
            <li><span class="muted" style="font-size:.9rem">${esc(CONFIG.address)}</span></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom"><span>&copy; <span id="year"></span> ${esc(CONFIG.brand)}. All rights reserved.</span></div>
    </div>
  </footer>
  <script src="${up}site.js"></script>
</body>
</html>
`;
}

/* Rewrite the runtime links so a baked page points at other baked pages. */
const rebase = (html, depth) => {
  const up = '../'.repeat(depth);
  return html
    .replace(/href="detail\.html\?service=([a-z0-9-]+)"/g, `href="${up}services/$1.html"`)
    .replace(/href="detail\.html\?case=([a-z0-9-]+)"/g, `href="${up}work/$1.html"`)
    .replace(/href="(index|portfolio|clients)\.html/g, `href="${up}$1.html`)
    .replace(/href="#contact"/g, `href="${up}index.html#contact"`);
};

const out = [];
function write(rel, content) {
  const full = path.join(__dirname, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  out.push(rel);
}

/* ---- service pages ------------------------------------------------------ */
for (const [slug, s] of Object.entries(DATA.services)) {
  const url = `${ORIGIN}/services/${slug}.html`;
  write(`services/${slug}.html`, shell({
    title: `${s.title} — ${CONFIG.brandShort}`,
    desc: s.desc,
    depth: 1,
    canonical: url,
    body: rebase(serviceDetail(s), 1),
    schema: {
      '@context': 'https://schema.org', '@type': 'Service',
      name: s.title, description: s.desc, url,
      provider: { '@type': 'Organization', name: CONFIG.brand, url: ORIGIN },
      areaServed: 'IN',
      hasOfferCatalog: {
        '@context': 'https://schema.org', '@type': 'OfferCatalog', name: `${s.title} deliverables`,
        itemListElement: s.features.map((f) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: f } })),
      },
    },
  }));
}

/* ---- case studies (gated: teaser + metrics indexed, body is not) -------- */
for (const [slug, c] of Object.entries(DATA.cases)) {
  const url = `${ORIGIN}/work/${slug}.html`;
  write(`work/${slug}.html`, shell({
    title: `${c.title} — ${CONFIG.brandShort}`,
    desc: c.teaser,
    depth: 1,
    canonical: url,
    body: rebase(caseDetail(c, slug), 1),
    schema: {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: c.title, description: c.teaser, url,
      publisher: { '@type': 'Organization', name: CONFIG.brand, url: ORIGIN },
    },
  }));
}

/* ---- sitemap + robots --------------------------------------------------- */
const urls = [
  { loc: `${ORIGIN}/`, pri: '1.0' },
  { loc: `${ORIGIN}/portfolio.html`, pri: '0.7' },
  { loc: `${ORIGIN}/clients.html`, pri: '0.6' },
  ...Object.keys(DATA.services).map((s) => ({ loc: `${ORIGIN}/services/${s}.html`, pri: '0.9' })),
  ...Object.keys(DATA.cases).map((c) => ({ loc: `${ORIGIN}/work/${c}.html`, pri: '0.8' })),
];
write('sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u.loc}</loc><priority>${u.pri}</priority></url>`).join('\n') +
  `\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /_private/\nDisallow: /_refs/\nDisallow: /_logos/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);

console.log(`built ${out.length} files:`);
console.log(`  ${Object.keys(DATA.services).length} service pages`);
console.log(`  ${Object.keys(DATA.cases).length} case study pages`);
console.log(`  sitemap.xml, robots.txt`);
console.log(`\norigin: ${ORIGIN}`);
console.log(`  set SITE_ORIGIN=https://yourdomain.com before running, or edit ORIGIN in build.cjs`);
