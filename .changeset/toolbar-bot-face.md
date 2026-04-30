---
"logseq-ai-actions": patch
---

Plugin visual identity refreshed to a teal 2D bot face across both surfaces:

- **Toolbar icon** (`registerUIItem("toolbar", …)` in `src/index.ts`). The previous chrome-minion silhouette used an 88×120 portrait viewBox rendered at 18×24, which floated above the baseline shared by the surrounding toolbar icons (home, calendar, alarm, …) and read as a filled blob next to their stroked line-art. Replaced with a square 24×24 viewBox at 20×20 render size: rounded teal head + antenna in `#14B8A6` (Tailwind teal-500), white eyes and smile inside the silhouette so the face stays legible on both light and dark Logseq themes.
- **Marketplace card icon** (`./icon.svg` source, `./icon.png` 128×128 rendered via `rsvg-convert`). Same bot face on the existing charcoal `#171717` rounded-square background, scaled up: teal head + antenna fills the inner square, white eyes and smile match the toolbar variant. The chrome-minion mark is retired.
