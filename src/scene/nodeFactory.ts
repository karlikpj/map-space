import * as THREE from "three";
import type { DiagramNode, NodeKind } from "../data/model";

const CARD_WIDTH = 2.8;
const CARD_HEIGHT = 1.45;
const CARD_DEPTH = 0.24;

type PaletteEntry = {
  base: string;
  accent: string;
  outline: string;
};

const PALETTE: Record<NodeKind, PaletteEntry> = {
  root: {
    base: "#f2b56a",
    accent: "#b05f1b",
    outline: "#8c4b16",
  },
  class: {
    base: "#8fc1cf",
    accent: "#2b6776",
    outline: "#1f4f5d",
  },
  enum: {
    base: "#9dd0b0",
    accent: "#2f7754",
    outline: "#22573d",
  },
  leaf: {
    base: "#eed7b4",
    accent: "#8f6732",
    outline: "#6b4a21",
  },
};

export interface NodeVisual {
  group: THREE.Group;
  frame: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  frameMaterial: THREE.MeshStandardMaterial;
  outline: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  outlineMaterial: THREE.LineBasicMaterial;
  label: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  labelMaterial: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  baseColor: THREE.Color;
  accentColor: THREE.Color;
}

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
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const trial = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(trial).width <= maxWidth || !currentLine) {
      currentLine = trial;
      continue;
    }
    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 3);
}

function createLabelTexture(node: DiagramNode, palette: PaletteEntry): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create canvas context for node labels.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 252, 246, 0.96)";
  drawRoundedRect(context, 26, 26, canvas.width - 52, canvas.height - 52, 48);
  context.fill();

  context.strokeStyle = palette.accent;
  context.lineWidth = 10;
  context.beginPath();
  context.moveTo(90, 104);
  context.lineTo(canvas.width - 90, 104);
  context.stroke();

  context.fillStyle = "#14303c";
  context.font = "700 64px Avenir Next, Trebuchet MS, sans-serif";
  const titleLines = wrapText(context, node.title, 820);

  titleLines.forEach((line, index) => {
    context.fillText(line, 90, 200 + index * 72);
  });

  if (node.subtitle) {
    context.fillStyle = "#53707a";
    context.font = "500 32px Avenir Next, Trebuchet MS, sans-serif";
    context.fillText(node.subtitle, 90, 420);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createNodeVisual(node: DiagramNode): NodeVisual {
  const palette = PALETTE[node.kind];
  const baseColor = new THREE.Color(palette.base);
  const accentColor = new THREE.Color(palette.accent);

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: baseColor.clone(),
    roughness: 0.48,
    metalness: 0.08,
    emissive: accentColor.clone(),
    emissiveIntensity: 0.05,
    transparent: true,
    opacity: 1,
  });

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(CARD_WIDTH, CARD_HEIGHT, CARD_DEPTH),
    frameMaterial,
  );

  const outlineMaterial = new THREE.LineBasicMaterial({
    color: palette.outline,
    transparent: true,
    opacity: 0.72,
  });

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(frame.geometry),
    outlineMaterial,
  );

  const texture = createLabelTexture(node, palette);
  const labelMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    opacity: 1,
  });

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_WIDTH * 0.86, CARD_HEIGHT * 0.78),
    labelMaterial,
  );
  label.position.z = CARD_DEPTH * 0.5 + 0.02;
  label.renderOrder = 2;

  const group = new THREE.Group();
  group.add(frame);
  group.add(outline);
  group.add(label);

  return {
    group,
    frame,
    frameMaterial,
    outline,
    outlineMaterial,
    label,
    labelMaterial,
    texture,
    baseColor,
    accentColor,
  };
}
