import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { DiagramNode } from "../data/model";
import { dampNumber, dampVector3 } from "./animation";
import { FOCUS_POSITION, getAncestorPositions, getChildPositions } from "./layout";
import { createNodeVisual, type NodeVisual } from "./nodeFactory";

type ViewerOptions = {
  container: HTMLDivElement;
  breadcrumbEl: HTMLDivElement;
  detailsEl: HTMLDivElement;
  backButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  data: DiagramNode;
};

type RuntimeNode = {
  data: DiagramNode;
  parent: RuntimeNode | null;
  children: RuntimeNode[];
  depth: number;
  visual: NodeVisual;
  targetPosition: THREE.Vector3;
  targetScale: number;
  targetOpacity: number;
  targetEmphasis: number;
  currentOpacity: number;
  currentEmphasis: number;
};

type RuntimeEdge = {
  parent: RuntimeNode;
  child: RuntimeNode;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  material: THREE.LineBasicMaterial;
  positions: Float32Array;
  targetOpacity: number;
  currentOpacity: number;
};

export class SpatialViewer {
  private readonly container: HTMLDivElement;
  private readonly breadcrumbEl: HTMLDivElement;
  private readonly detailsEl: HTMLDivElement;
  private readonly backButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(44, 1, 0.1, 60);
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly sceneRoot = new THREE.Group();
  private readonly nodes: RuntimeNode[] = [];
  private readonly edges: RuntimeEdge[] = [];
  private readonly pickables: THREE.Object3D[] = [];
  private readonly resizeObserver?: ResizeObserver;
  private readonly focusPosition = FOCUS_POSITION.clone();

  private animationFrame = 0;
  private lastFrameTime = 0;
  private disposed = false;
  private rootNode!: RuntimeNode;
  private focusNode!: RuntimeNode;
  private selectedNode!: RuntimeNode;
  private hoveredNode: RuntimeNode | null = null;

  constructor(options: ViewerOptions) {
    this.container = options.container;
    this.breadcrumbEl = options.breadcrumbEl;
    this.detailsEl = options.detailsEl;
    this.backButton = options.backButton;
    this.resetButton = options.resetButton;

    this.renderer.domElement.className = "viewer-canvas";
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.append(this.renderer.domElement);

    this.scene.background = new THREE.Color("#e9f0eb");
    this.scene.fog = new THREE.Fog("#e9f0eb", 12, 28);
    this.scene.add(this.sceneRoot);

    this.camera.position.set(0, 1.5, 11.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 18;
    this.controls.minPolarAngle = Math.PI * 0.2;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.target.copy(this.focusPosition);

    this.setupScene();

    this.rootNode = this.buildRuntime(options.data, null, 0);
    this.focusNode = this.rootNode;
    this.selectedNode = this.rootNode;

    this.updateLayout(true);
    this.handleResize();
    this.attachEvents();

    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.container);
    }

    this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  goBack(): void {
    if (!this.focusNode.parent) {
      return;
    }

    this.focusNode = this.focusNode.parent;
    this.selectedNode = this.focusNode;
    this.hoveredNode = null;
    this.updateLayout();
  }

  reset(): void {
    this.focusNode = this.rootNode;
    this.selectedNode = this.rootNode;
    this.hoveredNode = null;
    this.updateLayout();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.handleResize);
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.removeEventListener("click", this.handleClick);
    this.controls.dispose();
    this.resizeObserver?.disconnect();

    for (const node of this.nodes) {
      node.visual.frame.geometry.dispose();
      node.visual.frameMaterial.dispose();
      node.visual.outline.geometry.dispose();
      node.visual.outlineMaterial.dispose();
      node.visual.label.geometry.dispose();
      node.visual.labelMaterial.dispose();
      node.visual.texture.dispose();
    }

    for (const edge of this.edges) {
      edge.line.geometry.dispose();
      edge.material.dispose();
    }

    this.renderer.dispose();
    this.container.replaceChildren();
  }

  private setupScene(): void {
    const hemisphere = new THREE.HemisphereLight("#fff9f0", "#b7c7c2", 1.6);
    this.scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight("#fff4d6", 1.15);
    keyLight.position.set(5, 8, 7);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight("#d9eef2", 0.9);
    fillLight.position.set(-5, 5, 3);
    this.scene.add(fillLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(12, 64),
      new THREE.MeshStandardMaterial({
        color: "#dbe7e1",
        transparent: true,
        opacity: 0.72,
        roughness: 1,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -4.8;
    this.scene.add(floor);
  }

  private buildRuntime(
    data: DiagramNode,
    parent: RuntimeNode | null,
    depth: number,
  ): RuntimeNode {
    const visual = createNodeVisual(data);
    const runtimeNode: RuntimeNode = {
      data,
      parent,
      children: [],
      depth,
      visual,
      targetPosition: parent ? new THREE.Vector3() : this.focusPosition.clone(),
      targetScale: parent ? 0.72 : 1.08,
      targetOpacity: parent ? 0 : 1,
      targetEmphasis: parent ? 0 : 0.9,
      currentOpacity: parent ? 0 : 1,
      currentEmphasis: parent ? 0 : 0.9,
    };

    visual.group.position.copy(runtimeNode.targetPosition);
    visual.group.scale.setScalar(runtimeNode.targetScale);
    visual.frame.userData.runtimeNode = runtimeNode;
    visual.label.userData.runtimeNode = runtimeNode;

    this.sceneRoot.add(visual.group);
    this.nodes.push(runtimeNode);
    this.pickables.push(visual.frame, visual.label);

    runtimeNode.children = (data.children ?? []).map((child) =>
      this.buildRuntime(child, runtimeNode, depth + 1),
    );

    for (const child of runtimeNode.children) {
      this.edges.push(this.createEdge(runtimeNode, child));
    }

    return runtimeNode;
  }

  private createEdge(parent: RuntimeNode, child: RuntimeNode): RuntimeEdge {
    const positions = new Float32Array(6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: "#6f8890",
      transparent: true,
      opacity: 0,
    });

    const line = new THREE.Line(geometry, material);
    this.sceneRoot.add(line);

    return {
      parent,
      child,
      line,
      material,
      positions,
      targetOpacity: 0,
      currentOpacity: 0,
    };
  }

  private attachEvents(): void {
    window.addEventListener("resize", this.handleResize);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.addEventListener("click", this.handleClick);
  }

  private readonly handleResize = (): void => {
    const width = Math.max(this.container.clientWidth, 320);
    const height = Math.max(this.container.clientHeight, 320);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const hovered = this.pickNode(event);
    if (hovered === this.hoveredNode) {
      return;
    }

    this.hoveredNode = hovered;
    this.renderer.domElement.style.cursor = hovered ? "pointer" : "grab";
    this.updateLayout();
  };

  private readonly handlePointerLeave = (): void => {
    this.hoveredNode = null;
    this.renderer.domElement.style.cursor = "grab";
    this.updateLayout();
  };

  private readonly handleClick = (event: MouseEvent): void => {
    const pickedNode = this.pickNode(event);
    if (!pickedNode) {
      return;
    }

    this.hoveredNode = pickedNode;

    if (pickedNode.children.length > 0) {
      this.focusNode = pickedNode;
      this.selectedNode = pickedNode;
    } else {
      this.selectedNode = pickedNode;
    }

    this.updateLayout();
  };

  private pickNode(event: MouseEvent | PointerEvent): RuntimeNode | null {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersections = this.raycaster.intersectObjects(this.pickables, false);
    for (const intersection of intersections) {
      const runtimeNode = intersection.object.userData.runtimeNode as RuntimeNode | undefined;
      if (
        runtimeNode &&
        runtimeNode.currentOpacity > 0.4 &&
        runtimeNode.visual.group.visible
      ) {
        return runtimeNode;
      }
    }

    return null;
  }

  private getFocusPath(): RuntimeNode[] {
    const path: RuntimeNode[] = [];
    let current: RuntimeNode | null = this.focusNode;

    while (current) {
      path.unshift(current);
      current = current.parent;
    }

    return path;
  }

  private updateLayout(immediate = false): void {
    const focusPath = this.getFocusPath();
    const ancestors = focusPath.slice(0, -1);
    const children = this.focusNode.children;
    const ancestorPositions = getAncestorPositions(ancestors.length);
    const childPositions = getChildPositions(children.length);
    const visibleNodes = new Set<RuntimeNode>([...focusPath, ...children]);

    for (const node of this.nodes) {
      const ancestorIndex = ancestors.indexOf(node);
      const childIndex = children.indexOf(node);

      if (node === this.focusNode) {
        node.targetPosition.copy(this.focusPosition);
        node.targetScale = 1.08;
        node.targetOpacity = 1;
        node.targetEmphasis = node === this.hoveredNode ? 1.15 : 0.92;
      } else if (ancestorIndex >= 0) {
        node.targetPosition.copy(ancestorPositions[ancestorIndex]);
        node.targetScale = 0.74;
        node.targetOpacity = 0.92;
        node.targetEmphasis = node === this.hoveredNode ? 0.72 : 0.34;
      } else if (childIndex >= 0) {
        node.targetPosition.copy(childPositions[childIndex]);
        node.targetScale = node === this.selectedNode ? 0.98 : 0.88;
        node.targetOpacity = 1;
        node.targetEmphasis = node === this.selectedNode ? 1 : node === this.hoveredNode ? 0.62 : 0.24;
      } else {
        const parentPosition = node.parent
          ? node.parent.visual.group.position
          : this.focusPosition;
        node.targetPosition.copy(parentPosition);
        node.targetScale = 0.56;
        node.targetOpacity = 0;
        node.targetEmphasis = 0;
      }

      if (immediate) {
        node.visual.group.position.copy(node.targetPosition);
        node.visual.group.scale.setScalar(node.targetScale);
        node.currentOpacity = node.targetOpacity;
        node.currentEmphasis = node.targetEmphasis;
      }

      node.visual.group.visible =
        node.currentOpacity > 0.04 || node.targetOpacity > 0.04 || visibleNodes.has(node);
    }

    this.updateEdges(focusPath, immediate);
    this.renderHud(focusPath);
  }

  private updateEdges(focusPath: RuntimeNode[], immediate: boolean): void {
    const pathSet = new Set(focusPath);

    for (const edge of this.edges) {
      const isPathEdge = pathSet.has(edge.parent) && pathSet.has(edge.child);
      const isFocusedChild = edge.parent === this.focusNode && edge.child.parent === this.focusNode;

      if (isPathEdge) {
        edge.targetOpacity = 0.86;
      } else if (isFocusedChild) {
        edge.targetOpacity = edge.child === this.selectedNode ? 0.72 : 0.44;
      } else {
        edge.targetOpacity = 0;
      }

      if (immediate) {
        edge.currentOpacity = edge.targetOpacity;
      }
    }
  }

  private renderHud(focusPath: RuntimeNode[]): void {
    this.backButton.disabled = this.focusNode.parent === null;
    this.resetButton.disabled =
      this.focusNode === this.rootNode && this.selectedNode === this.rootNode;

    this.breadcrumbEl.replaceChildren();
    focusPath.forEach((node, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = index === focusPath.length - 1 ? "breadcrumb is-active" : "breadcrumb";
      button.textContent = node.data.title;
      button.addEventListener("click", () => {
        this.focusNode = node;
        this.selectedNode = node;
        this.hoveredNode = null;
        this.updateLayout();
      });
      this.breadcrumbEl.append(button);
    });

    this.detailsEl.innerHTML = `
      <p class="selection-label">${this.selectedNode.children.length > 0 ? "Expanded node" : "Selected field"}</p>
      <p class="selection-title">${this.selectedNode.data.title}</p>
      <p class="selection-subtitle">${this.selectedNode.data.subtitle ?? "No extra metadata for this node."}</p>
    `;
  }

  private readonly animate = (time: number): void => {
    if (this.disposed) {
      return;
    }

    const delta = Math.min(0.05, (time - this.lastFrameTime || 16) / 1000);
    this.lastFrameTime = time;

    for (const node of this.nodes) {
      dampVector3(node.visual.group.position, node.targetPosition, 9.5, delta);
      const scale = dampNumber(
        node.visual.group.scale.x,
        node.targetScale,
        8.5,
        delta,
      );
      node.visual.group.scale.setScalar(scale);
      node.currentOpacity = dampNumber(node.currentOpacity, node.targetOpacity, 9, delta);
      node.currentEmphasis = dampNumber(
        node.currentEmphasis,
        node.targetEmphasis,
        8,
        delta,
      );

      const colorMix = Math.min(0.24, node.currentEmphasis * 0.18);
      node.visual.frameMaterial.color
        .copy(node.visual.baseColor)
        .lerp(node.visual.accentColor, colorMix);
      node.visual.frameMaterial.emissive.copy(node.visual.accentColor);
      node.visual.frameMaterial.emissiveIntensity = 0.04 + node.currentEmphasis * 0.24;
      node.visual.frameMaterial.opacity = node.currentOpacity;
      node.visual.outlineMaterial.opacity = node.currentOpacity * 0.8;
      node.visual.labelMaterial.opacity = node.currentOpacity;
      node.visual.group.visible =
        node.currentOpacity > 0.03 || node.targetOpacity > 0.03 || node === this.focusNode;
    }

    for (const edge of this.edges) {
      edge.currentOpacity = dampNumber(edge.currentOpacity, edge.targetOpacity, 9, delta);
      edge.material.opacity = edge.currentOpacity;
      edge.line.visible = edge.currentOpacity > 0.02 || edge.targetOpacity > 0.02;

      edge.positions[0] = edge.parent.visual.group.position.x;
      edge.positions[1] = edge.parent.visual.group.position.y;
      edge.positions[2] = edge.parent.visual.group.position.z;
      edge.positions[3] = edge.child.visual.group.position.x;
      edge.positions[4] = edge.child.visual.group.position.y;
      edge.positions[5] = edge.child.visual.group.position.z;
      edge.line.geometry.attributes.position.needsUpdate = true;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = window.requestAnimationFrame(this.animate);
  };
}
