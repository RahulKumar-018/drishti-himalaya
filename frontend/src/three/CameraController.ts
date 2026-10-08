import * as THREE from "three";
import type { CorridorPoint, RouteSegment } from "../types/route";

export class CameraController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly reducedMotion: boolean;
  private targetPosition = new THREE.Vector3(0, 4.8, 12.5);
  private targetLookAt = new THREE.Vector3(0, -0.2, 0);
  private readonly currentLookAt = new THREE.Vector3(0, -0.2, 0);
  private scrollProgress = 0;

  constructor(camera: THREE.PerspectiveCamera, reducedMotion: boolean) {
    this.camera = camera;
    this.reducedMotion = reducedMotion;
    this.camera.position.copy(this.targetPosition);
  }

  overview() {
    this.targetPosition.set(0, 4.8, 12.5);
    this.targetLookAt.set(0, -0.3, 0);
  }

  focusRoute(start: CorridorPoint, destination: CorridorPoint) {
    const centerX = (start.scenePosition[0] + destination.scenePosition[0]) / 2;
    this.targetPosition.set(centerX * 0.18, 2.55, 9.3);
    this.targetLookAt.set(centerX, -0.25, 0);
  }

  focusSegment(segment: RouteSegment, points: CorridorPoint[]) {
    const from = points.find((point) => point.id === segment.startPointId);
    const destination = points.find((point) => point.id === segment.destinationPointId);
    if (!from || !destination) return;
    const centerX = (from.scenePosition[0] + destination.scenePosition[0]) / 2;
    this.targetPosition.set(centerX * 0.24, 2.15, 7.6);
    this.targetLookAt.set(centerX, 0.05, 0);
  }

  setScrollProgress(progress: number) {
    this.scrollProgress = THREE.MathUtils.clamp(progress, 0, 1);
    if (this.reducedMotion) return;
    const p = this.scrollProgress;
    const sweep = Math.sin(p * Math.PI) * 1.4;
    this.targetPosition.x = sweep;
    this.targetPosition.y = THREE.MathUtils.lerp(4.8, 1.45, p);
    this.targetPosition.z = THREE.MathUtils.lerp(12.5, 6.4, p);
    this.targetLookAt.y = THREE.MathUtils.lerp(-0.3, 0.15, p);
    this.targetLookAt.z = THREE.MathUtils.lerp(0, -1.2, p);
  }

  tick() {
    const positionAlpha = this.reducedMotion ? 1 : 0.035;
    const lookAlpha = this.reducedMotion ? 1 : 0.045;
    this.camera.position.lerp(this.targetPosition, positionAlpha);
    this.currentLookAt.lerp(this.targetLookAt, lookAlpha);
    this.camera.lookAt(this.currentLookAt);
  }
}
