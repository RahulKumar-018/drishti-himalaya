import * as THREE from "three";
import type { ExperienceMode, RouteSegment, CorridorPoint, VisualTheme } from "../types/route";
import { CameraController } from "./CameraController";
import { TerrainRenderer } from "./TerrainRenderer";
import { TerrainInteraction, type TerrainInteractionHandlers } from "./TerrainInteraction";

export interface TerrainSceneOptions {
  container: HTMLElement;
  points: CorridorPoint[];
  segments: RouteSegment[];
  onWebGLUnavailable?: () => void;
  onSegmentHover?: TerrainInteractionHandlers["onHoverSegment"];
  onSegmentSelect?: TerrainInteractionHandlers["onSelectSegment"];
}

export class TerrainScene {
  private readonly container: HTMLElement;
  private readonly points: CorridorPoint[];
  private segments: RouteSegment[];
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly terrain: TerrainRenderer;
  private readonly cameraController: CameraController;
  private readonly interaction: TerrainInteraction;
  private readonly reducedMotion: boolean;
  private readonly resizeObserver: ResizeObserver;
  private frameId = 0;
  private startedAt = performance.now();

  constructor(options: TerrainSceneOptions) {
    this.container = options.container;
    this.points = options.points;
    this.segments = options.segments;
    this.reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      options.onWebGLUnavailable?.();
      throw new Error("WebGL unavailable");
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.setClearColor("#101412", 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.domElement.setAttribute("aria-label", "Cinematic Three.js terrain visualization of the Himalayan corridor");
    this.renderer.domElement.setAttribute("role", "img");
    this.container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.FogExp2("#101412", 0.055);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    this.cameraController = new CameraController(this.camera, this.reducedMotion);
    this.terrain = new TerrainRenderer(this.points, this.segments, this.reducedMotion);
    this.scene.add(this.terrain.group);
    this.interaction = new TerrainInteraction(this.renderer.domElement, this.camera, this.terrain.getInteractiveObjects(), this.segments, {
      onHoverSegment: options.onSegmentHover ?? (() => undefined),
      onSelectSegment: options.onSegmentSelect ?? (() => undefined),
    });
    this.scene.add(new THREE.HemisphereLight("#9eb8ad", "#0a0f0c", 1.25));
    const keyLight = new THREE.DirectionalLight("#c4d2bc", 2.2);
    keyLight.position.set(-4, 8, 5);
    this.scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight("#6e8c8b", 1.2);
    rimLight.position.set(5, 2, -4);
    this.scene.add(rimLight);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  updateSegments(segments: RouteSegment[]) {
    this.segments = segments;
    this.terrain.updateSegments(segments);
  }

  private resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private animate = () => {
    this.frameId = requestAnimationFrame(this.animate);
    const elapsed = (performance.now() - this.startedAt) / 1000;
    this.terrain.tick(elapsed, this.reducedMotion);
    this.cameraController.tick();
    this.renderer.render(this.scene, this.camera);
  };

  setMode(mode: ExperienceMode) {
    this.terrain.setMode(mode);
  }

  setTheme(theme: VisualTheme) {
    const bright = theme === "bright";
    this.renderer.setClearColor(bright ? "#cbd5ca" : "#101412", 1);
    this.renderer.toneMappingExposure = bright ? 1.08 : 0.82;
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.set(bright ? "#cbd5ca" : "#101412");
    this.scene.traverse((object) => {
      if (object instanceof THREE.HemisphereLight) {
        object.color.set(bright ? "#f5efe1" : "#9eb8ad");
        object.groundColor.set(bright ? "#7d8c7f" : "#0a0f0c");
        object.intensity = bright ? 1.8 : 1.25;
      }
      if (object instanceof THREE.DirectionalLight) object.intensity = bright ? 2.8 : 2.2;
    });
    this.terrain.setTheme(theme);
  }

  setScrollProgress(progress: number) {
    this.cameraController.setScrollProgress(progress);
  }

  setWeatherState(state: string, rainMm: number | null) {
    this.terrain.setWeatherState(state, rainMm);
  }

  setRouteSpan(startId: string | null, destinationId: string | null) {
    this.terrain.setRouteSpan(startId, destinationId);
    const start = this.points.find((point) => point.id === startId);
    const destination = this.points.find((point) => point.id === destinationId);
    if (start && destination) this.cameraController.focusRoute(start, destination);
  }

  setSelectedSegment(segmentId: string | null) {
    this.terrain.setSelectedSegment(segmentId);
    const segment = this.segments.find((item) => item.id === segmentId);
    if (segment) this.cameraController.focusSegment(segment, this.points);
  }

  setHoveredSegment(segmentId: string | null) {
    this.terrain.setHoveredSegment(segmentId);
  }

  resetOverview() {
    this.terrain.setSelectedSegment(null);
    this.cameraController.overview();
  }

  dispose() {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.interaction.dispose();
    this.terrain.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
