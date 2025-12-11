import type { Point, Polygon, BoundingBox } from '../types';
import { getPolygonBoundingBox, doBoundingBoxesOverlap } from './geometryUtils';

/**
 * SAT (Separating Axis Theorem) 기반 폴리곤 충돌 감지
 * 두 볼록 폴리곤 간의 충돌을 감지
 */
export function doPolygonsCollide(polygonA: Polygon, polygonB: Polygon, margin: number = 0): boolean {
  // 빠른 사전 검사: 바운딩 박스 충돌 확인 (margin 포함해서 넉넉하게)
  const bboxA = getPolygonBoundingBox(polygonA);
  const bboxB = getPolygonBoundingBox(polygonB);

  if (!doBoundingBoxesOverlap(bboxA, bboxB, margin)) {
    return false; // 바운딩 박스가 겹치지 않으면 확실히 충돌 없음
  }

  // margin이 있는 경우: 두 폴리곤 사이의 최소 거리가 margin보다 작은지 확인
  if (margin > 0) {
    const minDist = getMinPolygonDistance(polygonA, polygonB);
    return minDist < margin;
  }

  // margin이 0인 경우: SAT 검사로 실제 겹침 확인
  return satCollisionCheck(polygonA, polygonB);
}

/**
 * 두 폴리곤 사이의 최소 거리 계산
 */
function getMinPolygonDistance(polygonA: Polygon, polygonB: Polygon): number {
  // 먼저 실제 겹침 여부 확인 (SAT)
  if (satCollisionCheck(polygonA, polygonB)) {
    return 0; // 겹치면 거리 0
  }

  let minDist = Infinity;

  // A의 각 점에서 B의 각 엣지까지 거리
  for (const pointA of polygonA) {
    for (let i = 0; i < polygonB.length; i++) {
      const p1 = polygonB[i];
      const p2 = polygonB[(i + 1) % polygonB.length];
      const dist = pointToSegmentDist(pointA, p1, p2);
      minDist = Math.min(minDist, dist);
    }
  }

  // B의 각 점에서 A의 각 엣지까지 거리
  for (const pointB of polygonB) {
    for (let i = 0; i < polygonA.length; i++) {
      const p1 = polygonA[i];
      const p2 = polygonA[(i + 1) % polygonA.length];
      const dist = pointToSegmentDist(pointB, p1, p2);
      minDist = Math.min(minDist, dist);
    }
  }

  return minDist;
}

/**
 * 점과 선분 사이 거리
 */
function pointToSegmentDist(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * dx;
  const projY = a.y + t * dy;

  return Math.hypot(point.x - projX, point.y - projY);
}

/**
 * 오목 폴리곤도 지원하는 충돌 검사
 * 1. 선분 교차 검사
 * 2. 점 포함 검사 (한 폴리곤이 다른 폴리곤 안에 완전히 들어가는 경우)
 */
function satCollisionCheck(polygonA: Polygon, polygonB: Polygon): boolean {
  // 1. 엣지 교차 검사 - 두 폴리곤의 변이 교차하면 충돌
  for (let i = 0; i < polygonA.length; i++) {
    const a1 = polygonA[i];
    const a2 = polygonA[(i + 1) % polygonA.length];

    for (let j = 0; j < polygonB.length; j++) {
      const b1 = polygonB[j];
      const b2 = polygonB[(j + 1) % polygonB.length];

      if (doSegmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }

  // 2. 점 포함 검사 - 한 폴리곤이 다른 폴리곤 안에 완전히 들어가는 경우
  if (isPointInPolygon(polygonA[0], polygonB) || isPointInPolygon(polygonB[0], polygonA)) {
    return true;
  }

  return false;
}

/**
 * 두 선분이 교차하는지 확인
 */
function doSegmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = direction(b1, b2, a1);
  const d2 = direction(b1, b2, a2);
  const d3 = direction(a1, a2, b1);
  const d4 = direction(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  // 공선(colinear) 케이스
  if (d1 === 0 && onSegment(b1, b2, a1)) return true;
  if (d2 === 0 && onSegment(b1, b2, a2)) return true;
  if (d3 === 0 && onSegment(a1, a2, b1)) return true;
  if (d4 === 0 && onSegment(a1, a2, b2)) return true;

  return false;
}

/**
 * 방향 계산 (외적)
 */
function direction(a: Point, b: Point, c: Point): number {
  return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
}

/**
 * 점 c가 선분 ab 위에 있는지 확인 (공선일 때)
 */
function onSegment(a: Point, b: Point, c: Point): boolean {
  return Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) &&
         Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);
}

/**
 * 점이 폴리곤 내부에 있는지 확인 (Ray casting)
 */
function isPointInPolygon(point: Point, polygon: Polygon): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    if ((yi > point.y) !== (yj > point.y) &&
        point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * 폴리곤의 모든 법선 벡터(축) 계산
 */
function getAxes(polygon: Polygon): Point[] {
  const axes: Point[] = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    // 엣지 벡터
    const edge = { x: p2.x - p1.x, y: p2.y - p1.y };

    // 법선 벡터 (90도 회전)
    const normal = { x: -edge.y, y: edge.x };

    // 정규화
    const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
    if (length > 0) {
      axes.push({ x: normal.x / length, y: normal.y / length });
    }
  }

  return axes;
}

/**
 * 폴리곤을 축에 투영
 */
function projectPolygon(polygon: Polygon, axis: Point): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;

  for (const point of polygon) {
    const projection = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  }

  return { min, max };
}

/**
 * 두 투영이 겹치는지 확인
 */
function doProjectionsOverlap(a: { min: number; max: number }, b: { min: number; max: number }): boolean {
  return !(a.max < b.min || b.max < a.min);
}

/**
 * 폴리곤이 바운딩 박스(종이) 안에 완전히 들어가는지 확인
 */
export function isPolygonInsideBounds(polygon: Polygon, bounds: BoundingBox, margin: number = 0): boolean {
  for (const point of polygon) {
    if (
      point.x < bounds.x + margin ||
      point.x > bounds.x + bounds.width - margin ||
      point.y < bounds.y + margin ||
      point.y > bounds.y + bounds.height - margin
    ) {
      return false;
    }
  }
  return true;
}

/**
 * 폴리곤과 바운딩 박스 경계 사이의 최소 거리 계산
 */
export function getMinDistanceToBounds(polygon: Polygon, bounds: BoundingBox): number {
  let minDist = Infinity;

  for (const point of polygon) {
    const distLeft = point.x - bounds.x;
    const distRight = bounds.x + bounds.width - point.x;
    const distTop = point.y - bounds.y;
    const distBottom = bounds.y + bounds.height - point.y;

    minDist = Math.min(minDist, distLeft, distRight, distTop, distBottom);
  }

  return minDist;
}

/**
 * 여러 폴리곤 간의 충돌 검사
 * placements: [{ polygon, x, y, rotation }]
 */
export function checkMultipleCollisions(
  polygons: Array<{ polygon: Polygon; x: number; y: number }>,
  margin: number = 0
): boolean {
  for (let i = 0; i < polygons.length; i++) {
    for (let j = i + 1; j < polygons.length; j++) {
      const polyA = translatePolygonLocal(polygons[i].polygon, polygons[i].x, polygons[i].y);
      const polyB = translatePolygonLocal(polygons[j].polygon, polygons[j].x, polygons[j].y);

      if (doPolygonsCollide(polyA, polyB, margin)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 폴리곤 이동 (로컬 헬퍼)
 */
function translatePolygonLocal(polygon: Polygon, dx: number, dy: number): Polygon {
  return polygon.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

/**
 * 폴리곤이 볼록(convex)인지 확인
 */
export function isConvexPolygon(polygon: Polygon): boolean {
  if (polygon.length < 3) return false;

  let sign = 0;
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    const p3 = polygon[(i + 2) % n];

    const cross = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);

    if (cross !== 0) {
      if (sign === 0) {
        sign = cross > 0 ? 1 : -1;
      } else if ((cross > 0 ? 1 : -1) !== sign) {
        return false;
      }
    }
  }

  return true;
}

/**
 * 오목 폴리곤을 볼록 폴리곤들로 분해 (간단한 구현)
 * 실제로는 더 정교한 알고리즘(Ear clipping 등) 필요
 * 여기서는 바운딩 박스 기반 간단 처리
 */
export function decomposePolygon(polygon: Polygon): Polygon[] {
  // 이미 볼록이면 그대로 반환
  if (isConvexPolygon(polygon)) {
    return [polygon];
  }

  // 간단한 처리: 원본 폴리곤 그대로 반환 (SAT는 오목에도 어느 정도 작동)
  // 정확한 처리가 필요하면 더 복잡한 알고리즘 구현 필요
  return [polygon];
}
