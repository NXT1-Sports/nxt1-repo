# NXT1 Assets

This directory contains static assets for the NXT1 web application.

## Structure

```
assets/
├── icons/           # PWA icons (various sizes)
├── images/          # Application images
│   ├── nxt1-logo.svg
│   ├── og-image.jpg
│   └── twitter-card.jpg
└── README.md
```

## Required Icons

For PWA support, add the following icon sizes:

- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png
- icon-384x384.png
- icon-512x512.png

## Copy from Original Project

Copy assets from the original nxt1 project:

```bash
cp -r ../../../nxt1/src/assets/* .
```
