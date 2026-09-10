/* ==========================================================================
 * TABESH — main.js
 * i18n engine, language switching (RTL/LTR), dynamic product rendering,
 * optional video handling, navigation and UI behavior.
 * Plain vanilla JS — no frameworks, no backend.
 * ========================================================================== */
(function () {
  'use strict';

  var DATA = window.TABESH || {};
  var LANGS = DATA.LANGS || {};
  var TRANSLATIONS = DATA.TRANSLATIONS || {};
  var PRODUCTS = DATA.PRODUCTS || [];
  var PROJECTS = DATA.PROJECTS || [];
  var WORKSHOP = DATA.WORKSHOP || [];
  var WORKSHOP_CATEGORIES = DATA.WORKSHOP_CATEGORIES || {};
  var GALLERY = DATA.GALLERY || [];

  var STORAGE_KEY = 'tabesh.lang';
  var PLACEHOLDER_IMG = 'assets/images/placeholder.svg';
  var BOOTSTRAP_CSS = {
    ltr: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    rtl: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css'
  };

  var state = { lang: 'fa' };

  /* ---------------------------- helpers ---------------------------- */
  function isLang(l) { return Object.prototype.hasOwnProperty.call(LANGS, l); }

  /** Translate a key for the current language, falling back to fa. */
  function t(key) {
    var cur = TRANSLATIONS[state.lang] || {};
    var def = TRANSLATIONS.fa || {};
    if (cur[key] !== undefined) return cur[key];
    if (def[key] !== undefined) return def[key];
    return key;
  }

  /** Pick the current-language string from a localized object {fa,en,ar,tr}. */
  function loc(obj) {
    if (obj == null) return '';
    if (typeof obj === 'string') return obj;
    return obj[state.lang] || obj.fa || '';
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ------------------------------ i18n ------------------------------ */
  function applyStaticTranslations() {
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }
    var ph = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < ph.length; j++) {
      ph[j].setAttribute('placeholder', t(ph[j].getAttribute('data-i18n-placeholder')));
    }
    var ar = document.querySelectorAll('[data-i18n-aria]');
    for (var m = 0; m < ar.length; m++) {
      ar[m].setAttribute('aria-label', t(ar[m].getAttribute('data-i18n-aria')));
    }
    document.title = t('meta.title');
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', t('meta.description'));
    var yr = document.getElementById('footerYear');
    if (yr) yr.textContent = String(new Date().getFullYear());
  }

  /** Direction-dependent bits: process arrows + RTL/LTR Bootstrap stylesheet. */
  function updateDirDependent() {
    var isRTL = LANGS[state.lang].dir === 'rtl';
    var seps = document.querySelectorAll('.step-sep i');
    for (var i = 0; i < seps.length; i++) {
      seps[i].className = 'bi ' + (isRTL ? 'bi-arrow-left' : 'bi-arrow-right');
    }
    var bcss = document.querySelector('link[data-bs-css]');
    if (bcss) bcss.setAttribute('href', isRTL ? BOOTSTRAP_CSS.rtl : BOOTSTRAP_CSS.ltr);
  }

  function setLangButton() {
    var lbl = document.getElementById('langLabel');
    if (lbl) lbl.textContent = LANGS[state.lang].name;
    var items = document.querySelectorAll('#langMenu .dropdown-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('active', items[i].getAttribute('data-lang') === state.lang);
    }
  }

  function setLanguage(lang) {
    if (!isLang(lang)) lang = 'fa';
    state.lang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* private mode */ }
    var html = document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', LANGS[lang].dir);
    applyStaticTranslations();
    updateDirDependent();
    setLangButton();
    renderProducts();
    renderProjects();
    renderWorkshop();
    renderGallery();
  }

  /* ---------------------------- products ---------------------------- */
  /** Resolve a category object from TABESH.CATEGORIES (or inline object). */
  function categoryOf(p) {
    if (!p || !p.category) return null;
    var cats = DATA.CATEGORIES || {};
    if (typeof p.category === 'string') return cats[p.category] || null;
    return p.category; /* backward compat: inline localized object */
  }

  function productCard(p) {
    var img = p.image || PLACEHOLDER_IMG;
    var cat = categoryOf(p);
    var h = '';
    h += '<div class="col-12 col-lg-4" data-reveal>';
    h += '<article class="product-card">';
    h += '<div class="product-media"><img src="' + esc(img) + '" alt="' + esc(loc(p.name)) +
         '" loading="lazy" decoding="async"' +
         ' onerror="this.onerror=null;this.src=\'' + PLACEHOLDER_IMG + '\';"></div>';
    h += '<div class="product-body">';
    if (cat) {
      h += '<span class="product-cat">' + esc(loc(cat.label || cat)) + '</span>';
    }
    if (p.code) {
      h += '<span class="product-code">' + esc(p.code) + '</span>';
    }
    h += '<h3 class="product-title">' + esc(loc(p.name)) + '</h3>';
    var short = p.shortDescription || p.short;
    if (short) {
      h += '<p class="product-short">' + esc(loc(short)) + '</p>';
    }
    if (p.description) {
      h += '<details class="product-more"><summary>' + esc(t('products.more')) + '</summary>' +
           '<p>' + esc(loc(p.description)) + '</p></details>';
    }

    if (p.specs && p.specs.length) {
      h += '<h4 class="product-subhead">' + esc(t('products.specs.title')) + '</h4>';
      h += '<table class="spec-table"><tbody>';
      for (var i = 0; i < p.specs.length; i++) {
        var s = p.specs[i];
        h += '<tr><th scope="row">' + esc(loc(s.label)) + '</th><td>';
        if (s.value) {
          h += '<span class="spec-value">' + esc(loc(s.value)) + '</span>';
          if (s.unit) h += ' <span class="spec-unit">' + esc(loc(s.unit)) + '</span>';
        } else {
          h += '<span class="spec-value spec-placeholder">' + esc(t('products.placeholder.spec')) + '</span>';
        }
        h += '</td></tr>';
      }
      h += '</tbody></table>';
    }

    if (p.applications && p.applications.length) {
      h += '<h4 class="product-subhead">' + esc(t('products.apps.title')) + '</h4><div class="app-chips">';
      for (var j = 0; j < p.applications.length; j++) {
        h += '<span class="app-chip"><i class="bi bi-check2" aria-hidden="true"></i>' + esc(loc(p.applications[j])) + '</span>';
      }
      h += '</div>';
    }

    /* Action row: video button rendered ONLY when a video is set; the
       inquiry link is data-driven (type/href) and defaults to #contact. */
    h += '<div class="product-actions">';
    if (p.video) {
      h += '<button type="button" class="btn btn-gold watch-video" data-product-id="' + esc(p.id) + '">' +
           '<i class="bi bi-play-circle" aria-hidden="true"></i><span>' + esc(t('products.video.btn')) + '</span></button>';
    }
    var inq = p.inquiry || {};
    var inqHref = inq.href || '#contact';
    h += '<a class="product-inquiry" href="' + esc(inqHref) + '" aria-label="' +
         esc(t('products.inquiry') + ' — ' + loc(p.name)) + '">' +
         '<i class="bi bi-chat-square-text" aria-hidden="true"></i><span>' + esc(t('products.inquiry')) + '</span></a>';
    h += '</div>';

    h += '</div></article></div>';
    return h;
  }

  function renderProducts() {
    var grid = document.getElementById('productsGrid');
    if (!grid) return;
    if (!PRODUCTS || !PRODUCTS.length) {
      grid.innerHTML = '<div class="products-empty">' + esc(t('products.empty')) + '</div>';
      return;
    }
    var h = '';
    for (var i = 0; i < PRODUCTS.length; i++) h += productCard(PRODUCTS[i]);
    grid.innerHTML = h;
    revealInit();
  }

  /* -------------------- projects / workshop / gallery -------------------- */
  /* Phase 6 data-driven sections. Images use a shared helper: every non-hero
     image is lazy-loaded, decoded asynchronously and falls back to the
     preserved placeholder when missing. */

  /** Standard non-hero image markup with placeholder fallback. */
  function renderImg(src, alt, klass) {
    var s = src || PLACEHOLDER_IMG;
    var c = klass ? ' class="' + esc(klass) + '"' : '';
    return '<img src="' + esc(s) + '" alt="' + esc(alt) + '"' + c +
           ' loading="lazy" decoding="async"' +
           ' onerror="this.onerror=null;this.src=\'' + PLACEHOLDER_IMG + '\';">';
  }

  /** Preserved Phase 3 placeholder tile (icon + label), generated from data
      so the sections stay data-driven even while the arrays are empty. */
  function placeholderTile(icon, labelKey, captionKey) {
    var h = '<div class="place-tile" data-reveal>';
    h += '<i class="bi ' + esc(icon) + '" aria-hidden="true"></i>';
    h += '<span class="tile-label">' + esc(t(labelKey)) + '</span>';
    if (captionKey) h += '<span class="tile-caption">' + esc(t(captionKey)) + '</span>';
    h += '</div>';
    return h;
  }

  function projectCard(p) {
    var cat = categoryOf(p);
    var h = '<article class="proj-card" data-reveal>';
    h += '<div class="proj-media">' + renderImg(p.image, loc(p.title) || t('projects.tile.label')) + '</div>';
    h += '<div class="proj-body">';
    if (cat || p.year || p.location) {
      h += '<div class="proj-meta">';
      if (cat) {
        h += '<span class="chip chip-gold"><i class="bi ' + esc(cat.icon || 'bi-grid-1x2-gap') +
             '" aria-hidden="true"></i>' + esc(loc(cat.label || cat)) + '</span>';
      }
      if (p.year) {
        h += '<span class="chip"><i class="bi bi-calendar3" aria-hidden="true"></i>' +
             esc(t('projects.year')) + ': ' + esc(p.year) + '</span>';
      }
      if (p.location) {
        h += '<span class="chip"><i class="bi bi-geo-alt" aria-hidden="true"></i>' + esc(loc(p.location)) + '</span>';
      }
      h += '</div>';
    }
    h += '<h3 class="proj-title">' + esc(loc(p.title)) + '</h3>';
    if (p.shortDescription) {
      h += '<p class="proj-short">' + esc(loc(p.shortDescription)) + '</p>';
    }
    if (p.description) {
      h += '<details class="proj-more"><summary>' + esc(t('projects.details')) + '</summary>' +
           '<p>' + esc(loc(p.description)) + '</p></details>';
    }
    h += '</div></article>';
    return h;
  }

  function renderProjects() {
    var grid = document.getElementById('projectsGrid');
    if (!grid) return;
    var h = '';
    if (!PROJECTS || !PROJECTS.length) {
      for (var i = 0; i < 3; i++) {
        h += placeholderTile('bi-collection', 'projects.tile.label', 'projects.tile.caption');
      }
    } else {
      for (var j = 0; j < PROJECTS.length; j++) h += projectCard(PROJECTS[j]);
    }
    grid.innerHTML = h;
    revealInit();
  }

  /** Resolve a workshop category key via TABESH.WORKSHOP_CATEGORIES (or inline). */
  function workshopCategoryOf(w) {
    if (!w || !w.category) return null;
    if (typeof w.category === 'string') return WORKSHOP_CATEGORIES[w.category] || null;
    return w.category; /* inline localized object */
  }

  function workshopItem(w) {
    var cat = workshopCategoryOf(w);
    var title = w.title ? loc(w.title) : (cat ? loc(cat.label) : '');
    var h = '<figure class="ws-item" data-reveal>';
    h += '<div class="ws-media">' + renderImg(w.image, w.alt || title || t('workshop.tile.label')) + '</div>';
    if (title) {
      h += '<figcaption class="ws-cap"><i class="bi ' + esc((cat && cat.icon) || 'bi-image') +
           '" aria-hidden="true"></i>' + esc(title) + '</figcaption>';
    }
    h += '</figure>';
    return h;
  }

  function renderWorkshop() {
    var grid = document.getElementById('workshopGrid');
    if (!grid) return;
    var h = '';
    if (!WORKSHOP || !WORKSHOP.length) {
      var icons = ['bi-hammer', 'bi-gear', 'bi-wrench-adjustable', 'bi-nut-fill'];
      for (var i = 0; i < icons.length; i++) {
        h += placeholderTile(icons[i], 'workshop.tile.label', null);
      }
    } else {
      for (var j = 0; j < WORKSHOP.length; j++) h += workshopItem(WORKSHOP[j]);
    }
    grid.innerHTML = h;
    revealInit();
  }

  function galleryItem(g, index) {
    var cat = categoryOf(g);
    var title = g.title ? loc(g.title) : '';
    var alt = g.alt || title || t('gallery.open');
    var cap = title + (cat ? (title ? ' — ' : '') + loc(cat.label) : '');
    var h = '<button type="button" class="gallery-item" data-reveal data-gallery-index="' + index + '"' +
            ' aria-label="' + esc(alt) + '">';
    h += renderImg(g.image, alt);
    if (cap) h += '<span class="gallery-cap">' + esc(cap) + '</span>';
    h += '</button>';
    return h;
  }

  function renderGallery() {
    var grid = document.getElementById('galleryGrid');
    if (!grid) return;
    var h = '';
    if (!GALLERY || !GALLERY.length) {
      for (var i = 0; i < 6; i++) {
        h += placeholderTile('bi-image', 'gallery.tile.label', null);
      }
    } else {
      for (var j = 0; j < GALLERY.length; j++) h += galleryItem(GALLERY[j], j);
    }
    grid.innerHTML = h;
    revealInit();
  }

  /* ------------------------- image viewer modal ------------------------- */
  /* Bootstrap-modal lightbox for the Gallery: large image, title, prev/next
     (only when more than one item), Escape / backdrop close, focus return to
     the opened thumbnail and background scroll lock (native Bootstrap). */
  var viewerState = { trigger: null, items: [], index: 0 };

  function wrapIndex(i) {
    var n = viewerState.items.length;
    return ((i % n) + n) % n;
  }

  function showViewerImage() {
    var item = viewerState.items[viewerState.index];
    var img = document.getElementById('imageViewerImg');
    if (!img) return;
    img.src = item.image || PLACEHOLDER_IMG;
    img.setAttribute('onerror', "this.onerror=null;this.src='" + PLACEHOLDER_IMG + "';");
    var title = item.title ? loc(item.title) : (item.alt || t('gallery.open'));
    var titleEl = document.getElementById('imageModalTitle');
    if (titleEl) titleEl.textContent = title;
    var cap = document.getElementById('imageCaption');
    if (cap) cap.textContent = item.alt || title;
    var counter = document.getElementById('imageCounter');
    var multiple = viewerState.items.length > 1;
    if (counter) counter.textContent = multiple ? (viewerState.index + 1) + ' / ' + viewerState.items.length : '';
    var prev = document.getElementById('imagePrev');
    var next = document.getElementById('imageNext');
    if (prev) prev.classList.toggle('d-none', !multiple);
    if (next) next.classList.toggle('d-none', !multiple);
  }

  function openImageViewer(items, index, triggerEl) {
    if (!items || !items.length) return;
    var modalEl = document.getElementById('imageModal');
    if (!modalEl || !window.bootstrap) return;
    viewerState.items = items;
    viewerState.index = Math.max(0, Math.min(index, items.length - 1));
    viewerState.trigger = triggerEl || null;
    showViewerImage();
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
    var closeEl = document.getElementById('imageViewerClose');
    modalEl.addEventListener('shown.bs.modal', function () {
      if (closeEl) closeEl.focus();
    }, { once: true });
    modalEl.addEventListener('hidden.bs.modal', function () {
      viewerState.items = [];
      viewerState.index = 0;
      var trig = viewerState.trigger;
      viewerState.trigger = null;
      if (trig) trig.focus();
    }, { once: true });
  }

  function stepViewer(delta) {
    if (!viewerState.items.length) return;
    viewerState.index = wrapIndex(viewerState.index + delta);
    showViewerImage();
  }

  function openVideoFor(productId, triggerEl) {
    var p = null;
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].id === productId) { p = PRODUCTS[i]; break; }
    }
    if (!p || !p.video) return;

    var player  = document.getElementById('videoPlayer');
    var missing = document.getElementById('videoMissing');
    var titleEl = document.getElementById('videoModalTitle');
    var modalEl = document.getElementById('videoModal');
    if (!player || !modalEl || !window.bootstrap) return;

    if (titleEl) titleEl.textContent = loc(p.name);
    if (missing) missing.classList.add('d-none');

    player.onerror = function () {
      player.classList.add('d-none');
      if (missing) missing.classList.remove('d-none');
    };
    player.classList.remove('d-none');
    if (p.poster) { player.setAttribute('poster', p.poster); } else { player.removeAttribute('poster'); }
    player.setAttribute('src', p.video);
    player.load();

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
    modalEl.addEventListener('hidden.bs.modal', function () {
      player.onerror = null;
      player.pause();
      try { player.currentTime = 0; } catch (guard) { /* ignore */ }
      player.removeAttribute('src');
      player.load();
      player.classList.remove('d-none');
      if (missing) missing.classList.add('d-none');
      if (triggerEl && triggerEl.focus) triggerEl.focus();
    }, { once: true });
  }

  /* ----------------------- reveal on scroll ----------------------- */
  var revealObserver = null;
  function revealInit() {
    if (!('IntersectionObserver' in window)) {
      var all = document.querySelectorAll('[data-reveal]');
      for (var k = 0; k < all.length; k++) all[k].classList.add('revealed');
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            entries[i].target.classList.add('revealed');
            revealObserver.unobserve(entries[i].target);
          }
        }
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    }
    var nodes = document.querySelectorAll('[data-reveal]:not(.revealed)');
    for (var j = 0; j < nodes.length; j++) revealObserver.observe(nodes[j]);
  }

  /* --------------------------- UI events --------------------------- */
  function bindEvents() {
    /* language menu */
    var menu = document.getElementById('langMenu');
    if (menu) {
      menu.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-lang]');
        if (btn) setLanguage(btn.getAttribute('data-lang'));
      });
    }

    /* close the mobile menu after choosing a section */
    var nav = document.getElementById('mainNav');
    if (nav) {
      nav.addEventListener('click', function (e) {
        if (!e.target.closest('a.nav-link')) return;
        var collapse = nav.querySelector('.navbar-collapse');
        if (collapse && collapse.classList.contains('show') && window.bootstrap) {
          bootstrap.Collapse.getOrCreateInstance(collapse).hide();
        }
      });
    }

    /* product "Watch Video" buttons (delegated) — the button keeps focus and
       receives it back when the video modal closes */
    var grid = document.getElementById('productsGrid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        var btn = e.target.closest('.watch-video');
        if (btn) openVideoFor(btn.getAttribute('data-product-id'), btn);
      });
    }

    /* gallery image viewer (delegated): opening thumbnail keeps focus and
       receives it back when the modal closes */
    var gal = document.getElementById('galleryGrid');
    if (gal) {
      gal.addEventListener('click', function (e) {
        var btn = e.target.closest('.gallery-item');
        if (!btn) return;
        var idx = Number(btn.getAttribute('data-gallery-index'));
        openImageViewer(GALLERY, idx, btn);
      });
    }

    /* image viewer previous / next */
    var prevBtn = document.getElementById('imagePrev');
    if (prevBtn) prevBtn.addEventListener('click', function () { stepViewer(-1); });
    var nextBtn = document.getElementById('imageNext');
    if (nextBtn) nextBtn.addEventListener('click', function () { stepViewer(1); });

    /* contact form — demo only; a delivery service is connected in a later phase */
    var form = document.getElementById('contactForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
        form.classList.remove('was-validated');
        var alertEl = document.getElementById('formAlert');
        if (alertEl) alertEl.classList.remove('d-none');
        form.reset();
      });
    }

    /* back to top + navbar shadow */
    var back = document.getElementById('backToTop');
    var onScroll = function () {
      if (back) back.classList.toggle('show', window.scrollY > 420);
      if (nav) nav.classList.toggle('navbar-scrolled', window.scrollY > 10);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    if (back) {
      back.addEventListener('click', function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    onScroll();
  }

  /* ------------------------------ init ------------------------------ */
  function init() {
    document.documentElement.classList.add('js'); /* enables reveal CSS safely */
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    setLanguage(isLang(saved) ? saved : 'fa');
    bindEvents();
    revealInit();
    if (window.bootstrap && bootstrap.ScrollSpy) {
      bootstrap.ScrollSpy.getOrCreateInstance(document.body, {
        target: '#navMenu',
        rootMargin: '-90px 0px -65%',
        smoothScroll: false
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
