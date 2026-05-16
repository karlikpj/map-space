import "./styles.css";
import { getModelSources, loadModelSource } from "./data/mermaidModels";
import { SpatialViewer, type ViewerTheme } from "./scene/viewer";

const THEME_STORAGE_KEY = "spatial-mermaid-viewer-theme";

function getThemeIcon(theme: ViewerTheme): string {
  if (theme === "dark") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4.25v2.5M12 17.25v2.5M4.25 12h2.5M17.25 12h2.5M6.52 6.52l1.77 1.77M15.71 15.71l1.77 1.77M17.48 6.52l-1.77 1.77M8.29 15.71l-1.77 1.77M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8Z" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.75 3.5a8.75 8.75 0 1 0 5.75 15.35A9.5 9.5 0 0 1 14.75 3.5Z" />
    </svg>
  `;
}

function getInitialTheme(): ViewerTheme {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
  } catch {
    // Ignore storage access failures and fall back to runtime detection.
  }

  return "light";
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

app.innerHTML = `
  <div class="app-shell">
    <section id="hud" class="hud" aria-label="Viewer controls">
      <div class="hud-head">
        <div class="hud-title-block">
          <p class="eyebrow">Mermaid Class Diagram</p>
          <h1>Spatial Mermaid Viewer</h1>
        </div>
        <button
          id="theme-toggle"
          class="theme-toggle"
          type="button"
          aria-label="Enable dark mode"
          aria-pressed="false"
          title="Enable dark mode"
        ></button>
      </div>
      <p class="hud-copy">
        Pick a Mermaid class diagram from the bundled <code>src/models/</code>
        files. Branch cards reveal the next layer, end cards inspect in the
        center, and a second click returns them. Drag to orbit, scroll to zoom,
        and use the breadcrumb trail to climb back up the model. In XR, use the
        in-world panel to move between models and switch themes.
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
const themeToggle = document.querySelector<HTMLButtonElement>("#theme-toggle");

if (
  !hud ||
  !sceneRoot ||
  !breadcrumbs ||
  !details ||
  !modelSelect ||
  !hudError ||
  !backButton ||
  !resetButton ||
  !xrButtonSlot ||
  !themeToggle
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
const themeToggleEl = themeToggle;

const modelSources = getModelSources();

let activeViewer: SpatialViewer | null = null;
let activeModelId: string | null = null;
let lastGoodModelId: string | null = null;
let loadSequence = 0;
let currentTheme: ViewerTheme = getInitialTheme();

function applyTheme(theme: ViewerTheme): void {
  currentTheme = theme;
  document.body.dataset.theme = theme;
  themeToggleEl.innerHTML = getThemeIcon(theme);
  themeToggleEl.setAttribute("aria-pressed", String(theme === "dark"));
  themeToggleEl.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light mode" : "Enable dark mode",
  );
  themeToggleEl.title = theme === "dark" ? "Switch to light mode" : "Enable dark mode";
  activeViewer?.setTheme(theme);

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage access failures for ephemeral sessions.
  }
}

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
        theme: currentTheme,
        ...viewerModelState,
        onPreviousModelRequest: () => {
          requestRelativeModel(-1);
        },
        onNextModelRequest: () => {
          requestRelativeModel(1);
        },
        onThemeToggleRequest: () => {
          applyTheme(currentTheme === "dark" ? "light" : "dark");
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
applyTheme(currentTheme);

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

themeToggleEl.addEventListener("click", () => {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
});

window.addEventListener("beforeunload", () => {
  disposeViewer();
});
