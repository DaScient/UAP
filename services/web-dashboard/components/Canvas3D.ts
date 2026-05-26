import type * as THREE from 'three';

export type SkyVector = {
  azimuthDeg: number;
  elevationDeg: number;
  fovDeg: number;
};

export type OcclusionGeometry = {
  id: string;
  min: [number, number, number];
  max: [number, number, number];
};

export type WitnessOrientation = {
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  headingDeg: number;
  pitchDeg?: number;
  rollDeg?: number;
};

export type SightingPayload = {
  position: WitnessOrientation;
  skyVector: SkyVector;
  occlusionState: {
    blockedBy: string[];
    isOccluded: boolean;
  };
  deviceOrientation?: Record<string, number>;
};

export async function loadSpatialStack() {
  const [three, fiber, maplibre] = await Promise.all([
    import('three'),
    import('@react-three/fiber'),
    import('maplibre-gl'),
  ]);

  return { three, fiber, maplibre };
}

export function viewportToSkyVector(
  viewportX: number,
  viewportY: number,
  width: number,
  height: number,
  trueNorthHeadingDeg: number,
  fovDeg = 75,
): SkyVector {
  const centeredX = (viewportX / width) * 2 - 1;
  const centeredY = 1 - (viewportY / height) * 2;
  const azimuthDeg = normalizeHeading(trueNorthHeadingDeg + centeredX * (fovDeg / 2));
  const elevationDeg = Math.max(-90, Math.min(90, centeredY * (fovDeg / 2)));
  return { azimuthDeg, elevationDeg, fovDeg };
}

export function skyVectorToEnu(vector: SkyVector) {
  const azimuthRad = degreesToRadians(vector.azimuthDeg);
  const elevationRad = degreesToRadians(vector.elevationDeg);
  return {
    east: Math.sin(azimuthRad) * Math.cos(elevationRad),
    north: Math.cos(azimuthRad) * Math.cos(elevationRad),
    up: Math.sin(elevationRad),
  };
}

export function evaluateOcclusion(
  origin: [number, number, number],
  direction: [number, number, number],
  geometries: OcclusionGeometry[],
): { blockedBy: string[]; isOccluded: boolean } {
  const blockedBy = geometries
    .filter((geometry) => rayIntersectsAabb(origin, direction, geometry))
    .map((geometry) => geometry.id);
  return { blockedBy, isOccluded: blockedBy.length > 0 };
}

export function initialiseStreetAlignment(position: WitnessOrientation) {
  return {
    mapCenter: [position.longitude, position.latitude] as [number, number],
    elevationRequestUrl: `https://api.open-elevation.com/api/v1/lookup?locations=${position.latitude},${position.longitude}`,
    headingDeg: normalizeHeading(position.headingDeg),
    skyDomeRadiusMeters: 500,
  };
}

export function serialiseSightingPayload(
  position: WitnessOrientation,
  skyVector: SkyVector,
  occlusionState: { blockedBy: string[]; isOccluded: boolean },
  deviceOrientation?: Record<string, number>,
): string {
  const payload: SightingPayload = {
    position,
    skyVector,
    occlusionState,
    deviceOrientation,
  };
  return JSON.stringify(payload);
}

export function createVectorArrow(three: typeof import('three'), vector: SkyVector): THREE.Vector3 {
  const enu = skyVectorToEnu(vector);
  return new three.Vector3(enu.east, enu.up, enu.north).normalize();
}

function rayIntersectsAabb(
  origin: [number, number, number],
  direction: [number, number, number],
  geometry: OcclusionGeometry,
): boolean {
  let tMin = -Infinity;
  let tMax = Infinity;

  for (let axis = 0; axis < 3; axis += 1) {
    const dir = direction[axis];
    const start = origin[axis];
    const min = geometry.min[axis];
    const max = geometry.max[axis];

    if (Math.abs(dir) < 1e-8) {
      if (start < min || start > max) {
        return false;
      }
      continue;
    }

    const t1 = (min - start) / dir;
    const t2 = (max - start) / dir;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }

  return tMax >= Math.max(0, tMin);
}

function normalizeHeading(headingDeg: number): number {
  return ((headingDeg % 360) + 360) % 360;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}
