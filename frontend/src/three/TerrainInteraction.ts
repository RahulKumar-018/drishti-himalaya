import * as THREE from "three";
import type { RouteSegment } from "../types/route";

/** Keeps selection events shared between React overlays and the terrain renderer. */
export interface TerrainInteractionHandlers {
  onHoverSegment: (segmentId: string | null) => void;
  onSelectSegment: (segment: RouteSegment) => void;
}

export class TerrainInteraction {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly onMove = (event: MouseEvent) => this.pick(event, false);
  private readonly onClick = (event: MouseEvent) => this.pick(event, true);

  constructor(
    private readonly element: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    private readonly objects: THREE.Object3D[],
    private readonly segments: RouteSegment[],
    private readonly handlers: TerrainInteractionHandlers,
  ) {
    this.raycaster.params.Line.threshold = 0.22;
    this.element.addEventListener("pointermove", this.onMove);
    this.element.addEventListener("click", this.onClick);
  }

  private pick(event: MouseEvent, select: boolean) {
    const rect = this.element.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.objects, false)[0];
    const segmentId = typeof hit?.object.userData.segmentId === "string" ? hit.object.userData.segmentId : null;
    this.handlers.onHoverSegment(segmentId);
    if (select && segmentId) {
      const segment = this.segments.find((item) => item.id === segmentId);
      if (segment) this.handlers.onSelectSegment(segment);
    }
  }

  dispose() {
    this.element.removeEventListener("pointermove", this.onMove);
    this.element.removeEventListener("click", this.onClick);
  }
}
