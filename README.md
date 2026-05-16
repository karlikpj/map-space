# Map Space

A small Vite + TypeScript + Three.js app for exploring Mermaid class diagrams as a spatial, clickable 3D hierarchy.

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

Open the local Vite URL in your browser, then choose a model from the HUD selector and click nodes to drill into it.

## Models

Mermaid source files now live in `src/models/`.

- Add `.mmd` or `.mermaid` files to that folder to make them available in the HUD dropdown.
- This viewer currently supports Mermaid `classDiagram` files only.
- Invalid or unsupported files show an error in the HUD and keep the last valid model active.

### Supported Class-Diagram Features

- Standalone classes and block-form classes
- Class members declared inside blocks or with `Class : member` lines
- Class labels
- `<<Enumeration>>` annotations
- Structural nesting from composition, aggregation, inheritance, and realization links

### Ignored For Tree Layout

- Non-structural relations such as associations and dependencies
- Display-only directives such as `direction`, `style`, `classDef`, `cssClass`, `click`, `link`, and `note`
- Namespace groupings are flattened into class metadata rather than shown as their own branches

## VR Mode

<img src=splash.gif width=640>

This project includes an optional WebXR VR mode alongside the normal desktop view.

- On supported browsers and devices, an `Enter VR` button appears in the HUD.
- The current VR mode targets the Quest browser and other browsers with `immersive-vr` WebXR support.
- The VR presentation uses a tabletop layout, so the diagram appears as a scaled interactive model in front of the user.
- Nodes can be selected with controller laser pointers.
- In VR, Back and Reset move to a floating in-world panel instead of the normal desktop HUD.
- The desktop experience still works the same outside immersive mode.

## Scripts

- `npm run dev` starts the local dev server
- `npm run build` runs TypeScript checks and creates a production build in `dist/`
- `npm run preview` serves the production build locally

## Tooling

- `Vite` for the frontend build and dev server
- `TypeScript` for app code and model structure
- `Three.js` for the 3D scene, cards, connectors, and interaction
- `Mermaid` for class-diagram syntax validation
- `WebXR` via Three.js for immersive VR mode
- `GitHub Actions + GitHub Pages` for deployment

## Project Shape

- [src/models](/Users/karlikpj/Sites/map-space/src/models): Mermaid class-diagram source files surfaced in the HUD selector
- [src/data/diagram.ts](/Users/karlikpj/Sites/map-space/src/data/diagram.ts:1): shared viewer node types and label/id helpers
- [src/data/mermaidModels.ts](/Users/karlikpj/Sites/map-space/src/data/mermaidModels.ts:1): model discovery, Mermaid validation, and class-diagram-to-tree conversion
- [src/scene/viewer.ts](/Users/karlikpj/Sites/map-space/src/scene/viewer.ts:1): scene setup, interaction, animation, and navigation state
- [src/scene/layout.ts](/Users/karlikpj/Sites/map-space/src/scene/layout.ts:1): node positioning rules for focus, ancestors, and child columns
- [src/scene/nodeFactory.ts](/Users/karlikpj/Sites/map-space/src/scene/nodeFactory.ts:1): card mesh creation and canvas-based labels
- [src/scene/xrPanel.ts](/Users/karlikpj/Sites/map-space/src/scene/xrPanel.ts:1): floating VR panel textures, text, and action buttons
- [src/main.ts](/Users/karlikpj/Sites/map-space/src/main.ts:1): app entrypoint and UI shell wiring


## Notes

- This is intentionally a Mermaid class-diagram viewer, not a full viewer for every Mermaid diagram type yet.
