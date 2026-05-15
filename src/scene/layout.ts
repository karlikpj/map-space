import * as THREE from "three";

export const FOCUS_POSITION = new THREE.Vector3(0, 0.4, 0);
const FOCUS_SHIFT_PER_LEVEL_X = 1.2;
const FOCUS_SHIFT_MAX_LEVELS = 3;
const CHILD_LIST_OFFSET_X = 5.85;
const CHILD_LIST_COLUMN_GAP_X = 4.15;
const CHILD_LIST_BASE_GAP_Y = 1.92;
const CHILD_LIST_MIN_GAP_Y = 1.2;
const CHILD_LIST_DEPTH_STEP_Z = 0.2;
const CHILD_LIST_MAX_SPREAD_Y = 7.2;
const CHILD_LIST_MAX_ITEMS_PER_COLUMN = 7;

export function getFocusPosition(depth: number): THREE.Vector3 {
  const shiftLevels = Math.min(depth, FOCUS_SHIFT_MAX_LEVELS);
  return new THREE.Vector3(
    FOCUS_POSITION.x - shiftLevels * FOCUS_SHIFT_PER_LEVEL_X,
    FOCUS_POSITION.y,
    FOCUS_POSITION.z,
  );
}

export function getAncestorPositions(
  count: number,
  focusPosition: THREE.Vector3,
): THREE.Vector3[] {
  return Array.from({ length: count }, (_, index) => {
    const step = count <= 1 ? 0 : index / (count - 1);
    return new THREE.Vector3(
      focusPosition.x - 4.8 + step * 3.3,
      focusPosition.y + 2.35 - step * 0.45,
      focusPosition.z - 1.2 + step * 0.35,
    );
  });
}

export function getChildPositions(
  count: number,
  focusPosition: THREE.Vector3,
): THREE.Vector3[] {
  if (count === 0) {
    return [];
  }

  const rowsPerColumn = Math.min(count, CHILD_LIST_MAX_ITEMS_PER_COLUMN);
  const spread = Math.min(
    (rowsPerColumn - 1) * CHILD_LIST_BASE_GAP_Y,
    CHILD_LIST_MAX_SPREAD_Y,
  );
  const gap = rowsPerColumn > 1 ? Math.max(CHILD_LIST_MIN_GAP_Y, spread / (rowsPerColumn - 1)) : 0;
  const topY = spread * 0.5;
  const middleRow = (rowsPerColumn - 1) * 0.5;

  return Array.from({ length: count }, (_, index) => {
    const column = Math.floor(index / CHILD_LIST_MAX_ITEMS_PER_COLUMN);
    const row = index % CHILD_LIST_MAX_ITEMS_PER_COLUMN;
    const y = focusPosition.y + topY - row * gap;
    const z =
      focusPosition.z + (middleRow - row) * CHILD_LIST_DEPTH_STEP_Z - column * 0.18;
    const x = focusPosition.x + CHILD_LIST_OFFSET_X + column * CHILD_LIST_COLUMN_GAP_X;

    return new THREE.Vector3(x, y, z);
  });
}
