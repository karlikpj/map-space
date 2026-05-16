import "./styles.css";
import { studyDesignModel } from "./data/model";
import { SpatialViewer } from "./scene/viewer";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

app.innerHTML = `
  <div class="app-shell">
    <section id="hud" class="hud" aria-label="Viewer controls">
      <p class="eyebrow">Study Data Model</p>
      <h1>Spatial Data Model Viewer</h1>
      <p class="hud-copy">
        Click a branch card to reveal its next layer. Click an end card to
        inspect it in the center, then click again to return it. Drag to orbit,
        scroll to zoom, and use the breadcrumb trail to climb back up the
        model. On supported headsets, you can also enter VR.
      </p>
      <div id="breadcrumbs" class="breadcrumbs" aria-label="Hierarchy path"></div>
      <div class="hud-actions">
        <button id="back-button" class="hud-button" type="button">Back</button>
        <button id="reset-button" class="hud-button" type="button">Reset</button>
      </div>
      <div id="xr-button-slot" class="xr-button-slot" aria-live="polite"></div>
      <div id="selection-details" class="selection-details"></div>
    </section>
    <div id="scene-root" class="scene-root" aria-label="3D model scene"></div>
  </div>
`;

const hud = document.querySelector<HTMLElement>("#hud");
const sceneRoot = document.querySelector<HTMLDivElement>("#scene-root");
const breadcrumbs = document.querySelector<HTMLDivElement>("#breadcrumbs");
const details = document.querySelector<HTMLDivElement>("#selection-details");
const backButton = document.querySelector<HTMLButtonElement>("#back-button");
const resetButton = document.querySelector<HTMLButtonElement>("#reset-button");
const xrButtonSlot = document.querySelector<HTMLDivElement>("#xr-button-slot");

if (
  !hud ||
  !sceneRoot ||
  !breadcrumbs ||
  !details ||
  !backButton ||
  !resetButton ||
  !xrButtonSlot
) {
  throw new Error("Viewer shell is missing required elements.");
}

const viewer = new SpatialViewer({
  container: sceneRoot,
  hudEl: hud,
  breadcrumbEl: breadcrumbs,
  detailsEl: details,
  backButton,
  resetButton,
  xrButtonMountEl: xrButtonSlot,
  data: studyDesignModel,
});

backButton.addEventListener("click", () => {
  viewer.goBack();
});

resetButton.addEventListener("click", () => {
  viewer.reset();
});

window.addEventListener("beforeunload", () => {
  viewer.dispose();
});
