# TABESH — Corporate Website (Phase 1)

Static, single-page corporate website for **تابش انرژی بام شهر / TABESH** —
solar energy equipment, dual-axis solar trackers, CNC machines, wood turning
machines and custom engineering & manufacturing.

- **Stack:** HTML5 + CSS3 + Vanilla JavaScript + Bootstrap 5 + Bootstrap Icons (CDN)
- **No frameworks, no backend, no database** — open `index.html` directly in a
  browser, or serve the folder (e.g. `python -m http.server`) for a cleaner URL.
- **Languages:** فارسی (default, RTL), English, العربية (RTL), Türkçe (LTR).
  Switch with the globe menu in the navbar; the choice is remembered
  (`localStorage`), and Bootstrap's RTL/LTR stylesheet is swapped automatically.

## Project structure

```
vClineTabesh/
├── index.html                  # all 12 sections + navbar + video modal
├── README.md
├── assets/
│   ├── css/style.css           # brand palette + layout (RTL/LTR aware)
│   ├── js/
│   │   ├── data.js             # translations (fa/en/ar/tr) + PRODUCTS data
│   │   └── main.js             # i18n engine, rendering, UI behavior
│   ├── images/
│   │   ├── logo/               # TABESH logo goes here (logo.png)
│   │   ├── placeholder.svg     # automatic fallback for missing product images
│   │   ├── products/           # product photos (<product-id>.jpg)
│   │   │   └── posters/        # video poster frames (<product-id>.jpg)
│   │   ├── projects/  workshop/  gallery/  team/   # Phase 2 images
│   └── videos/products/        # optional product videos (<product-id>.mp4)
└── assets/README.md            # asset conventions
```

Sections (in page order): Hero · About · Activities · Products ·
Custom Manufacturing (6-step flow) · Projects · Workshop · Team · Why TABESH ·
Gallery · Contact · Footer.

## Content status — placeholders, no invented facts

Per the project brief, **no company facts were invented**. Everything that is
not yet confirmed by the company is a clearly marked placeholder:

- Contact details, founding info, licenses → `[در انتظار تکمیل]` fields
- Technical specifications → amber `value: null` rows ("to be completed")
- Projects / Workshop / Gallery / Team → dashed placeholder tiles
- Product photos → `placeholder.svg` fallback until real files are added

## How to add real assets

| Asset | Where | Result |
|---|---|---|
| Logo | `assets/images/logo/logo.png` | Appears in navbar + footer automatically |
| Product photo | `assets/images/products/<id>.jpg` | Replaces the placeholder (shown with `object-fit: contain`, never stretched) |
| Product video | `assets/videos/products/<id>.mp4` + set `video:` in `data.js` | "Watch Video" button appears automatically |
| Video poster | `assets/images/products/posters/<id>.jpg` | Used as the video preview frame |

Product ids: `solar-tracker`, `cnc-machine`, `wood-turning`.
To enable a video, open `assets/js/data.js`, find the product, and set
`video: 'assets/videos/products/<id>.mp4'` (currently `null` for all).

## Editing content

- **Texts:** every visible string lives in `assets/js/data.js` under
  `TABESH.TRANSLATIONS` (4 languages, same keys). HTML elements reference keys
  via `data-i18n="key"`.
- **Products:** `TABESH.PRODUCTS` in `assets/js/data.js` — each product has
  `id, icon, name, short, specs (null = placeholder), applications, image,
  poster, video (optional)`.

## What remains (next phases)

1. Real content: logo, photos, videos, specs, contact info, team, projects.
2. Connect the contact form to a real delivery service (e.g. form backend /
   email service) — the form currently validates and shows a demo notice.
3. Optional polish: gallery lightbox, SEO/Open Graph tags, favicon,
   sitemap, hosting setup.
