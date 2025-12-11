import type { Point, Polygon, BoundingBox } from '../types';

/**
 * 두 점 사이의 거리 계산
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 점을 원점 기준으로 회전
 */
export function rotatePoint(point: Point, angleDegrees: number, center: Point = { x: 0, y: 0 }): Point {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);

  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/**
 * 폴리곤 회전
 */
export function rotatePolygon(polygon: Polygon, angleDegrees: number, center?: Point): Polygon {
  const actualCenter = center ?? getPolygonCenter(polygon);
  return polygon.map(p => rotatePoint(p, angleDegrees, actualCenter));
}

/**
 * 폴리곤 이동
 */
export function translatePolygon(polygon: Polygon, dx: number, dy: number): Polygon {
  return polygon.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

/**
 * 폴리곤의 중심점 계산
 */
export function getPolygonCenter(polygon: Polygon): Point {
  if (polygon.length === 0) return { x: 0, y: 0 };

  const sum = polygon.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / polygon.length,
    y: sum.y / polygon.length,
  };
}

/**
 * 폴리곤의 바운딩 박스 계산
 */
export function getPolygonBoundingBox(polygon: Polygon): BoundingBox {
  if (polygon.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of polygon) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * 여러 폴리곤의 통합 바운딩 박스 계산
 */
export function getPolygonsBoundingBox(polygons: Polygon[]): BoundingBox {
  if (polygons.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const polygon of polygons) {
    for (const p of polygon) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * 폴리곤 면적 계산 (Shoelace formula)
 */
export function getPolygonArea(polygon: Polygon): number {
  if (polygon.length < 3) return 0;

  let area = 0;
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }

  return Math.abs(area) / 2;
}

/**
 * 점이 폴리곤 내부에 있는지 확인 (Ray casting)
 */
export function isPointInPolygon(point: Point, polygon: Polygon): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * 두 바운딩 박스가 겹치는지 확인
 */
export function doBoundingBoxesOverlap(a: BoundingBox, b: BoundingBox, margin: number = 0): boolean {
  return !(
    a.x + a.width + margin <= b.x ||
    b.x + b.width + margin <= a.x ||
    a.y + a.height + margin <= b.y ||
    b.y + b.height + margin <= a.y
  );
}

/**
 * 바운딩 박스가 다른 바운딩 박스 안에 완전히 포함되는지 확인
 */
export function isBoundingBoxInside(inner: BoundingBox, outer: BoundingBox, margin: number = 0): boolean {
  return (
    inner.x >= outer.x + margin &&
    inner.y >= outer.y + margin &&
    inner.x + inner.width <= outer.x + outer.width - margin &&
    inner.y + inner.height <= outer.y + outer.height - margin
  );
}

/**
 * 폴리곤을 정규화 (바운딩 박스 원점 기준으로 이동)
 */
export function normalizePolygon(polygon: Polygon): Polygon {
  const bbox = getPolygonBoundingBox(polygon);
  return translatePolygon(polygon, -bbox.x, -bbox.y);
}

/**
 * 폴리곤을 원점 기준으로 정규화 (첫 점이 원점)
 */
export function normalizePolygonToOrigin(polygon: Polygon): Polygon {
  if (polygon.length === 0) return [];
  const ref = polygon[0];
  return polygon.map(p => ({ x: p.x - ref.x, y: p.y - ref.y }));
}

/**
 * 폴리곤과 점 사이의 최소 거리 계산
 */
export function pointToPolygonDistance(point: Point, polygon: Polygon): number {
  let minDist = Infinity;
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dist = pointToSegmentDistance(point, polygon[i], polygon[j]);
    minDist = Math.min(minDist, dist);
  }

  return minDist;
}

/**
 * 점과 선분 사이의 거리 계산
 */
export function pointToSegmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return distance(point, a);
  }

  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  const projection = {
    x: a.x + t * dx,
    y: a.y + t * dy,
  };

  return distance(point, projection);
}
