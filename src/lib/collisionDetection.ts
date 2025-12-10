import type { Point, Polygon, BoundingBox } from '../types';
import { getPolygonBoundingBox, doBoundingBoxesOverlap } from './geometryUtils';

/**
 * SAT (Separating Axis Theorem) 기반 폴리곤 충돌 감지
 * 두 볼록 폴리곤 간의 충돌을 감지
 */
export function doPolygonsCollide(polygonA: Polygon, polygonB: Polygon, margin: number = 0): boolean {
  // 빠른 사전 검사: 바운딩 박스 충돌 확인
  const bboxA = getPolygonBoundingBox(polygonA);
  const bboxB = getPolygonBoundingBox(polygonB);

  if (!doBoundingBoxesOverlap(bboxA, bboxB, margin)) {
    return false;
  }

  // margin이 있는 경우 폴리곤 확장
  const expandedA = margin > 0 ? expandPolygon(polygonA, margin / 2) : polygonA;
  const expandedB = margin > 0 ? expandPolygon(polygonB, margin / 2) : polygonB;

  // SAT 검사
  return satCollisionCheck(expandedA, expandedB);
}

/**
 * SAT 충돌 검사 핵심 로직
 */
function satCollisionCheck(polygonA: Polygon, polygonB: Polygon): boolean {
  const axesA = getAxes(polygonA);
  const axesB = getAxes(polygonB);

  // 모든 축에 대해 분리 여부 확인
  for (const axis of [...axesA, ...axesB]) {
    const projA = projectPolygon(polygonA, axis);
    const projB = projectPolygon(polygonB, axis);

    // 투영이 겹치지 않으면 분리됨 (충돌 없음)
    if (!doProjectionsOverlap(projA, projB)) {
      return false;
    }
  }

  // 모든 축에서 겹치면 충돌
  return true;
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
 * 폴리곤을 특정 거리만큼 확장 (간단한 Minkowski sum 근사)
 */
function expandPolygon(polygon: Polygon, distance: number): Polygon {
  if (distance <= 0) return polygon;

  const center = getPolygonCenter(polygon);
  const expanded: Polygon = [];

  for (const point of polygon) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length > 0) {
      expanded.push({
        x: point.x + (dx / length) * distance,
        y: point.y + (dy / length) * distance,
      });
    } else {
      expanded.push(point);
    }
  }

  return expanded;
}

/**
 * 폴리곤 중심점 계산
 */
function getPolygonCenter(polygon: Polygon): Point {
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
