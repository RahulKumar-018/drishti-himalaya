import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface CameraParallaxProps {
  intensity?: number;
}

/**
 * CameraParallax
 * Subtly shifts the camera's position or a parent group's rotation
 * based on mouse movement, simulating cinematic depth and parallax.
 */
export const CameraParallax: React.FC<CameraParallaxProps> = React.memo(({ intensity = 1.0 }) => {
  // Use a ref to store a continuous target offset
  const targetOffset = useRef(new THREE.Vector2(0, 0));
  const currentOffset = useRef(new THREE.Vector2(0, 0));

  useFrame((state) => {
    // state.pointer contains normalized device coordinates (-1 to +1)
    const { x, y } = state.pointer;

    // We only want a very subtle shift, e.g., max 15-20 units
    const maxShiftX = 20 * intensity;
    const maxShiftY = 15 * intensity;

    targetOffset.current.set(x * maxShiftX, y * maxShiftY);

    // Smoothly interpolate current offset towards target (damping)
    currentOffset.current.lerp(targetOffset.current, 0.05);

    // Instead of altering camera.position directly (which conflicts with OrbitControls),
    // we apply a slight view offset or directly modify camera position after controls update,
    // but the easiest non-conflicting way with OrbitControls is modifying the camera's view offset 
    // or adding an offset to the camera position each frame if controls allow it.
    
    // A safer way that usually plays well with OrbitControls:
    // Offset the camera position slightly. Since OrbitControls updates the camera in its own useFrame,
    // we need to be careful. Alternatively, we can just apply a small rotation to the scene itself,
    // but moving the camera is better for parallax.
    
    // We can offset the camera position on the local X and Y axes
    // First, save the true camera position
    const cam = state.camera;
    
    // We apply this offset as a subtle "shake" or parallax, but since OrbitControls overwrites position,
    // this might get overwritten. However, OrbitControls operates based on spherical coordinates around a target.
    // Let's add the offset *after* OrbitControls if possible, or just rely on the subtle position shift.
    
    // Actually, setting `camera.setViewOffset` is a great way to do 2D parallax without moving the 3D camera position.
    // It shifts the frustum.
    // signature: setViewOffset(fullWidth, fullHeight, x, y, width, height)
    // To shift view, we can just use the film offset.
    
    // Even simpler: just rotate the camera slightly. OrbitControls overrides rotation too.
    
    // The most robust way with OrbitControls:
    // We don't use this component to move the camera, we let SceneControls handle it, OR
    // we update the camera's `position` and rely on OrbitControls to handle it (it might snap back).
    // Let's use `setViewOffset`.
    if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const pCam = cam as THREE.PerspectiveCamera;
      const width = state.size.width;
      const height = state.size.height;
      // We shift the viewport window
      pCam.setViewOffset(
        width, height,
        currentOffset.current.x, -currentOffset.current.y, // negative y because setViewOffset y is down
        width, height
      );
    }
  });

  return null;
});
