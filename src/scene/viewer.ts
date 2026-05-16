import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import type { DiagramNode } from "../data/diagram";
import { dampNumber, dampVector3 } from "./animation";
import {
  FOCUS_POSITION,
  getAncestorPositions,
  getChildPositions,
  getFocusPosition,
} from "./layout";
import { CARD_SIZE, createNodeVisual, type NodeVisual } from "./nodeFactory";
import {
  createVrPanel,
  updateVrPanel,
  type VrPanelAction,
  type VrPanelElements,
} from "./xrPanel";

export type ViewerTheme = "light" | "dark";

type ViewerOptions = {
  container: HTMLDivElement;
  hudEl: HTMLElement;
  breadcrumbEl: HTMLDivElement;
  detailsEl: HTMLDivElement;
  backButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  xrButtonMountEl: HTMLDivElement;
  data: DiagramNode;
  modelLabel: string;
  canGoToPreviousModel: boolean;
  canGoToNextModel: boolean;
  onPreviousModelRequest: () => void;
  onNextModelRequest: () => void;
  theme: ViewerTheme;
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
  route: "direct" | "elbow";
  targetOpacity: number;
  currentOpacity: number;
};

type XrControllerObject = THREE.Group & {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  removeEventListener: (type: string, listener: (event: Event) => void) => void;
  userData: THREE.Object3D["userData"] & {
    xrRay?: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    xrIndex?: number;
    xrConnected?: boolean;
  };
};

type XrControllerState = {
  controller: XrControllerObject;
  ray: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  rayMaterial: THREE.LineBasicMaterial;
  flashlight: THREE.SpotLight;
};

type XrPickTarget =
  | {
      type: "node";
      node: RuntimeNode;
      distance: number;
    }
  | {
      type: "action";
      action: VrPanelAction;
      distance: number;
    };

type ViewerUiState = {
  focusPath: RuntimeNode[];
  selectionLabel: string;
  selectedTitle: string;
  selectedSubtitle: string;
  pathText: string;
  modelLabel: string;
  previousModelDisabled: boolean;
  nextModelDisabled: boolean;
  backDisabled: boolean;
  resetDisabled: boolean;
};

const XR_DIAGRAM_SCALE = 0.13;
const XR_TABLE_DISTANCE = 2.25;
const XR_TABLE_VERTICAL_OFFSET = -0.5;
const XR_MODEL_VERTICAL_LIFT = 0.25;
const XR_MODEL_LOCAL_OFFSET = new THREE.Vector3(0, XR_MODEL_VERTICAL_LIFT, 0.82);
const XR_PANEL_LOCAL_OFFSET = new THREE.Vector3(0, -0.92, 0.58);
const XR_PANEL_TILT = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  THREE.MathUtils.degToRad(-35),
);
const XR_RAY_LENGTH = 6;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);

export class SpatialViewer {
  private readonly container: HTMLDivElement;
  private readonly hudEl: HTMLElement;
  private readonly breadcrumbEl: HTMLDivElement;
  private readonly detailsEl: HTMLDivElement;
  private readonly backButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly xrButtonMountEl: HTMLDivElement;
  private readonly onPreviousModelRequest: () => void;
  private readonly onNextModelRequest: () => void;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(44, 1, 0.1, 60);
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  private readonly hemisphereLight = new THREE.HemisphereLight("#fff9f0", "#b7c7c2", 1.6);
  private readonly keyLight = new THREE.DirectionalLight("#fff4d6", 1.15);
  private readonly fillLight = new THREE.DirectionalLight("#d9eef2", 0.9);
  private readonly overheadDarkLight = new THREE.SpotLight(
    "#d7e4ff",
    0,
    36,
    THREE.MathUtils.degToRad(52),
    0.84,
    1.35,
  );
  private readonly desktopFlashlight = new THREE.SpotLight(
    "#fff3d2",
    0,
    28,
    THREE.MathUtils.degToRad(18),
    0.92,
    1.4,
  );
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly desktopLightPointer = new THREE.Vector2();
  private readonly presentationRoot = new THREE.Group();
  private readonly sceneRoot = new THREE.Group();
  private readonly vrPanel: VrPanelElements = createVrPanel();
  private readonly nodes: RuntimeNode[] = [];
  private readonly edges: RuntimeEdge[] = [];
  private readonly pickables: THREE.Object3D[] = [];
  private readonly xrControllers: XrControllerState[] = [];
  private readonly resizeObserver?: ResizeObserver;
  private readonly baseFocusPosition = FOCUS_POSITION.clone();
  private readonly currentFocusLocalPosition = FOCUS_POSITION.clone();
  private readonly xrAnchorWorldPosition = new THREE.Vector3();
  private readonly xrAnchorRotation = new THREE.Quaternion();
  private readonly xrPanelWorldPosition = new THREE.Vector3();
  private readonly sceneFog = new THREE.Fog("#e9f0eb", 12, 28);
  private readonly floorMaterial = new THREE.MeshStandardMaterial({
    color: "#dbe7e1",
    transparent: true,
    opacity: 0.72,
    roughness: 1,
  });
  private readonly floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), this.floorMaterial);
  private readonly focusWorldPosition = new THREE.Vector3();
  private readonly lightPlane = new THREE.Plane();
  private readonly tempVector = new THREE.Vector3();
  private readonly tempVectorB = new THREE.Vector3();

  private lastFrameTime = 0;
  private disposed = false;
  private rootNode!: RuntimeNode;
  private focusNode!: RuntimeNode;
  private selectedNode!: RuntimeNode;
  private inspectedLeafNode: RuntimeNode | null = null;
  private hoveredNode: RuntimeNode | null = null;
  private xrHoveredAction: VrPanelAction | null = null;
  private isXRPresenting = false;
  private xrAnchorInitialized = false;
  private modelLabel: string;
  private canGoToPreviousModel: boolean;
  private canGoToNextModel: boolean;
  private theme: ViewerTheme;

  constructor(options: ViewerOptions) {
    this.container = options.container;
    this.hudEl = options.hudEl;
    this.breadcrumbEl = options.breadcrumbEl;
    this.detailsEl = options.detailsEl;
    this.backButton = options.backButton;
    this.resetButton = options.resetButton;
    this.xrButtonMountEl = options.xrButtonMountEl;
    this.onPreviousModelRequest = options.onPreviousModelRequest;
    this.onNextModelRequest = options.onNextModelRequest;
    this.modelLabel = options.modelLabel;
    this.canGoToPreviousModel = options.canGoToPreviousModel;
    this.canGoToNextModel = options.canGoToNextModel;
    this.theme = options.theme;

    this.renderer.domElement.className = "viewer-canvas";
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType("local-floor");
    this.container.append(this.renderer.domElement);

    this.scene.background = new THREE.Color("#e9f0eb");
    this.scene.fog = this.sceneFog;
    this.scene.add(this.presentationRoot);
    this.presentationRoot.add(this.sceneRoot);
    this.scene.add(this.vrPanel.root);

    this.camera.position.set(0, 1.5, 11.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 18;
    this.controls.minPolarAngle = Math.PI * 0.2;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.target.copy(this.baseFocusPosition);

    this.setupScene();
    this.setupXRControllers();
    this.setupXRButton();
    this.applyTheme();

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

    this.renderer.setAnimationLoop(this.animate);
  }

  goBack(): void {
    if (this.inspectedLeafNode) {
      this.inspectedLeafNode = null;
      this.hoveredNode = null;
      this.xrHoveredAction = null;
      this.updateLayout();
      return;
    }

    if (!this.focusNode.parent) {
      return;
    }

    this.focusNode = this.focusNode.parent;
    this.selectedNode = this.focusNode;
    this.hoveredNode = null;
    this.xrHoveredAction = null;
    this.updateLayout();
  }

  reset(): void {
    this.inspectedLeafNode = null;
    this.focusNode = this.rootNode;
    this.selectedNode = this.rootNode;
    this.hoveredNode = null;
    this.xrHoveredAction = null;
    this.updateLayout();
  }

  setTheme(theme: ViewerTheme): void {
    if (this.theme === theme) {
      return;
    }

    this.theme = theme;
    this.applyTheme();
  }

  setData(
    data: DiagramNode,
    options: {
      modelLabel: string;
      canGoToPreviousModel: boolean;
      canGoToNextModel: boolean;
    },
  ): void {
    this.clearRuntimeGraph();
    this.modelLabel = options.modelLabel;
    this.canGoToPreviousModel = options.canGoToPreviousModel;
    this.canGoToNextModel = options.canGoToNextModel;
    this.rootNode = this.buildRuntime(data, null, 0);
    this.focusNode = this.rootNode;
    this.selectedNode = this.rootNode;
    this.inspectedLeafNode = null;
    this.hoveredNode = null;
    this.xrHoveredAction = null;
    if (!this.isXRPresenting) {
      this.renderer.domElement.style.cursor = "grab";
    }
    this.updateLayout(true);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.handleResize);
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.removeEventListener("click", this.handleClick);
    this.renderer.xr.removeEventListener("sessionstart", this.handleXRSessionStart);
    this.renderer.xr.removeEventListener("sessionend", this.handleXRSessionEnd);
    this.controls.dispose();
    this.resizeObserver?.disconnect();

    for (const controllerState of this.xrControllers) {
      controllerState.controller.removeEventListener("selectstart", this.handleXRSelectStart);
      controllerState.controller.removeEventListener("connected", this.handleXRControllerConnected);
      controllerState.controller.removeEventListener(
        "disconnected",
        this.handleXRControllerDisconnected,
      );
      controllerState.ray.geometry.dispose();
      controllerState.rayMaterial.dispose();
    }

    this.clearRuntimeGraph();

    this.vrPanel.panelMesh.geometry.dispose();
    this.vrPanel.panelMaterial.dispose();
    this.vrPanel.panelTexture.dispose();
    this.vrPanel.shadowMesh.geometry.dispose();
    this.vrPanel.shadowMaterial.dispose();
    Object.values(this.vrPanel.buttons).forEach((button) => {
      button.mesh.geometry.dispose();
      button.material.dispose();
      button.texture.dispose();
    });

    this.floor.geometry.dispose();
    this.floorMaterial.dispose();

    this.renderer.dispose();
    this.container.replaceChildren();
  }

  private async setupXRButton(): Promise<void> {
    if (!("xr" in navigator) || !navigator.xr) {
      return;
    }

    try {
      const supported = await navigator.xr.isSessionSupported("immersive-vr");
      if (!supported) {
        return;
      }

      const button = VRButton.createButton(this.renderer, {
        optionalFeatures: ["local-floor"],
      });

      button.classList.add("hud-button");
      Object.assign(button.style, {
        position: "relative",
        right: "auto",
        left: "auto",
        bottom: "auto",
        top: "auto",
        margin: "0",
        width: "100%",
        border: "0",
        padding: "0.72rem 1rem",
        borderRadius: "0.95rem",
        background: "linear-gradient(135deg, #8b5e2d, #b05f1b)",
        color: "#fffaf4",
        fontFamily: '"Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif',
        fontSize: "0.95rem",
        fontWeight: "700",
        textAlign: "center",
        opacity: "1",
      });

      this.xrButtonMountEl.replaceChildren(button);
    } catch {
      this.xrButtonMountEl.replaceChildren();
    }
  }

  private setupXRControllers(): void {
    for (let index = 0; index < 2; index += 1) {
      const controller = this.renderer.xr.getController(index) as unknown as XrControllerObject;
      const rayGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ]);
      const rayMaterial = new THREE.LineBasicMaterial({
        color: "#f2b56a",
        transparent: true,
        opacity: 0.95,
      });
      const ray = new THREE.Line(rayGeometry, rayMaterial);
      ray.name = `xr-ray-${index}`;
      ray.scale.z = XR_RAY_LENGTH;
      ray.visible = false;
      const flashlight = new THREE.SpotLight(
        "#fff0c7",
        0,
        18,
        THREE.MathUtils.degToRad(16),
        0.9,
        1.3,
      );
      flashlight.position.set(0, 0, 0);
      flashlight.visible = false;
      flashlight.castShadow = false;
      flashlight.target.position.set(0, 0, -2.8);
      controller.add(ray);
      controller.add(flashlight);
      controller.add(flashlight.target);
      controller.userData.xrRay = ray;
      controller.userData.xrIndex = index;
      controller.userData.xrConnected = false;
      controller.addEventListener("selectstart", this.handleXRSelectStart);
      controller.addEventListener("connected", this.handleXRControllerConnected);
      controller.addEventListener("disconnected", this.handleXRControllerDisconnected);
      this.scene.add(controller);

      this.xrControllers.push({
        controller,
        ray,
        rayMaterial,
        flashlight,
      });
    }
  }

  private setupScene(): void {
    this.keyLight.position.set(5, 8, 7);
    this.fillLight.position.set(-5, 5, 3);

    this.overheadDarkLight.castShadow = true;
    this.overheadDarkLight.shadow.mapSize.set(1024, 1024);
    this.overheadDarkLight.shadow.bias = -0.00012;
    this.overheadDarkLight.shadow.normalBias = 0.02;
    this.overheadDarkLight.visible = false;
    this.scene.add(this.overheadDarkLight.target);

    this.desktopFlashlight.visible = false;
    this.desktopFlashlight.castShadow = false;
    this.scene.add(this.desktopFlashlight.target);

    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -4.8;
    this.floor.receiveShadow = true;

    this.scene.add(this.hemisphereLight);
    this.scene.add(this.keyLight);
    this.scene.add(this.fillLight);
    this.scene.add(this.overheadDarkLight);
    this.scene.add(this.desktopFlashlight);
    this.scene.add(this.floor);
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
      targetPosition: parent ? new THREE.Vector3() : this.baseFocusPosition.clone(),
      targetScale: parent ? 0.72 : 1.08,
      targetOpacity: parent ? 0 : 1,
      targetEmphasis: parent ? 0 : 0.9,
      currentOpacity: parent ? 0 : 1,
      currentEmphasis: parent ? 0 : 0.9,
    };

    visual.group.position.copy(runtimeNode.targetPosition);
    visual.group.scale.setScalar(runtimeNode.targetScale);
    visual.frame.castShadow = true;
    visual.frame.receiveShadow = true;
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

  private clearRuntimeGraph(): void {
    for (const edge of this.edges) {
      this.sceneRoot.remove(edge.line);
      edge.line.geometry.dispose();
      edge.material.dispose();
    }
    this.edges.length = 0;

    for (const node of this.nodes) {
      this.sceneRoot.remove(node.visual.group);
      node.visual.frame.geometry.dispose();
      node.visual.frameMaterial.dispose();
      node.visual.outline.geometry.dispose();
      node.visual.outlineMaterial.dispose();
      node.visual.label.geometry.dispose();
      node.visual.labelMaterial.dispose();
      node.visual.texture.dispose();
    }
    this.nodes.length = 0;
    this.pickables.length = 0;
  }

  private createEdge(parent: RuntimeNode, child: RuntimeNode): RuntimeEdge {
    const positions = new Float32Array(12);
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
      route: "direct",
      targetOpacity: 0,
      currentOpacity: 0,
    };
  }

  private attachEvents(): void {
    window.addEventListener("resize", this.handleResize);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.addEventListener("click", this.handleClick);
    this.renderer.xr.addEventListener("sessionstart", this.handleXRSessionStart);
    this.renderer.xr.addEventListener("sessionend", this.handleXRSessionEnd);
  }

  private applyTheme(): void {
    const isDark = this.theme === "dark";

    this.scene.background = new THREE.Color(isDark ? "#081017" : "#e9f0eb");
    this.sceneFog.color.set(isDark ? "#081017" : "#e9f0eb");
    this.sceneFog.near = isDark ? 9 : 12;
    this.sceneFog.far = isDark ? 24 : 28;

    this.hemisphereLight.color.set(isDark ? "#8a9dbb" : "#fff9f0");
    this.hemisphereLight.groundColor.set(isDark ? "#05090d" : "#b7c7c2");
    this.hemisphereLight.intensity = isDark ? 0.24 : 1.6;

    this.keyLight.color.set(isDark ? "#6a7b90" : "#fff4d6");
    this.keyLight.intensity = isDark ? 0.34 : 1.15;

    this.fillLight.color.set(isDark ? "#4b6070" : "#d9eef2");
    this.fillLight.intensity = isDark ? 0.24 : 0.9;

    this.floorMaterial.color.set(isDark ? "#111b24" : "#dbe7e1");
    this.floorMaterial.opacity = isDark ? 0.82 : 0.72;

    this.overheadDarkLight.visible = isDark;
    this.overheadDarkLight.intensity = isDark ? 1.3 : 0;
    this.renderer.shadowMap.enabled = isDark;

    this.desktopFlashlight.visible = isDark && !this.isXRPresenting;
    this.desktopFlashlight.intensity = isDark && !this.isXRPresenting ? 0.52 : 0;

    this.vrPanel.shadowMesh.visible = isDark;
    this.vrPanel.shadowMaterial.color.set(isDark ? "#101a23" : "#fff7ec");
    this.vrPanel.shadowMaterial.opacity = isDark ? 0.64 : 0.74;

    this.updateControllerFlashlights();
  }

  private updateDesktopPointer(event: PointerEvent): void {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.desktopLightPointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.desktopLightPointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  }

  private updateControllerFlashlights(): void {
    const isDark = this.theme === "dark";

    for (const controllerState of this.xrControllers) {
      const visible =
        isDark &&
        this.isXRPresenting &&
        controllerState.controller.userData.xrConnected === true;
      controllerState.flashlight.visible = visible;
      controllerState.flashlight.intensity = visible ? 0.58 : 0;
    }
  }

  private updateDarkModeLighting(): void {
    if (this.theme !== "dark") {
      return;
    }

    this.presentationRoot.updateMatrixWorld(true);
    this.focusWorldPosition.copy(this.currentFocusLocalPosition);
    this.presentationRoot.localToWorld(this.focusWorldPosition);

    this.tempVector.set(1.6, 8.6, 6.2).applyQuaternion(this.presentationRoot.quaternion);
    this.overheadDarkLight.position.copy(this.focusWorldPosition).add(this.tempVector);
    this.overheadDarkLight.target.position.copy(this.focusWorldPosition);
    this.overheadDarkLight.target.updateMatrixWorld();

    if (this.isXRPresenting) {
      return;
    }

    this.camera.getWorldDirection(this.tempVector);
    this.lightPlane.setFromNormalAndCoplanarPoint(this.tempVector, this.focusWorldPosition);
    this.raycaster.setFromCamera(this.desktopLightPointer, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.lightPlane, this.tempVectorB)) {
      this.tempVectorB.copy(this.focusWorldPosition);
    }

    this.camera.getWorldPosition(this.desktopFlashlight.position);
    this.desktopFlashlight.position.y += 0.22;
    this.desktopFlashlight.position.addScaledVector(this.tempVector, 0.42);
    this.desktopFlashlight.target.position.copy(this.tempVectorB);
    this.desktopFlashlight.target.updateMatrixWorld();
  }

  private readonly handleResize = (): void => {
    const width = Math.max(this.container.clientWidth, 320);
    const height = Math.max(this.container.clientHeight, 320);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.isXRPresenting) {
      return;
    }

    this.updateDesktopPointer(event);
    const hovered = this.pickNode(event);
    if (hovered === this.hoveredNode) {
      return;
    }

    this.hoveredNode = hovered;
    this.renderer.domElement.style.cursor = hovered ? "pointer" : "grab";
    this.updateLayout();
  };

  private readonly handlePointerLeave = (): void => {
    if (this.isXRPresenting) {
      return;
    }

    this.desktopLightPointer.set(0, 0);
    this.hoveredNode = null;
    this.renderer.domElement.style.cursor = "grab";
    this.updateLayout();
  };

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.isXRPresenting) {
      return;
    }

    const pickedNode = this.pickNode(event);
    if (!pickedNode) {
      return;
    }

    this.activateNode(pickedNode);
  };

  private readonly handleXRSessionStart = (): void => {
    this.isXRPresenting = true;
    this.xrAnchorInitialized = false;
    this.xrHoveredAction = null;
    this.hoveredNode = null;
    this.controls.enabled = false;
    this.hudEl.hidden = true;
    this.vrPanel.root.visible = true;
    this.applyTheme();
    this.updateLayout(true);
  };

  private readonly handleXRSessionEnd = (): void => {
    this.isXRPresenting = false;
    this.xrAnchorInitialized = false;
    this.xrHoveredAction = null;
    this.hoveredNode = null;
    this.controls.enabled = true;
    this.hudEl.hidden = false;
    this.vrPanel.root.visible = false;
    this.presentationRoot.visible = true;
    this.presentationRoot.position.set(0, 0, 0);
    this.presentationRoot.quaternion.identity();
    this.presentationRoot.scale.setScalar(1);

    for (const controllerState of this.xrControllers) {
      controllerState.ray.scale.z = XR_RAY_LENGTH;
    }

    this.renderer.domElement.style.cursor = "grab";
    this.applyTheme();
    this.updateLayout(true);
  };

  private readonly handleXRSelectStart = (event: Event): void => {
    if (!this.isXRPresenting) {
      return;
    }

    const controller = event.target as unknown as XrControllerObject;
    const target = this.pickXRTarget(controller);
    if (!target) {
      return;
    }

    if (target.type === "node") {
      this.activateNode(target.node);
      return;
    }

    this.performVrAction(target.action);
  };

  private readonly handleXRControllerConnected = (event: Event): void => {
    const controller = event.target as unknown as XrControllerObject;
    const ray = controller.userData.xrRay as THREE.Line | undefined;
    if (ray) {
      controller.userData.xrConnected = true;
      ray.visible = true;
    }
    this.updateControllerFlashlights();
  };

  private readonly handleXRControllerDisconnected = (event: Event): void => {
    const controller = event.target as unknown as XrControllerObject;
    const ray = controller.userData.xrRay as THREE.Line | undefined;
    if (ray) {
      controller.userData.xrConnected = false;
      ray.visible = false;
    }
    this.updateControllerFlashlights();
  };

  private activateNode(node: RuntimeNode): void {
    this.hoveredNode = node;
    this.xrHoveredAction = null;

    if (node.children.length > 0) {
      this.inspectedLeafNode = null;
      this.focusNode = node;
      this.selectedNode = node;
    } else if (this.inspectedLeafNode === node) {
      this.inspectedLeafNode = null;
      this.selectedNode = node;
    } else {
      this.inspectedLeafNode = node;
      this.selectedNode = node;
    }

    this.updateLayout();
  }

  private performVrAction(action: VrPanelAction): void {
    if (action === "previous-model") {
      if (this.canGoToPreviousModel) {
        this.xrHoveredAction = null;
        this.onPreviousModelRequest();
      }
      return;
    }

    if (action === "next-model") {
      if (this.canGoToNextModel) {
        this.xrHoveredAction = null;
        this.onNextModelRequest();
      }
      return;
    }

    if (action === "back") {
      this.goBack();
      return;
    }

    this.reset();
  }

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

  private pickXRTarget(controller: XrControllerObject): XrPickTarget | null {
    this.raycaster.far = XR_RAY_LENGTH;

    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3(0, 0, -1);
    const rotation = new THREE.Matrix4();

    origin.setFromMatrixPosition(controller.matrixWorld);
    rotation.extractRotation(controller.matrixWorld);
    direction.applyMatrix4(rotation).normalize();

    this.raycaster.ray.origin.copy(origin);
    this.raycaster.ray.direction.copy(direction);

    const intersections = this.raycaster.intersectObjects(
      [...this.pickables, ...this.vrPanel.interactiveObjects],
      false,
    );

    for (const intersection of intersections) {
      const action = intersection.object.userData.vrAction as VrPanelAction | undefined;
      if (action) {
        if (this.isVrActionEnabled(action)) {
          return {
            type: "action",
            action,
            distance: intersection.distance,
          };
        }
        continue;
      }

      const runtimeNode = intersection.object.userData.runtimeNode as RuntimeNode | undefined;
      if (
        runtimeNode &&
        runtimeNode.currentOpacity > 0.4 &&
        runtimeNode.visual.group.visible
      ) {
        return {
          type: "node",
          node: runtimeNode,
          distance: intersection.distance,
        };
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
    const currentFocusPosition = getFocusPosition(this.focusNode.depth);
    const displayFocusNode = this.inspectedLeafNode ?? this.focusNode;
    const contextNodes = this.inspectedLeafNode ? focusPath : ancestors;
    const displayChildren = this.inspectedLeafNode ? [] : children;
    const ancestorPositions = getAncestorPositions(contextNodes.length, currentFocusPosition);
    const childPositions = getChildPositions(displayChildren.length, currentFocusPosition);
    const visibleNodes = this.inspectedLeafNode
      ? new Set<RuntimeNode>([...focusPath, displayFocusNode])
      : new Set<RuntimeNode>([...focusPath, ...displayChildren]);
    this.currentFocusLocalPosition.copy(currentFocusPosition);

    for (const node of this.nodes) {
      const contextIndex = contextNodes.indexOf(node);
      const childIndex = displayChildren.indexOf(node);

      if (node === displayFocusNode) {
        node.targetPosition.copy(currentFocusPosition);
        node.targetScale = 1.08;
        node.targetOpacity = 1;
        node.targetEmphasis = node === this.hoveredNode ? 1.15 : 0.92;
      } else if (contextIndex >= 0) {
        node.targetPosition.copy(ancestorPositions[contextIndex]);
        node.targetScale = 0.74;
        node.targetOpacity = 0.92;
        node.targetEmphasis = node === this.hoveredNode ? 0.72 : 0.34;
      } else if (childIndex >= 0) {
        node.targetPosition.copy(childPositions[childIndex]);
        node.targetScale = node === this.selectedNode ? 0.98 : 0.88;
        node.targetOpacity = 1;
        node.targetEmphasis =
          node === this.selectedNode ? 1 : node === this.hoveredNode ? 0.62 : 0.24;
      } else {
        const parentPosition = node.parent
          ? node.parent.visual.group.position
          : currentFocusPosition;
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
    this.updatePresentationRoot();
    this.renderHud();
    this.renderVrPanel();
  }

  private updateEdges(focusPath: RuntimeNode[], immediate: boolean): void {
    const pathSet = new Set(focusPath);

    for (const edge of this.edges) {
      const isPathEdge = pathSet.has(edge.parent) && pathSet.has(edge.child);
      const isInspectedLeafEdge =
        this.inspectedLeafNode !== null &&
        edge.parent === this.focusNode &&
        edge.child === this.inspectedLeafNode;
      const isFocusedChild = edge.parent === this.focusNode && edge.child.parent === this.focusNode;

      if (isPathEdge) {
        edge.targetOpacity = 0.86;
        edge.route = "direct";
      } else if (isInspectedLeafEdge) {
        edge.targetOpacity = 0.78;
        edge.route = "direct";
      } else if (!this.inspectedLeafNode && isFocusedChild) {
        edge.targetOpacity = edge.child === this.selectedNode ? 0.72 : 0.44;
        edge.route = "elbow";
      } else {
        edge.targetOpacity = 0;
        edge.route = "direct";
      }

      if (immediate) {
        edge.currentOpacity = edge.targetOpacity;
      }
    }
  }

  private updatePresentationRoot(): void {
    if (!this.isXRPresenting) {
      this.presentationRoot.visible = true;
      this.presentationRoot.position.set(0, 0, 0);
      this.presentationRoot.quaternion.identity();
      this.presentationRoot.scale.setScalar(1);
      return;
    }

    if (!this.xrAnchorInitialized) {
      this.presentationRoot.visible = false;
      return;
    }

    this.presentationRoot.visible = true;
    this.presentationRoot.scale.setScalar(XR_DIAGRAM_SCALE);
    this.presentationRoot.quaternion.copy(this.xrAnchorRotation);

    const focusOffset = this.currentFocusLocalPosition
      .clone()
      .multiplyScalar(XR_DIAGRAM_SCALE)
      .applyQuaternion(this.xrAnchorRotation);

    this.presentationRoot.position
      .copy(this.xrAnchorWorldPosition)
      .add(XR_MODEL_LOCAL_OFFSET.clone().applyQuaternion(this.xrAnchorRotation))
      .sub(focusOffset);
  }

  private renderHud(): void {
    const state = this.getUiState();
    this.backButton.disabled = state.backDisabled;
    this.resetButton.disabled = state.resetDisabled;

    this.breadcrumbEl.replaceChildren();
    state.focusPath.forEach((node, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = index === state.focusPath.length - 1 ? "breadcrumb is-active" : "breadcrumb";
      button.textContent = node.data.title;
      button.addEventListener("click", () => {
        this.inspectedLeafNode = null;
        this.focusNode = node;
        this.selectedNode = node;
        this.hoveredNode = null;
        this.xrHoveredAction = null;
        this.updateLayout();
      });
      this.breadcrumbEl.append(button);
    });

    this.detailsEl.innerHTML = `
      <p class="selection-label">${state.selectionLabel}</p>
      <p class="selection-title">${state.selectedTitle}</p>
      <p class="selection-subtitle">${state.selectedSubtitle}</p>
    `;
  }

  private renderVrPanel(): void {
    const state = this.getUiState();
    updateVrPanel(this.vrPanel, {
      selectionLabel: state.selectionLabel,
      title: state.selectedTitle,
      subtitle: state.selectedSubtitle,
      pathText: state.pathText,
      modelLabel: state.modelLabel,
      previousModelDisabled: state.previousModelDisabled,
      nextModelDisabled: state.nextModelDisabled,
      backDisabled: state.backDisabled,
      resetDisabled: state.resetDisabled,
      hoveredAction: this.xrHoveredAction,
    });
  }

  private getUiState(): ViewerUiState {
    const focusPath = this.getFocusPath();

    return {
      focusPath,
      selectionLabel: this.inspectedLeafNode
        ? "Inspecting field"
        : this.selectedNode.children.length > 0
          ? "Expanded node"
          : "Selected field",
      selectedTitle: this.selectedNode.data.title,
      selectedSubtitle: this.selectedNode.data.subtitle ?? "No extra metadata for this node.",
      pathText: focusPath.map((node) => node.data.title).join(" / "),
      modelLabel: this.modelLabel,
      previousModelDisabled: !this.canGoToPreviousModel,
      nextModelDisabled: !this.canGoToNextModel,
      backDisabled: this.inspectedLeafNode === null && this.focusNode.parent === null,
      resetDisabled:
        this.inspectedLeafNode === null &&
        this.focusNode === this.rootNode &&
        this.selectedNode === this.rootNode,
    };
  }

  private isVrActionEnabled(action: VrPanelAction): boolean {
    if (action === "previous-model") {
      return this.canGoToPreviousModel;
    }

    if (action === "next-model") {
      return this.canGoToNextModel;
    }

    if (action === "back") {
      return this.inspectedLeafNode !== null || this.focusNode.parent !== null;
    }

    return !(
      this.inspectedLeafNode === null &&
      this.focusNode === this.rootNode &&
      this.selectedNode === this.rootNode
    );
  }

  private readonly animate = (time: number): void => {
    if (this.disposed) {
      return;
    }

    const delta = Math.min(0.05, (time - this.lastFrameTime || 16) / 1000);
    this.lastFrameTime = time;

    if (this.isXRPresenting) {
      if (!this.xrAnchorInitialized) {
        this.initializeXRAnchorFromCamera();
      }

      this.updateVrPanelTransform();
      this.updateXRInteractionState();
    }

    for (const node of this.nodes) {
      dampVector3(node.visual.group.position, node.targetPosition, 9.5, delta);
      const scale = dampNumber(node.visual.group.scale.x, node.targetScale, 8.5, delta);
      node.visual.group.scale.setScalar(scale);
      node.currentOpacity = dampNumber(node.currentOpacity, node.targetOpacity, 9, delta);
      node.currentEmphasis = dampNumber(node.currentEmphasis, node.targetEmphasis, 8, delta);

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
      this.updateEdgeGeometry(edge);
      edge.line.geometry.attributes.position.needsUpdate = true;
    }

    if (!this.isXRPresenting) {
      this.controls.update();
    }

    this.updateDarkModeLighting();
    this.updateControllerFlashlights();

    this.renderer.render(this.scene, this.camera);
  };

  private initializeXRAnchorFromCamera(): void {
    const xrCamera = this.renderer.xr.getCamera();
    const cameraPosition = new THREE.Vector3();
    const forward = new THREE.Vector3();

    xrCamera.getWorldPosition(cameraPosition);
    xrCamera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) {
      forward.set(0, 0, -1);
    }
    forward.normalize();

    this.xrAnchorWorldPosition.copy(cameraPosition);
    this.xrAnchorWorldPosition.add(forward.clone().multiplyScalar(XR_TABLE_DISTANCE));
    this.xrAnchorWorldPosition.y += XR_TABLE_VERTICAL_OFFSET;

    const facingDirection = forward.clone().multiplyScalar(-1);
    this.xrAnchorRotation.setFromUnitVectors(FORWARD_AXIS, facingDirection);
    this.xrAnchorInitialized = true;
    this.updatePresentationRoot();
  }

  private updateVrPanelTransform(): void {
    if (!this.isXRPresenting) {
      return;
    }

    if (!this.xrAnchorInitialized) {
      return;
    }

    const localOffset = XR_PANEL_LOCAL_OFFSET.clone().applyQuaternion(this.xrAnchorRotation);
    this.xrPanelWorldPosition.copy(this.xrAnchorWorldPosition).add(localOffset);
    this.vrPanel.root.position.copy(this.xrPanelWorldPosition);
    this.vrPanel.root.quaternion.copy(this.xrAnchorRotation).multiply(XR_PANEL_TILT);
  }

  private updateXRInteractionState(): void {
    let hoveredNode: RuntimeNode | null = null;
    let hoveredAction: VrPanelAction | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const controllerState of this.xrControllers) {
      const target = this.pickXRTarget(controllerState.controller);
      controllerState.ray.visible =
        this.isXRPresenting && controllerState.controller.userData.xrConnected === true;
      controllerState.ray.scale.z = target ? target.distance : XR_RAY_LENGTH;

      if (!target || target.distance >= bestDistance) {
        continue;
      }

      bestDistance = target.distance;
      if (target.type === "node") {
        hoveredNode = target.node;
        hoveredAction = null;
      } else {
        hoveredNode = null;
        hoveredAction = target.action;
      }
    }

    if (hoveredNode === this.hoveredNode && hoveredAction === this.xrHoveredAction) {
      return;
    }

    this.hoveredNode = hoveredNode;
    this.xrHoveredAction = hoveredAction;
    this.updateLayout();
  }

  private updateEdgeGeometry(edge: RuntimeEdge): void {
    if (edge.route === "elbow") {
      this.setElbowEdgePoints(edge);
      return;
    }

    this.setDirectEdgePoints(edge);
  }

  private setDirectEdgePoints(edge: RuntimeEdge): void {
    const startOnRight = edge.child.visual.group.position.x >= edge.parent.visual.group.position.x;
    const start = this.getNodeAnchor(edge.parent, startOnRight ? "right" : "left");
    const end = this.getNodeAnchor(edge.child, startOnRight ? "left" : "right");
    const firstMid = start.clone().lerp(end, 0.34);
    const secondMid = start.clone().lerp(end, 0.68);

    this.setPolyline(edge.positions, [start, firstMid, secondMid, end]);
  }

  private setElbowEdgePoints(edge: RuntimeEdge): void {
    const start = this.getNodeAnchor(edge.parent, "right");
    const end = this.getNodeAnchor(edge.child, "left");
    const elbowX = THREE.MathUtils.lerp(start.x, end.x, 0.44);
    const firstBend = new THREE.Vector3(elbowX, start.y, start.z);
    const secondBend = new THREE.Vector3(elbowX, end.y, end.z);

    this.setPolyline(edge.positions, [start, firstBend, secondBend, end]);
  }

  private getNodeAnchor(node: RuntimeNode, side: "left" | "right"): THREE.Vector3 {
    const offset = (CARD_SIZE.width * node.visual.group.scale.x) * 0.5;
    const direction = side === "right" ? 1 : -1;
    return new THREE.Vector3(
      node.visual.group.position.x + offset * direction,
      node.visual.group.position.y,
      node.visual.group.position.z,
    );
  }

  private setPolyline(pointsBuffer: Float32Array, points: THREE.Vector3[]): void {
    points.forEach((point, index) => {
      const offset = index * 3;
      pointsBuffer[offset] = point.x;
      pointsBuffer[offset + 1] = point.y;
      pointsBuffer[offset + 2] = point.z;
    });
  }
}
