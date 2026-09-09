# Assets — TABESH Website

All images and videos are provided by the company and dropped into this tree.

```
assets/
├── css/
│   └── style.css                 # site stylesheet
├── js/
│   ├── data.js                   # translations + products data
│   └── main.js                   # i18n, rendering, UI behavior
├── images/
│   ├── logo/                     # TABESH logo (logo.png default, see README.txt)
│   ├── placeholder.svg           # automatic fallback while real images are missing
│   ├── products/                 # product photos: <product-id>.jpg
│   │   └── posters/              # video poster frames: <product-id>.jpg
│   ├── projects/                 # project photos (Phase 2)
│   ├── workshop/                 # workshop photos (Phase 2)
│   ├── gallery/                  # gallery photos (Phase 2)
│   └── team/                     # team member photos (Phase 2)
└── videos/
    └── products/                 # product videos: <product-id>.mp4 (optional)
```

## Conventions

- Product ids (used as file names): `solar-tracker`, `cnc-machine`, `wood-turning`.
- A product image that is missing automatically falls back to `placeholder.svg`.
- Product videos are optional: they appear only when set in `assets/js/data.js`.
