/**
 * Clipper2 기반 폴리곤 충돌 검사 모듈
 * 오목 폴리곤 및 정밀한 교집합 계산 지원
 */

import {
  initClipper,
  doPolygonsCollideSync,
  isClipperReady,
  isPolygonInsideBounds as clipperIsPolygonInsideBounds,
  getMinDistanceToBounds as clipperGetMinDistanceToBounds,
  checkMultipleCollisionsSync,
} from './clipperCollision';
import type { Polygon, BoundingBox } from '../types';
import { getPolygonBoundingBox, doBoundingBoxesOverlap } from './geometryUtils';

// Clipper 자동 초기화
initClipper().then(() => {
  console.log('Clipper2 initialized successfully');
}).catch((err) => {
  console.error('Failed to initialize Clipper2:', err);
});

/**
 * 폴리곤 충돌 검사 (Clipper2 기반)
 * Clipper가 초기화되지 않은 경우 폴백으로 SAT 사용
 */
export function doPolygonsCollide(polygonA: Polygon, polygonB: Polygon, margin: number = 0): boolean {
  // Clipper가 준비되면 Clipper 사용
  if (isClipperReady()) {
    return doPolygonsCollideSync(polygonA, polygonB, margin);
  }

  // 폴백: 기존 SAT 기반 검사
  return satFallbackCollisionCheck(polygonA, polygonB, margin);
}

/**
 * SAT 기반 폴백 충돌 검사 (Clipper 초기화 전 사용)
 */
function satFallbackCollisionCheck(polygonA: Polygon, polygonB: Polygon, margin: number): boolean {
  const bboxA = getPolygonBoundingBox(polygonA);
  const bboxB = getPolygonBoundingBox(polygonB);

  if (!doBoundingBoxesOverlap(bboxA, bboxB, margin)) {
    return false;
  }

  if (margin > 0) {
    const minDist = getMinPolygonDistanceFallback(polygonA, polygonB);
    return minDist < margin;
  }

  return satCollisionCheckInternal(polygonA, polygonB);
}

/**
 * 두 폴리곤 사이 최소 거리 (폴백)
 */
function getMinPolygonDistanceFallback(polygonA: Polygon, polygonB: Polygon): number {
  if (satCollisionCheckInternal(polygonA, polygonB)) {
    return 0;
  }

  let minDist = Infinity;

  for (const pointA of polygonA) {
    for (let i = 0; i < polygonB.length; i++) {
      const p1 = polygonB[i];
      const p2 = polygonB[(i + 1) % polygonB.length];
      const dist = pointToSegmentDist(pointA, p1, p2);
      minDist = Math.min(minDist, dist);
    }
  }

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

function pointToSegmentDist(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
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

function satCollisionCheckInternal(polygonA: Polygon, polygonB: Polygon): boolean {
  // 선분 교차 검사
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

  // 점 포함 검사
  if (isPointInPolygon(polygonA[0], polygonB) || isPointInPolygon(polygonB[0], polygonA)) {
    return true;
  }

  return false;
}

function doSegmentsIntersect(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number }
): boolean {
  const d1 = direction(b1, b2, a1);
  const d2 = direction(b1, b2, a2);
  const d3 = direction(a1, a2, b1);
  const d4 = direction(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (d1 === 0 && onSegment(b1, b2, a1)) return true;
  if (d2 === 0 && onSegment(b1, b2, a2)) return true;
  if (d3 === 0 && onSegment(a1, a2, b1)) return true;
  if (d4 === 0 && onSegment(a1, a2, b2)) return true;

  return false;
}

function direction(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
}

function onSegment(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): boolean {
  return Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) &&
         Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);
}

function isPointInPolygon(point: { x: number; y: number }, polygon: Polygon): boolean {
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
 * 폴리곤이 바운딩 박스 안에 있는지 확인
 */
export function isPolygonInsideBounds(polygon: Polygon, bounds: BoundingBox, margin: number = 0): boolean {
  return clipperIsPolygonInsideBounds(polygon, bounds, margin);
}

/**
 * 폴리곤과 바운딩 박스 경계 사이의 최소 거리
 */
export function getMinDistanceToBounds(polygon: Polygon, bounds: BoundingBox): number {
  return clipperGetMinDistanceToBounds(polygon, bounds);
}

/**
 * 여러 폴리곤 간의 충돌 검사
 */
export function checkMultipleCollisions(
  polygons: Array<{ polygon: Polygon; x: number; y: number }>,
  margin: number = 0
): boolean {
  if (isClipperReady()) {
    return checkMultipleCollisionsSync(polygons, margin);
  }

  // 폴백
  for (let i = 0; i < polygons.length; i++) {
    for (let j = i + 1; j < polygons.length; j++) {
      const polyA = translatePolygon(polygons[i].polygon, polygons[i].x, polygons[i].y);
      const polyB = translatePolygon(polygons[j].polygon, polygons[j].x, polygons[j].y);

      if (doPolygonsCollide(polyA, polyB, margin)) {
        return true;
      }
    }
  }
  return false;
}

function translatePolygon(polygon: Polygon, dx: number, dy: number): Polygon {
  return polygon.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

/**
 * 폴리곤이 볼록인지 확인
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
 * 오목 폴리곤 분해 (Clipper에서는 불필요하지만 호환성 유지)
 */
export function decomposePolygon(polygon: Polygon): Polygon[] {
  return [polygon];
}
