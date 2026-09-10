/* ==========================================================================
 * TABESH — scripts/check.js  (Phase 6)
 * Offline validation of the data architecture and the data-driven renderers.
 * No browser needed: data.js is loaded in a sandbox, main.js is executed
 * against a minimal DOM stub so every section renderer actually runs.
 *
 *   node scripts/check.js
 *
 * Exits non-zero on any failure.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LANGS = ['fa', 'en', 'ar', 'tr'];
let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log('FAIL  ' + msg); } };
const done = (msg) => console.log('ok    ' + msg);
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, '');

/* ------------------------------ load data.js ------------------------------ */
function loadData() {
  let src = read('assets/js/data.js');
  src = src.replace(
    'window.TABESH = window.TABESH || {};',
    'var TABESH = window.TABESH = window.TABESH || {};'
  );
  const win = { TABESH: undefined };
  new Function('window', src)(win);
  return win.TABESH;
}
const T = loadData();

/* ------------------------------- i18n checks ------------------------------- */
const keySets = LANGS.map(l => new Set(Object.keys(T.TRANSLATIONS[l] || {})));
const allKeys = new Set();
keySets.forEach(s => s.forEach(k => allKeys.add(k)));
allKeys.forEach(k => keySets.forEach((s, i) => {
  ok(s.has(k), 'i18n key missing in ' + LANGS[i] + ': ' + k);
}));
done('i18n key sets identical across ' + LANGS.join('/') + ' (' + allKeys.size + ' keys)');

const requiredKeys = [
  'projects.details', 'projects.year', 'projects.location',
  'gallery.open', 'gallery.prev', 'gallery.next',
  'products.empty', 'products.more', 'misc.video.close',
  'misc.video.missing', 'workshop.tile.label', 'gallery.tile.label',
  'projects.tile.label', 'projects.tile.caption'
];
requiredKeys.forEach(k => LANGS.forEach(l => {
  ok(T.TRANSLATIONS[l] && String(T.TRANSLATIONS[l][k]).length > 0,
     'required i18n key missing/empty ' + k + ' in ' + l);
}));
done('required i18n keys present in all languages');

/* --------------------------- category checks --------------------------- */
ok(T.CATEGORIES && typeof T.CATEGORIES === 'object', 'TABESH.CATEGORIES defined');
LANGS.forEach(l => Object.keys(T.CATEGORIES || {}).forEach(id => {
  const c = T.CATEGORIES[id];
  ok(c && c.label && c.label[l] && String(c.label[l]).length > 0,
     'product category "' + id + '" label missing in ' + l);
  ok(c.icon && /^bi-/.test(c.icon), 'product category "' + id + '" icon invalid');
}));

const WS_TYPES = ['workshop', 'cnc', 'welding', 'assembly', 'electronics', 'testing', 'manufacturing'];
ok(T.WORKSHOP_CATEGORIES && typeof T.WORKSHOP_CATEGORIES === 'object', 'TABESH.WORKSHOP_CATEGORIES defined');
WS_TYPES.forEach(id => {
  const c = T.WORKSHOP_CATEGORIES ? T.WORKSHOP_CATEGORIES[id] : null;
  ok(c && typeof c === 'object', 'workshop category "' + id + '" present');
  LANGS.forEach(l => ok(c && c.label && c.label[l], 'workshop category "' + id + '" label[' + l + ']'));
  ok(c && c.icon && /^bi-/.test(c.icon), 'workshop category "' + id + '" icon invalid');
});
done('product + workshop categories resolve in all languages');

/* --------------------------- asset path policy --------------------------- */
const badRef = (v) => (typeof v === 'string') && (v.indexOf('data:') === 0 || v.indexOf('://') !== -1);
[['PRODUCTS', 'PRODUCTS'], ['PROJECTS', 'PROJECTS'], ['WORKSHOP', 'WORKSHOP'], ['GALLERY', 'GALLERY']].forEach(([group]) => {
  (T[group] || []).forEach(item => {
    ['image', 'poster', 'video'].forEach(f => {
      const v = item[f];
      if (typeof v === 'string') {
        ok(!badRef(v), group + '.' + (item.id || '?') + '.' + f + ' must be a local path, got: ' + v);
        ok(v.indexOf('assets/') === 0, group + '.' + (item.id || '?') + '.' + f + ' must start with assets/: ' + v);
      }
    });
    if (group === 'PRODUCTS') {
      ok(item.video !== '', 'product ' + item.id + ': video must stay null/absent, not an empty string');
    }
  });
});
done('no base64 / external asset references (local paths only)');

/* ------------------------------ schema checks ------------------------------ */
function localized(val) { return val && typeof val === 'object' && !Array.isArray(val); }
function hasAllLangs(obj) { return obj && LANGS.every(l => obj[l] && String(obj[l]).length > 0); }

const ids = {};
function checkUnique(group, id) {
  const key = group + ':' + id;
  ok(id && typeof id === 'string', group + ': every item needs a string id');
  ok(!ids[key], group + ': duplicate id "' + id + '"');
  ids[key] = true;
}

T.PRODUCTS.forEach(p => {
  checkUnique('products', p.id);
  ok(hasAllLangs(p.name), 'product ' + p.id + ': localized name');
  const short = p.shortDescription || p.short;
  ok(hasAllLangs(short), 'product ' + p.id + ': localized shortDescription/short');
  const cat = typeof p.category === 'string' ? T.CATEGORIES[p.category] : p.category;
  ok(cat && cat.label, 'product ' + p.id + ': category unresolvable');
  ok(p.inquiry && p.inquiry.type, 'product ' + p.id + ': inquiry CTA defined');
  if (p.description !== null && p.description !== undefined) ok(hasAllLangs(p.description), 'product ' + p.id + ': description localized');
  if (p.specs === undefined || p.applications === undefined) {
    ok(false, 'product ' + p.id + ': specs/applications should exist (may be [])');
  }
});

T.PROJECTS.forEach(p => {
  checkUnique('projects', p.id);
  ok(hasAllLangs(p.title), 'project ' + p.id + ': localized title');
  if (p.shortDescription) ok(hasAllLangs(p.shortDescription), 'project ' + p.id + ': shortDescription localized');
  if (p.description) ok(hasAllLangs(p.description), 'project ' + p.id + ': description localized');
  if (p.location) ok(hasAllLangs(p.location), 'project ' + p.id + ': location localized');
  if (p.year !== undefined) ok(typeof p.year === 'string' && p.year.length > 0, 'project ' + p.id + ': year should be a non-empty string');
  const cat = typeof p.category === 'string' ? T.CATEGORIES[p.category] : p.category;
  if (p.category) ok(cat && cat.label, 'project ' + p.id + ': category unresolvable');
  if (Array.isArray(p.gallery)) {
    const gids = new Set(T.GALLERY.map(g => g.id));
    p.gallery.forEach(ref => ok(typeof ref === 'string' && (gids.has(ref) || ref.indexOf('assets/') === 0),
      'project ' + p.id + ': gallery ref must be a gallery id or local path: ' + ref));
  }
});

T.WORKSHOP.forEach(w => {
  checkUnique('workshop', w.id);
  ok(w.category === undefined || typeof w.category === 'string' || localized(w.category),
     'workshop ' + w.id + ': category must be a string key or inline object');
  if (typeof w.category === 'string') {
    ok(!!T.WORKSHOP_CATEGORIES[w.category], 'workshop ' + w.id + ': unknown category "' + w.category + '"');
  }
  if (w.title) ok(hasAllLangs(w.title), 'workshop ' + w.id + ': title localized');
  if (w.alt) ok(typeof w.alt === 'string' && w.alt.length > 0, 'workshop ' + w.id + ': alt should be a text string');
});

T.GALLERY.forEach(g => {
  checkUnique('gallery', g.id);
  if (g.title) ok(hasAllLangs(g.title), 'gallery ' + g.id + ': title localized');
  if (g.alt) ok(typeof g.alt === 'string', 'gallery ' + g.id + ': alt should be a text string');
  const cat = typeof g.category === 'string' ? T.CATEGORIES[g.category] : g.category;
  if (g.category) ok(cat && cat.label, 'gallery ' + g.id + ': category unresolvable');
  if (g.projectId) ok(T.PROJECTS.some(p => p.id === g.projectId), 'gallery ' + g.id + ': projectId does not match any project');
});
done('schema checks: PRODUCTS / PROJECTS / WORKSHOP / GALLERY');

/* ---------------------- sandboxed renderer smoke tests ---------------------- */
function buildSandbox(dataOf) {
  const elements = new Map();
  function elementStub(id) {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set();
    const attrs = new Map();
    const el = {
      id,
      innerHTML: '',
      textContent: '',
      className: '',
      disabled: false,
      classList: {
        add: function () { for (let i = 0; i < arguments.length; i++) classes.add(arguments[i]); },
        remove: function () { for (let i = 0; i < arguments.length; i++) classes.delete(arguments[i]); },
        contains: (c) => classes.has(c),
        toggle: function (c, force) {
          const on = force === undefined ? !classes.has(c) : !!force;
          if (on) classes.add(c); else classes.delete(c);
          return on;
        }
      },
      setAttribute: (a, v) => { attrs.set(a, String(v)); },
      removeAttribute: (a) => { attrs.delete(a); },
      getAttribute: (a) => attrs.get(a),
      focus() {},
      addEventListener() {}
    };
    elements.set(id, el);
    return el;
  }
  const doc = {
    readyState: 'complete',
    title: '',
    documentElement: { classList: { add() {} }, setAttribute() {} },
    body: {},
    getElementById: (id) => elementStub(id),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const win = {
    TABESH: dataOf(T),
    localStorage: { getItem: () => null, setItem() {} },
    addEventListener() {},
    scrollY: 0
  };
  const mainSrc = read('assets/js/main.js');
  new Function('window', 'document', mainSrc)(win, doc);
  return elements;
}

function runSandbox(name, dataOf, asserts) {
  let threw = null;
  try {
    const els = buildSandbox(dataOf);
    if (asserts) asserts(els);
  } catch (e) {
    threw = e;
  }
  if (threw) { ok(false, name + ': renderer threw: ' + threw.message); return; }
  done(name);
}

/* Sample (invented ONLY for the test) content proving every render path. */
const sample = {
  PRODUCTS: [
    { id: 'sample-x1', category: 'solar', name: { fa: 'محصول آزمایشی ۱', en: 'Sample Product 1', ar: 'منتج تجريبي 1', tr: 'Örnek Ürün 1' },
      shortDescription: { fa: 'توضیح کوتاه', en: 'Short description', ar: 'وصف قصير', tr: 'Kısa açıklama' },
      image: null, video: null, inquiry: { type: 'info' }, specs: [], applications: [] },
    { id: 'sample-x2', category: 'solar', name: { fa: 'محصول آزمایشی ۲', en: 'Sample Product 2', ar: 'منتج تجريبي 2', tr: 'Örnek Ürün 2' },
      shortDescription: { fa: 'توضیح کوتاه', en: 'Short description', ar: 'وصف قصير', tr: 'Kısa açıklama' },
      image: null, video: 'assets/videos/products/sample-x2.mp4',
      poster: 'assets/images/products/posters/sample-x2.jpg',
      inquiry: { type: 'info' }, specs: [], applications: [] }
  ],
  PROJECTS: [
    { id: 'sample-p1', image: null, category: 'solar',
      title: { fa: 'پروژه نمونه ۱', en: 'Sample Project 1', ar: 'مشروع تجريبي 1', tr: 'Örnek Proje 1' },
      shortDescription: { fa: 'خلاصه پروژه', en: 'Project summary', ar: 'ملخص المشروع', tr: 'Proje özeti' },
      description: { fa: 'توضیح کامل', en: 'Full description', ar: 'وصف كامل', tr: 'Tam açıklama' },
      year: '2024',
      location: { fa: 'تهران', en: 'Tehran', ar: 'طهران', tr: 'Tahran' } },
    { id: 'sample-p2', category: { fa: 'داخل', en: 'Inline', ar: 'مضمن', tr: 'Satır içi' },
      title: { fa: 'پروژه نمونه ۲', en: 'Sample Project 2', ar: 'مشروع تجريبي 2', tr: 'Örnek Proje 2' },
      shortDescription: { fa: 'خلاصه پروژه', en: 'Project summary', ar: 'ملخص المشروع', tr: 'Proje özeti' } }
  ],
  WORKSHOP: [
    { id: 'sample-w1', image: null, category: 'cnc',
      title: { fa: 'ماشین‌کاری', en: 'Machining', ar: 'التشغيل', tr: 'İşleme' } },
    { id: 'sample-w2', category: 'welding', alt: 'Arc welding station' }
  ],
  GALLERY: [
    { id: 'g1', image: null, title: { fa: 'تصویر ۱', en: 'Image 1', ar: 'صورة 1', tr: 'Görsel 1' }, category: 'solar', alt: 'Panel test', projectId: 'sample-p1' },
    { id: 'g2', image: null, category: 'cnc', alt: 'Machining' },
    { id: 'g3', image: null, category: 'wood', alt: 'Turning', projectId: 'sample-p2' }
  ]
};

const sampleData = (base) => {
  const data = JSON.parse(JSON.stringify(base));
  data.PRODUCTS = sample.PRODUCTS;
  data.PROJECTS = sample.PROJECTS;
  data.WORKSHOP = sample.WORKSHOP;
  data.GALLERY = sample.GALLERY;
  return data;
};

/* --- render with sample (invented-for-test) content: every path must work --- */
runSandbox('render: sample content', sampleData, (els) => {
  const proj = els.get('projectsGrid').innerHTML;
  ok(proj.indexOf('class="proj-card"') !== -1, 'projects: cards rendered');
  ok(proj.indexOf('انرژی خورشیدی') !== -1, 'projects: category chip localized (fa)');
  ok(proj.indexOf('سال اجرا') !== -1 && proj.indexOf('2024') !== -1, 'projects: year meta chip');
  ok(proj.indexOf('تهران') !== -1, 'projects: location meta chip');
  ok(proj.indexOf('جزئیات پروژه') !== -1 && proj.indexOf('<details class="proj-more">') !== -1, 'projects: details disclosure + i18n summary');
  ok(proj.indexOf('src="assets/images/placeholder.svg"') !== -1, 'projects: placeholder fallback when image missing');
  ok(proj.indexOf('loading="lazy"') !== -1 && proj.indexOf('decoding="async"') !== -1, 'projects: lazy + async images');
  ok(proj.indexOf('>داخل<') !== -1, 'projects: inline category object');

  const ws = els.get('workshopGrid').innerHTML;
  ok(ws.indexOf('class="ws-item"') !== -1, 'workshop: tiles rendered');
  ok(ws.indexOf('ماشین‌کاری') !== -1, 'workshop: item title becomes the caption');
  ok(ws.indexOf('جوش‌کاری') !== -1, 'workshop: category label used as caption when no title');
  ok(ws.indexOf('alt="Arc welding station"') !== -1, 'workshop: alt used');

  const gal = els.get('galleryGrid').innerHTML;
  ok(gal.indexOf('class="gallery-item"') !== -1, 'gallery: items rendered as buttons');
  ok(gal.indexOf('data-gallery-index="0"') !== -1 && gal.indexOf('data-gallery-index="2"') !== -1, 'gallery: indexes wired');
  ok(gal.indexOf('aria-label="Panel test"') !== -1, 'gallery: alt → aria-label');
  ok(gal.indexOf('class="gallery-cap">تصویر ۱ — انرژی خورشیدی') !== -1, 'gallery: caption title + category');

  const prods = els.get('productsGrid').innerHTML;
  ok(prods.indexOf('محصول آزمایشی ۱') !== -1 && prods.indexOf('محصول آزمایشی ۲') !== -1, 'products: both cards rendered');
  const watchCount = prods.split('data-product-id="sample-x2"').length - 1;
  ok(watchCount === 1, 'video: button rendered only for the product that has a video');
});

/* ---- render with empty arrays: preserved placeholders, no broken layout ---- */
runSandbox('render: empty arrays keep preserved placeholders', (base) => {
  const data = JSON.parse(JSON.stringify(base));
  data.PRODUCTS = []; data.PROJECTS = []; data.WORKSHOP = []; data.GALLERY = [];
  return data;
}, (els) => {
  const count = (html, cls) => html.split('class="' + cls + '"').length - 1;
  const proj = els.get('projectsGrid').innerHTML;
  ok(proj.indexOf('bi-collection') !== -1 && proj.indexOf('پروژه — در انتظار تکمیل') !== -1, 'projects: preserved placeholder tiles + i18n label');
  ok(count(proj, 'place-tile') === 3, 'projects: exactly 3 placeholder tiles');
  const ws = els.get('workshopGrid').innerHTML;
  ok(ws.indexOf('bi-hammer') !== -1 && count(ws, 'place-tile') === 4, 'workshop: preserved placeholder tiles (4)');
  const gal = els.get('galleryGrid').innerHTML;
  ok(gal.indexOf('bi-image') !== -1 && count(gal, 'place-tile') === 6, 'gallery: preserved placeholder tiles (6)');
});

/* ------------------------------- HTML sanity ------------------------------- */
const html = read('index.html');
const idRe = /id="([^"]+)"/g;
const idCounts = {};
let m;
while ((m = idRe.exec(html)) !== null) idCounts[m[1]] = (idCounts[m[1]] || 0) + 1;
Object.keys(idCounts).forEach(id => ok(idCounts[id] === 1, 'HTML: duplicate id="' + id + '"'));
['productsGrid', 'projectsGrid', 'workshopGrid', 'galleryGrid',
 'videoModal', 'videoPlayer', 'videoModalTitle', 'videoMissing',
 'imageModal', 'imageViewerImg', 'imagePrev', 'imageNext', 'imageViewerClose',
 'imageModalTitle', 'imageCaption', 'imageCounter'].forEach(id => {
  ok(idCounts[id] === 1, 'HTML: required element id="' + id + '" present exactly once');
});
ok(html.indexOf('<video id="videoPlayer"') !== -1, 'HTML: video player element');
ok(/<video[^>]*controls/.test(html) && /<video[^>]*preload="none"/.test(html), 'HTML: video controls + preload="none"');
ok(html.indexOf('data:image') === -1 && html.indexOf('base64') === -1, 'HTML: no base64 assets');

/* every key referenced by data-i18n / data-i18n-aria / data-i18n-placeholder
   must exist in ALL languages */
const keyRefRe = /data-i18n-aria="([^"]+)"|data-i18n-placeholder="([^"]+)"|data-i18n="([^"]+)"/g;
const refs = {};
while ((m = keyRefRe.exec(html)) !== null) {
  const k = m[1] || m[2] || m[3];
  if (k) refs[k] = true;
}
Object.keys(refs).forEach(k => LANGS.forEach(l => {
  ok(T.TRANSLATIONS[l] && T.TRANSLATIONS[l][k] !== undefined,
     'i18n key "' + k + '" referenced in HTML but missing in ' + l);
}));
done('HTML sanity: ids, video preload, i18n references (' + Object.keys(refs).length + ' unique refs)');

/* ----------------------- product images stay "contain" ----------------------- */
const css = read('assets/css/style.css');
const productMediaBlock = css.split('.product-media img {')[1].split('}')[0];
ok(productMediaBlock.indexOf('object-fit: contain') !== -1, 'CSS: product images keep object-fit: contain');
ok(/\.proj-media img\s*{[^}]*object-fit: cover[^}]*}/s.test(css), 'CSS: project frames use cover');
ok(/\.ws-media img\s*{[^}]*object-fit: cover[^}]*}/s.test(css), 'CSS: workshop frames use cover');
ok(/\.gallery-item img\s*{[^}]*object-fit: cover[^}]*}/s.test(css), 'CSS: gallery frames use cover');
ok(/\[dir="rtl"\] #imagePrev i/.test(css) && /\[dir="rtl"\] #imageNext i/.test(css), 'CSS: viewer chevrons flip for RTL');

/* --------------------------------- report ---------------------------------- */
console.log('---');
console.log(failures === 0 ? 'RESULT: OK' : 'RESULT: FAILED (' + failures + ' failure(s))');
process.exit(failures === 0 ? 0 : 1);