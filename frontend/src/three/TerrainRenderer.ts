import * as THREE from "three";
import type { CorridorPoint, ExperienceMode, RouteSegment, VisualTheme } from "../types/route";
import { getRiskColor, getRiskIntensity } from "../services/risk/riskEngine";
import { createProvisionalTerrainSamples } from "../services/terrain/TerrainDataProvider";

const scenePoint = (point: CorridorPoint, y = 0.4) => new THREE.Vector3(point.scenePosition[0], y, point.scenePosition[1]);

export class TerrainRenderer {
  readonly group = new THREE.Group();
  private readonly terrainMaterial: THREE.MeshStandardMaterial;
  private readonly terrainWireMaterial: THREE.MeshBasicMaterial;
  private readonly routeMaterials = new Map<string, THREE.LineBasicMaterial>();
  private readonly routeLines = new Map<string, THREE.Line>();
  private readonly pointMarkers = new Map<string, THREE.Group>();
  private readonly rain: THREE.Points;
  private readonly contourGroup = new THREE.Group();
  private readonly mountainMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly snowMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly points: CorridorPoint[];
  private segments: RouteSegment[];
  private mode: ExperienceMode = "overview";
  private theme: VisualTheme = "dark";
  private weatherAvailable = false;
  private liveRainMm: number | null = null;
  private selectedSegmentId: string | null = null;
  private hoveredSegmentId: string | null = null;
  private visibleStartIndex = 0;
  private visibleEndIndex = 999;

  constructor(points: CorridorPoint[], segments: RouteSegment[], reducedMotion = false) {
    this.points = points;
    this.segments = segments;
    this.terrainMaterial = new THREE.MeshStandardMaterial({ color: "#263a31", roughness: 0.96, metalness: 0.02, flatShading: true });
    this.terrainWireMaterial = new THREE.MeshBasicMaterial({ color: "#7c9277", wireframe: true, transparent: true, opacity: 0.14 });
    this.buildTerrain();
    this.buildMountains();
    this.buildRidges();
    this.buildRoute(points);
    this.buildMarkers(points);
    this.rain = this.buildRain(reducedMotion);
    this.group.add(this.contourGroup, this.rain);
    this.updateVisualState();
  }

  updateSegments(segments: RouteSegment[]) {
    this.segments = segments;
    this.updateVisualState();
  }

  private buildTerrain() {
    const provisionalSamples = createProvisionalTerrainSamples();
    const geometry = new THREE.PlaneGeometry(24, 13, 56, 30);
    const positions = geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getY(index);
      const sample = provisionalSamples[index % provisionalSamples.length]?.elevation ?? 0;
      const elevation = sample * 0.52 + Math.sin(x * 0.62) * 0.34 + Math.cos(z * 0.82) * 0.22 + Math.sin((x + z) * 0.36) * 0.18;
      positions.setZ(index, elevation);
    }
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(geometry, this.terrainMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.set(0, -1.18, 0);
    this.group.add(terrain);

    const wire = new THREE.Mesh(geometry.clone(), this.terrainWireMaterial);
    wire.rotation.x = -Math.PI / 2;
    wire.position.set(0, -1.13, 0);
    wire.visible = false;
    wire.name = "topographic-wireframe";
    this.group.add(wire);
  }

  private buildMountains() {
    const mountainWorld = new THREE.Group();
    mountainWorld.name = "mountain-world";
    const specs = [
      { x: -8.4, z: -2.9, height: 2.8, radius: 3.1, rotation: 0.1 },
      { x: -4.9, z: -3.2, height: 2.45, radius: 2.75, rotation: -0.2 },
      { x: -1.1, z: -3.6, height: 3.35, radius: 3.45, rotation: 0.24 },
      { x: 3.6, z: -3.2, height: 2.9, radius: 3.05, rotation: -0.18 },
      { x: 7.8, z: -2.9, height: 2.6, radius: 2.85, rotation: 0.17 },
    ];
    specs.forEach((spec, index) => {
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: index % 2 ? "#4b6452" : "#3b5545", roughness: 0.94, metalness: 0, flatShading: true });
      const snowMaterial = new THREE.MeshStandardMaterial({ color: "#aeb9ae", roughness: 0.92, flatShading: true, transparent: true, opacity: 0.85 });
      this.mountainMaterials.push(bodyMaterial);
      this.snowMaterials.push(snowMaterial);
      const body = new THREE.Mesh(new THREE.ConeGeometry(spec.radius, spec.height, 7, 1), bodyMaterial);
      body.position.set(spec.x, -1.04 + spec.height / 2, spec.z);
      body.rotation.y = spec.rotation;
      body.castShadow = false;
      const snow = new THREE.Mesh(new THREE.ConeGeometry(spec.radius * 0.42, spec.height * 0.28, 7, 1), snowMaterial);
      snow.position.set(spec.x, -1.04 + spec.height * 0.86, spec.z + 0.03);
      snow.rotation.y = spec.rotation;
      mountainWorld.add(body, snow);
    });
    this.group.add(mountainWorld);
  }

  private buildRidges() {
    const ridgeSpecs = [
      { y: 1.2, color: "#405547", opacity: 0.55, scale: 1.05 },
      { y: 0.55, color: "#2d4338", opacity: 0.78, scale: 1.28 },
      { y: -0.12, color: "#1f3029", opacity: 0.92, scale: 1.48 },
    ];
    ridgeSpecs.forEach((spec, ridgeIndex) => {
      const points: THREE.Vector3[] = [];
      for (let index = -12; index <= 12; index += 1) {
        const x = index * 0.68;
        const z = 1.1 + ridgeIndex * 1.25 + Math.sin(index * 0.75 + ridgeIndex * 1.2) * 0.32 + Math.cos(index * 0.24) * 0.28;
        points.push(new THREE.Vector3(x, spec.y + ridgeIndex * 0.04, z * spec.scale));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: spec.color, transparent: true, opacity: spec.opacity }));
      this.group.add(line);
    });

    for (let index = 0; index < 9; index += 1) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.05 + index * 0.34, 1.06 + index * 0.34, 96),
        new THREE.MeshBasicMaterial({ color: "#78917e", transparent: true, opacity: 0.06, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(-3.6 + index * 0.9, -0.85, -1.25 + Math.sin(index) * 0.3);
      this.contourGroup.add(ring);
    }
  }

  private buildRoute(points: CorridorPoint[]) {
    this.segments.forEach((segment) => {
      const from = points.find((point) => point.id === segment.startPointId);
      const to = points.find((point) => point.id === segment.destinationPointId);
      if (!from || !to) return;
      const mid = new THREE.Vector3().addVectors(scenePoint(from, 0.12), scenePoint(to, 0.12)).multiplyScalar(0.5);
      mid.y += 0.2 + Math.sin(segment.index * 0.8) * 0.07;
      const geometry = new THREE.BufferGeometry().setFromPoints([scenePoint(from, 0.1), mid, scenePoint(to, 0.1)]);
      const material = new THREE.LineBasicMaterial({ color: "#C6A16A", transparent: true, opacity: 0.22, linewidth: 2 });
      const line = new THREE.Line(geometry, material);
      line.name = segment.id;
      line.userData.segmentId = segment.id;
      this.routeMaterials.set(segment.id, material);
      this.routeLines.set(segment.id, line);
      this.group.add(line);
    });
  }

  private buildMarkers(points: CorridorPoint[]) {
    points.forEach((point) => {
      const marker = new THREE.Group();
      marker.name = point.id;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshBasicMaterial({ color: "#D9D4C7" }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.18, 24), new THREE.MeshBasicMaterial({ color: "#C6A16A", transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.02;
      marker.add(dot, ring);
      marker.position.copy(scenePoint(point, 0.28));
      marker.userData.pointId = point.id;
      this.pointMarkers.set(point.id, marker);
      this.group.add(marker);
    });
  }

  private buildRain(reducedMotion: boolean) {
    const count = reducedMotion ? 45 : 420;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = ((index * 17) % 240) / 10 - 12;
      positions[index * 3 + 1] = ((index * 31) % 100) / 10 - 2;
      positions[index * 3 + 2] = ((index * 13) % 100) / 10 - 5;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: "#9eafa6", size: reducedMotion ? 0.025 : 0.045, transparent: true, opacity: 0.25, depthWrite: false });
    return new THREE.Points(geometry, material);
  }

  setTheme(theme: VisualTheme) {
    this.theme = theme;
    const bright = this.theme === "bright";
    this.terrainMaterial.color.set(bright ? "#718574" : "#263c33");
    this.terrainWireMaterial.color.set(bright ? "#4c6654" : "#91a88b");
    this.mountainMaterials.forEach((material, index) => material.color.set(bright ? (index % 2 ? "#8a9b87" : "#718575") : (index % 2 ? "#4b6452" : "#3b5545")));
    this.snowMaterials.forEach((material) => material.color.set(bright ? "#f0eadb" : "#aeb9ae"));
    (this.rain.material as THREE.PointsMaterial).color.set(bright ? "#41675f" : "#b7d0c4");
    this.contourGroup.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial) object.material.color.set(bright ? "#527060" : "#78917e");
    });
    this.updateVisualState();
  }

  setWeatherState(state: string, rainMm: number | null) {
    this.weatherAvailable = state === "LIVE";
    this.liveRainMm = rainMm;
    this.updateVisualState();
  }

  setMode(mode: ExperienceMode) {
    this.mode = mode;
    this.updateVisualState();
  }

  setRouteSpan(startPointId: string | null, destinationPointId: string | null) {
    const startIndex = this.points.findIndex((point) => point.id === startPointId);
    const destinationIndex = this.points.findIndex((point) => point.id === destinationPointId);
    if (startIndex < 0 || destinationIndex < 0 || startIndex === destinationIndex) {
      this.visibleStartIndex = 0;
      this.visibleEndIndex = 999;
    } else {
      this.visibleStartIndex = Math.min(startIndex, destinationIndex);
      this.visibleEndIndex = Math.max(startIndex, destinationIndex);
    }
    this.updateVisualState();
  }

  setSelectedSegment(segmentId: string | null) {
    this.selectedSegmentId = segmentId;
    this.updateVisualState();
  }

  setHoveredSegment(segmentId: string | null) {
    this.hoveredSegmentId = segmentId;
    this.updateVisualState();
  }

  private updateVisualState() {
    this.routeLines.forEach((line, id) => {
      const segment = this.segments.find((item) => item.id === id);
      if (!segment) return;
      const inSpan = segment.index >= this.visibleStartIndex + 1 && segment.index <= this.visibleEndIndex;
      const isSelected = id === this.selectedSegmentId;
      const isHovered = id === this.hoveredSegmentId;
      const material = this.routeMaterials.get(id)!;
      material.color.set(getRiskColor(segment.risk));
      const riskIntensity = getRiskIntensity(segment.risk);
      material.opacity = !inSpan ? 0.06 : isSelected ? 0.95 : isHovered ? 0.8 : this.mode === "risk" ? 0.24 + riskIntensity * 0.42 : 0.32;
      line.scale.set(1, isSelected ? 1.4 : isHovered ? 1.18 : 1, 1);
    });

    this.pointMarkers.forEach((marker, id) => {
      const active = this.segments.some((segment) => segment.startPointId === id && segment.index >= this.visibleStartIndex + 1 && segment.index <= this.visibleEndIndex)
        || this.segments.some((segment) => segment.destinationPointId === id && segment.index >= this.visibleStartIndex + 1 && segment.index <= this.visibleEndIndex);
      marker.visible = this.mode !== "overview" && active;
    });

    const rainMaterial = this.rain.material as THREE.PointsMaterial;
    const weatherOpacity = this.weatherAvailable ? (this.liveRainMm && this.liveRainMm > 0 ? 0.56 : 0.12) : 0;
    rainMaterial.opacity = this.mode === "environment" ? weatherOpacity : weatherOpacity * 0.45;
    this.contourGroup.visible = this.mode === "terrain";
    const wire = this.group.getObjectByName("topographic-wireframe");
    if (wire) wire.visible = this.mode === "terrain";
  }

  tick(elapsed: number, reducedMotion: boolean) {
    const positions = this.rain.geometry.attributes.position as THREE.BufferAttribute;
    if (!reducedMotion) {
      for (let index = 0; index < positions.count; index += 1) {
        let y = positions.getY(index) - (this.mode === "environment" ? 0.085 : 0.035);
        if (y < -1.4) y = 6.5 + (index % 12) * 0.18;
        positions.setY(index, y);
        positions.setX(index, positions.getX(index) + 0.0015);
      }
      positions.needsUpdate = true;
      this.contourGroup.rotation.y = Math.sin(elapsed * 0.04) * 0.02;
    }
  }

  getInteractiveObjects() {
    return Array.from(this.routeLines.values());
  }

  dispose() {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material.dispose();
      }
    });
  }
}
