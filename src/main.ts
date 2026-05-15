import "./styles.css";
import { studyDesignModel } from "./data/model";
import { SpatialViewer } from "./scene/viewer";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

app.innerHTML = `
  <div class="app-shell">
    <section class="hud" aria-label="Viewer controls">
      <p class="eyebrow">Study Data Model</p>
      <h1>Spatial Data Model Viewer</h1>
      <p class="hud-copy">
        Click a card to reveal its next layer. Drag to orbit, scroll to zoom,
        and use the breadcrumb trail to climb back up the model.
      </p>
      <div id="breadcrumbs" class="breadcrumbs" aria-label="Hierarchy path"></div>
      <div class="hud-actions">
        <button id="back-button" class="hud-button" type="button">Back</button>
        <button id="reset-button" class="hud-button" type="button">Reset</button>
      </div>
      <div id="selection-details" class="selection-details"></div>
    </section>
    <div id="scene-root" class="scene-root" aria-label="3D model scene"></div>
  </div>
`;

const sceneRoot = document.querySelector<HTMLDivElement>("#scene-root");
const breadcrumbs = document.querySelector<HTMLDivElement>("#breadcrumbs");
const details = document.querySelector<HTMLDivElement>("#selection-details");
const backButton = document.querySelector<HTMLButtonElement>("#back-button");
const resetButton = document.querySelector<HTMLButtonElement>("#reset-button");

if (!sceneRoot || !breadcrumbs || !details || !backButton || !resetButton) {
  throw new Error("Viewer shell is missing required elements.");
}

const viewer = new SpatialViewer({
  container: sceneRoot,
  breadcrumbEl: breadcrumbs,
  detailsEl: details,
  backButton,
  resetButton,
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
