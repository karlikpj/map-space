import * as THREE from "three";

export type VrPanelAction = "back" | "reset";

export interface VrPanelState {
  selectionLabel: string;
  title: string;
  subtitle: string;
  pathText: string;
  backDisabled: boolean;
  resetDisabled: boolean;
  hoveredAction: VrPanelAction | null;
}

type VrButtonVisual = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  action: VrPanelAction;
};

export interface VrPanelElements {
  root: THREE.Group;
  panelMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  panelTexture: THREE.CanvasTexture;
  panelMaterial: THREE.MeshBasicMaterial;
  buttons: Record<VrPanelAction, VrButtonVisual>;
  interactiveObjects: THREE.Object3D[];
}

const PANEL_SIZE = {
  width: 1.22,
  height: 0.96,
} as const;

const BUTTON_SIZE = {
  width: 0.36,
  height: 0.13,
} as const;

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !currentLine) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines;
}

function createTexture(width: number, height: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createPanelMaterial(texture: THREE.CanvasTexture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

function drawPanelTexture(texture: THREE.CanvasTexture, state: VrPanelState): void {
  const canvas = texture.image as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create VR panel context.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 251, 243, 0.95)";
  drawRoundedRect(context, 28, 28, canvas.width - 56, canvas.height - 56, 54);
  context.fill();

  context.strokeStyle = "#2f5c64";
  context.lineWidth = 12;
  context.beginPath();
  context.moveTo(110, 122);
  context.lineTo(canvas.width - 110, 122);
  context.stroke();

  context.fillStyle = "#8b5e2d";
  context.font = "700 28px Avenir Next, Trebuchet MS, sans-serif";
  context.fillText("SPATIAL DATA MODEL VIEWER", 110, 88);

  context.fillStyle = "#7b8f96";
  context.font = "700 24px Avenir Next, Trebuchet MS, sans-serif";
  context.fillText("VR MODE", 110, 128);

  context.fillStyle = "#7b8f96";
  context.font = "700 28px Avenir Next, Trebuchet MS, sans-serif";
  context.fillText(state.selectionLabel.toUpperCase(), 110, 206);

  context.fillStyle = "#15343f";
  context.font = "700 72px Avenir Next, Trebuchet MS, sans-serif";
  const titleLines = wrapText(context, state.title, 1100, 2);
  titleLines.forEach((line, index) => {
    context.fillText(line, 110, 302 + index * 80);
  });

  context.fillStyle = "#2f5c64";
  context.font = "700 30px Avenir Next, Trebuchet MS, sans-serif";
  context.fillText("Current Path", 110, 478);

  context.fillStyle = "#45616b";
  context.font = "500 34px Avenir Next, Trebuchet MS, sans-serif";
  const pathLines = wrapText(context, state.pathText, 1100, 2);
  pathLines.forEach((line, index) => {
    context.fillText(line, 110, 534 + index * 42);
  });

  context.fillStyle = "#2f5c64";
  context.font = "700 30px Avenir Next, Trebuchet MS, sans-serif";
  context.fillText("Details", 110, 662);

  context.fillStyle = "#3a5660";
  context.font = "600 38px Avenir Next, Trebuchet MS, sans-serif";
  const subtitleLines = wrapText(context, state.subtitle, 1100, 3);
  subtitleLines.forEach((line, index) => {
    context.fillText(line, 110, 718 + index * 46);
  });

  texture.needsUpdate = true;
}

function drawButtonTexture(
  texture: THREE.CanvasTexture,
  label: string,
  hovered: boolean,
  disabled: boolean,
): void {
  const canvas = texture.image as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create VR button context.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);

  if (disabled) {
    context.fillStyle = "rgba(35, 63, 72, 0.22)";
  } else if (hovered) {
    context.fillStyle = "#b05f1b";
  } else {
    context.fillStyle = "#1d4550";
  }

  drawRoundedRect(context, 12, 12, canvas.width - 24, canvas.height - 24, 34);
  context.fill();

  context.fillStyle = disabled ? "rgba(247, 251, 251, 0.6)" : "#f7fbfb";
  context.font = "700 62px Avenir Next, Trebuchet MS, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, canvas.width * 0.5, canvas.height * 0.5 + 4);
  context.textAlign = "start";
  context.textBaseline = "alphabetic";

  texture.needsUpdate = true;
}

function createButton(action: VrPanelAction, x: number, label: string): VrButtonVisual {
  const texture = createTexture(640, 220);
  const material = createPanelMaterial(texture);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(BUTTON_SIZE.width, BUTTON_SIZE.height),
    material,
  );
  mesh.position.set(x, -0.34, 0.02);
  mesh.renderOrder = 41;
  mesh.userData.vrAction = action;
  drawButtonTexture(texture, label, false, false);

  return {
    mesh,
    texture,
    material,
    action,
  };
}

export function createVrPanel(): VrPanelElements {
  const panelTexture = createTexture(1400, 1024);
  const panelMaterial = createPanelMaterial(panelTexture);
  const panelMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_SIZE.width, PANEL_SIZE.height),
    panelMaterial,
  );
  panelMesh.renderOrder = 40;

  const backButton = createButton("back", -0.24, "Back");
  const resetButton = createButton("reset", 0.24, "Reset");

  const root = new THREE.Group();
  root.visible = false;
  root.add(panelMesh);
  root.add(backButton.mesh);
  root.add(resetButton.mesh);

  updateVrPanel(
    {
      root,
      panelMesh,
      panelTexture,
      panelMaterial,
      buttons: {
        back: backButton,
        reset: resetButton,
      },
      interactiveObjects: [backButton.mesh, resetButton.mesh],
    },
    {
      selectionLabel: "Expanded node",
      title: "Study Design Model",
      subtitle: "No extra metadata for this node.",
      pathText: "Study Design Model",
      backDisabled: true,
      resetDisabled: true,
      hoveredAction: null,
    },
  );

  return {
    root,
    panelMesh,
    panelTexture,
    panelMaterial,
    buttons: {
      back: backButton,
      reset: resetButton,
    },
    interactiveObjects: [backButton.mesh, resetButton.mesh],
  };
}

export function updateVrPanel(panel: VrPanelElements, state: VrPanelState): void {
  drawPanelTexture(panel.panelTexture, state);
  drawButtonTexture(
    panel.buttons.back.texture,
    "Back",
    state.hoveredAction === "back",
    state.backDisabled,
  );
  drawButtonTexture(
    panel.buttons.reset.texture,
    "Reset",
    state.hoveredAction === "reset",
    state.resetDisabled,
  );
}
