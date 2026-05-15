import * as THREE from "three";

export function dampNumber(
  current: number,
  target: number,
  smoothing: number,
  delta: number,
): number {
  return THREE.MathUtils.damp(current, target, smoothing, delta);
}

export function dampVector3(
  current: THREE.Vector3,
  target: THREE.Vector3,
  smoothing: number,
  delta: number,
): void {
  current.x = dampNumber(current.x, target.x, smoothing, delta);
  current.y = dampNumber(current.y, target.y, smoothing, delta);
  current.z = dampNumber(current.z, target.z, smoothing, delta);
}
