import "./styles.css";
import { getModelSources, loadModelSource } from "./data/mermaidModels";
import { SpatialViewer } from "./scene/viewer";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

app.innerHTML = `
  <div class="app-shell">
    <section id="hud" class="hud" aria-label="Viewer controls">
      <p class="eyebrow">Mermaid Class Diagram</p>
      <h1>Spatial Mermaid Viewer</h1>
      <p class="hud-copy">
        Pick a Mermaid class diagram from the bundled <code>src/models/</code>
        files. Branch cards reveal the next layer, end cards inspect in the
        center, and a second click returns them. Drag to orbit, scroll to zoom,
        and use the breadcrumb trail to climb back up the model. In XR, use the
        in-world panel to move between models.
      </p>
      <div class="model-picker">
        <label class="model-label" for="model-select">Model</label>
        <select id="model-select" class="model-select" aria-label="Select Mermaid model"></select>
      </div>
      <p id="hud-error" class="hud-error" role="status" aria-live="polite" hidden></p>
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
const modelSelect = document.querySelector<HTMLSelectElement>("#model-select");
const hudError = document.querySelector<HTMLElement>("#hud-error");
const backButton = document.querySelector<HTMLButtonElement>("#back-button");
const resetButton = document.querySelector<HTMLButtonElement>("#reset-button");
const xrButtonSlot = document.querySelector<HTMLDivElement>("#xr-button-slot");

if (
  !hud ||
  !sceneRoot ||
  !breadcrumbs ||
  !details ||
  !modelSelect ||
  !hudError ||
  !backButton ||
  !resetButton ||
  !xrButtonSlot
) {
  throw new Error("Viewer shell is missing required elements.");
}

const hudEl = hud;
const sceneRootEl = sceneRoot;
const breadcrumbsEl = breadcrumbs;
const detailsEl = details;
const modelSelectEl = modelSelect;
const hudErrorEl = hudError;
const backButtonEl = backButton;
const resetButtonEl = resetButton;
const xrButtonSlotEl = xrButtonSlot;

const modelSources = getModelSources();

let activeViewer: SpatialViewer | null = null;
let activeModelId: string | null = null;
let lastGoodModelId: string | null = null;
let loadSequence = 0;

function setHudError(message: string | null): void {
  hudErrorEl.hidden = message === null;
  hudErrorEl.textContent = message ?? "";
}

function setNoViewerState(title: string, subtitle: string): void {
  breadcrumbsEl.replaceChildren();
  detailsEl.innerHTML = `
    <p class="selection-label">Viewer status</p>
    <p class="selection-title">${title}</p>
    <p class="selection-subtitle">${subtitle}</p>
  `;
  backButtonEl.disabled = true;
  resetButtonEl.disabled = true;
}

function disposeViewer(): void {
  activeViewer?.dispose();
  activeViewer = null;
}

function getModelIndex(modelId: string): number {
  return modelSources.findIndex((source) => source.id === modelId);
}

function getViewerModelState(modelId: string): {
  modelLabel: string;
  canGoToPreviousModel: boolean;
  canGoToNextModel: boolean;
} {
  const modelIndex = getModelIndex(modelId);
  const source = modelSources[modelIndex];
  if (!source) {
    return {
      modelLabel: "Unknown model",
      canGoToPreviousModel: false,
      canGoToNextModel: false,
    };
  }

  return {
    modelLabel: source.label,
    canGoToPreviousModel: modelIndex > 0,
    canGoToNextModel: modelIndex >= 0 && modelIndex < modelSources.length - 1,
  };
}

function requestRelativeModel(offset: -1 | 1): void {
  if (modelSelectEl.disabled) {
    return;
  }

  const currentModelId = activeModelId ?? lastGoodModelId;
  if (!currentModelId) {
    return;
  }

  const currentIndex = getModelIndex(currentModelId);
  if (currentIndex < 0) {
    return;
  }

  const nextSource = modelSources[currentIndex + offset];
  if (!nextSource) {
    return;
  }

  modelSelectEl.value = nextSource.id;
  void showModel(nextSource.id);
}

function populateModelOptions(): void {
  modelSelectEl.replaceChildren();

  modelSources.forEach((source) => {
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = source.label;
    modelSelectEl.append(option);
  });
}

async function showModel(modelId: string): Promise<void> {
  const source = modelSources.find((entry) => entry.id === modelId);
  if (!source) {
    return;
  }

  const requestId = loadSequence + 1;
  loadSequence = requestId;
  modelSelectEl.disabled = true;
  setHudError(null);

  try {
    const result = await loadModelSource(source);
    if (requestId !== loadSequence) {
      return;
    }

    if (!result.ok) {
      setHudError(result.error);
      if (lastGoodModelId) {
        modelSelectEl.value = lastGoodModelId;
        activeModelId = lastGoodModelId;
      } else {
        activeModelId = null;
        disposeViewer();
        setNoViewerState(
          "No valid model loaded",
          "Choose another Mermaid class diagram or fix the selected file in src/models/.",
        );
      }
      return;
    }

    const viewerModelState = getViewerModelState(source.id);
    if (activeViewer) {
      activeViewer.setData(result.model, viewerModelState);
    } else {
      activeViewer = new SpatialViewer({
        container: sceneRootEl,
        hudEl,
        breadcrumbEl: breadcrumbsEl,
        detailsEl,
        backButton: backButtonEl,
        resetButton: resetButtonEl,
        xrButtonMountEl: xrButtonSlotEl,
        data: result.model,
        ...viewerModelState,
        onPreviousModelRequest: () => {
          requestRelativeModel(-1);
        },
        onNextModelRequest: () => {
          requestRelativeModel(1);
        },
      });
    }
    activeModelId = source.id;
    lastGoodModelId = source.id;
    modelSelectEl.value = source.id;
    setHudError(null);
  } finally {
    if (requestId === loadSequence) {
      modelSelectEl.disabled = modelSources.length === 0;
    }
  }
}

populateModelOptions();

if (modelSources.length === 0) {
  modelSelectEl.disabled = true;
  setHudError("No Mermaid model files were found in src/models/.");
  setNoViewerState(
    "No model loaded",
    "Add .mmd or .mermaid files to src/models/ to populate the selector.",
  );
} else {
  modelSelectEl.value = modelSources[0].id;
  void showModel(modelSources[0].id);
}

modelSelectEl.addEventListener("change", () => {
  const nextModelId = modelSelectEl.value;
  if (!nextModelId || nextModelId === activeModelId) {
    return;
  }
  void showModel(nextModelId);
});

backButtonEl.addEventListener("click", () => {
  activeViewer?.goBack();
});

resetButtonEl.addEventListener("click", () => {
  activeViewer?.reset();
});

window.addEventListener("beforeunload", () => {
  disposeViewer();
});
