import type { Point, Polygon, BoundingBox } from '../types';

/**
 * No-Fit Polygon (NFP) 알고리즘
 * 두 폴리곤이 겹치지 않는 상대 위치를 계산
 */

/**
 * NFP 계산: 폴리곤 A 주위에 폴리곤 B가 겹치지 않게 배치될 수 있는 모든 위치
 * B의 기준점(첫 번째 점)이 NFP 경계 바깥에 있으면 겹치지 않음
 *
 * 간소화된 버전: 바운딩 박스 기반 NFP (모든 폴리곤에 대해 정확함)
 */
export function computeNFP(polygonA: Polygon, polygonB: Polygon): Polygon {
  if (polygonA.length < 3 || polygonB.length < 3) {
    return [];
  }

  // 바운딩 박스 기반 NFP (더 정확함)
  const bboxA = getPolygonBBox(polygonA);
  const bboxB = getPolygonBBox(polygonB);

  // B의 기준점(첫 점)과 바운딩 박스의 관계
  const refB = polygonB[0];
  const offsetLeft = refB.x - bboxB.minX;
  const offsetRight = bboxB.maxX - refB.x;
  const offsetTop = refB.y - bboxB.minY;
  const offsetBottom = bboxB.maxY - refB.y;

  // NFP: A의 바운딩 박스를 B의 크기만큼 확장
  // B의 기준점이 이 영역 안에 있으면 충돌
  const nfp: Polygon = [
    { x: bboxA.minX - offsetRight, y: bboxA.minY - offsetBottom },
    { x: bboxA.maxX + offsetLeft, y: bboxA.minY - offsetBottom },
    { x: bboxA.maxX + offsetLeft, y: bboxA.maxY + offsetTop },
    { x: bboxA.minX - offsetRight, y: bboxA.maxY + offsetTop },
  ];

  return nfp;
}

/**
 * Inner-Fit Polygon (IFP) 계산: 컨테이너(종이) 내부에 폴리곤이 들어갈 수 있는 위치
 * 폴리곤의 기준점이 IFP 내부에 있으면 폴리곤이 컨테이너 안에 완전히 들어감
 */
export function computeIFP(container: BoundingBox, polygon: Polygon): Polygon {
  if (polygon.length < 3) {
    return [];
  }

  // 폴리곤의 바운딩 박스 계산
  const polyBBox = getPolygonBBox(polygon);

  // 폴리곤 기준점(첫 번째 점) 기준 오프셋
  const refPoint = polygon[0];
  const offsetLeft = refPoint.x - polyBBox.minX;
  const offsetRight = polyBBox.maxX - refPoint.x;
  const offsetTop = refPoint.y - polyBBox.minY;
  const offsetBottom = polyBBox.maxY - refPoint.y;

  // IFP는 축소된 사각형
  const ifp: Polygon = [
    { x: container.x + offsetLeft, y: container.y + offsetTop },
    { x: container.x + container.width - offsetRight, y: container.y + offsetTop },
    { x: container.x + container.width - offsetRight, y: container.y + container.height - offsetBottom },
    { x: container.x + offsetLeft, y: container.y + container.height - offsetBottom },
  ];

  return ifp;
}

/**
 * 폴리곤 바운딩 박스
 */
function getPolygonBBox(polygon: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polygon) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
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
 * 점이 폴리곤 경계 또는 내부에 있는지 확인
 */
export function isPointInOrOnPolygon(point: Point, polygon: Polygon, tolerance: number = 0.1): boolean {
  // 내부 확인
  if (isPointInPolygon(point, polygon)) return true;

  // 경계 확인
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    if (pointToSegmentDistance(point, p1, p2) < tolerance) {
      return true;
    }
  }

  return false;
}

/**
 * 점과 선분 사이 거리
 */
function pointToSegmentDistance(point: Point, a: Point, b: Point): number {
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
 * NFP 기반 유효한 배치 위치 찾기
 * @param ifp Inner-Fit Polygon (종이 내부 유효 영역)
 * @param nfps 이미 배치된 폴리곤들의 NFP 배열
 * @param gridStep 탐색 그리드 간격
 * @returns 유효한 배치 위치들
 */
export function findValidPositions(
  ifp: Polygon,
  nfps: Polygon[],
  gridStep: number = 5
): Point[] {
  const validPositions: Point[] = [];
  const ifpBBox = getPolygonBBox(ifp);

  // IFP 영역 내에서 그리드 탐색
  for (let y = ifpBBox.minY; y <= ifpBBox.maxY; y += gridStep) {
    for (let x = ifpBBox.minX; x <= ifpBBox.maxX; x += gridStep) {
      const point = { x, y };

      // IFP 내부인지 확인
      if (!isPointInOrOnPolygon(point, ifp)) continue;

      // 모든 NFP 외부인지 확인
      let valid = true;
      for (const nfp of nfps) {
        if (nfp.length > 0 && isPointInPolygon(point, nfp)) {
          valid = false;
          break;
        }
      }

      if (valid) {
        validPositions.push(point);
      }
    }
  }

  return validPositions;
}

/**
 * Bottom-Left 전략으로 최적 위치 선택
 */
export function selectBottomLeftPosition(positions: Point[]): Point | null {
  if (positions.length === 0) return null;

  // y가 가장 작고 (아래), 그 중 x가 가장 작은 (왼쪽) 위치
  return positions.reduce((best, pos) => {
    if (pos.y < best.y || (pos.y === best.y && pos.x < best.x)) {
      return pos;
    }
    return best;
  });
}

/**
 * 폴리곤 이동
 */
export function translatePolygon(polygon: Polygon, dx: number, dy: number): Polygon {
  return polygon.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

/**
 * 폴리곤 회전 (중심 기준)
 */
export function rotatePolygon(polygon: Polygon, angleDegrees: number): Polygon {
  if (polygon.length === 0) return [];

  const center = polygon.reduce(
    (acc, p) => ({ x: acc.x + p.x / polygon.length, y: acc.y + p.y / polygon.length }),
    { x: 0, y: 0 }
  );

  const angleRadians = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);

  return polygon.map(p => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  });
}

/**
 * 폴리곤을 원점 기준으로 정규화 (첫 점이 원점)
 */
export function normalizePolygonToOrigin(polygon: Polygon): Polygon {
  if (polygon.length === 0) return [];
  const ref = polygon[0];
  return polygon.map(p => ({ x: p.x - ref.x, y: p.y - ref.y }));
}
