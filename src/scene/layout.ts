import * as THREE from "three";

export const FOCUS_POSITION = new THREE.Vector3(0, 0.4, 0);

export function getAncestorPositions(count: number): THREE.Vector3[] {
  return Array.from({ length: count }, (_, index) => {
    const step = count <= 1 ? 0 : index / (count - 1);
    return new THREE.Vector3(
      -4.8 + step * 3.3,
      2.75 - step * 0.45,
      -1.2 + step * 0.35,
    );
  });
}

export function getChildPositions(count: number): THREE.Vector3[] {
  if (count === 0) {
    return [];
  }

  if (count === 1) {
    return [new THREE.Vector3(0, -3.1, -0.2)];
  }

  const radius = Math.min(7.4, 4 + count * 0.33);
  const start = Math.PI * 1.15;
  const end = Math.PI * 1.85;
  const step = (end - start) / (count - 1);

  return Array.from({ length: count }, (_, index) => {
    const angle = start + step * index;
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius * 0.58 - 0.45,
      -Math.abs(Math.sin(angle)) * 1.4,
    );
  });
}
