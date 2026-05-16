# Map Space

A small Vite + TypeScript + Three.js app for exploring a study data model as a spatial, clickable 3D hierarchy.

<img src=splash.png width=640>

## Quick Start

Requirements:
- Node.js 20+ recommended
- npm

Install and run:

```bash
npm install
npm run dev
```

Open the local Vite URL in your browser, then click nodes to drill into the model.

## VR Mode

This project includes an optional WebXR VR mode alongside the normal desktop view.

- On supported browsers and devices, an `Enter VR` button appears in the HUD.
- The current VR mode targets the Quest browser and other browsers with `immersive-vr` WebXR support.
- The VR presentation uses a tabletop layout, so the diagram appears as a scaled interactive model in front of the user.
- Nodes can be selected with controller laser pointers.
- In VR, Back and Reset move to a floating in-world panel instead of the normal desktop HUD.
- The desktop experience still works the same outside immersive mode.

### VR Testing Notes

- WebXR requires a secure context, so headset testing should use HTTPS.
- GitHub Pages is a good fit for this project because it provides HTTPS and matches the current deploy setup.
- Local `npm run dev` is still useful for desktop iteration, but Quest testing should use a hosted build.
- If no VR button appears, the browser/device likely does not support `immersive-vr`, or the page is not being served from a secure origin.

## Scripts

- `npm run dev` starts the local dev server
- `npm run build` runs TypeScript checks and creates a production build in `dist/`
- `npm run preview` serves the production build locally

## Tooling

- `Vite` for the frontend build and dev server
- `TypeScript` for app code and model structure
- `Three.js` for the 3D scene, cards, connectors, and interaction
- `WebXR` via Three.js for immersive VR mode
- `GitHub Actions + GitHub Pages` for deployment

## Project Shape

- [src/data/model.ts](/Users/karlikpj/Sites/map-space/src/data/model.ts:1): hand-authored tree representation of the Mermaid data model
- [src/scene/viewer.ts](/Users/karlikpj/Sites/map-space/src/scene/viewer.ts:1): scene setup, interaction, animation, and navigation state
- [src/scene/layout.ts](/Users/karlikpj/Sites/map-space/src/scene/layout.ts:1): node positioning rules for focus, ancestors, and child columns
- [src/scene/nodeFactory.ts](/Users/karlikpj/Sites/map-space/src/scene/nodeFactory.ts:1): card mesh creation and canvas-based labels
- [src/scene/xrPanel.ts](/Users/karlikpj/Sites/map-space/src/scene/xrPanel.ts:1): floating VR panel textures, text, and action buttons
- [src/main.ts](/Users/karlikpj/Sites/map-space/src/main.ts:1): app entrypoint and UI shell wiring

## Deployment

This project is configured to deploy to GitHub Pages from the workflow in [.github/workflows/deploy.yml](/Users/karlikpj/Sites/map-space/.github/workflows/deploy.yml:1).

To publish successfully:

1. Push to `main`, or trigger the workflow manually from the Actions tab.
2. In GitHub repo settings, set `Pages -> Source` to `GitHub Actions`.
3. Make sure the repo name matches the Vite `base` path in [vite.config.ts](/Users/karlikpj/Sites/map-space/vite.config.ts:1).

## Notes

- The data model is currently maintained manually in `src/data/model.ts`.
- This app is a viewer for the current schema, not a general Mermaid parser.
