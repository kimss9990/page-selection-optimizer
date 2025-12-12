import * as clipperLib from 'js-angusj-clipper';
import type { Polygon, BoundingBox } from '../types';
import { getPolygonBoundingBox, doBoundingBoxesOverlap } from './geometryUtils';

// Clipper는 정수 좌표만 지원하므로 스케일 팩터 사용
// mm 단위를 1000배 확대하여 마이크로미터 수준 정밀도 확보
const SCALE_FACTOR = 1000;

// Clipper 인스턴스 (싱글톤)
let clipperInstance: clipperLib.ClipperLibWrapper | null = null;
let clipperInitPromise: Promise<clipperLib.ClipperLibWrapper> | null = null;

/**
 * Clipper 라이브러리 초기화 (싱글톤)
 */
export async function initClipper(): Promise<clipperLib.ClipperLibWrapper> {
  if (clipperInstance) {
    return clipperInstance;
  }

  if (clipperInitPromise) {
    return clipperInitPromise;
  }

  clipperInitPromise = clipperLib.loadNativeClipperLibInstanceAsync(
    clipperLib.NativeClipperLibRequestedFormat.WasmWithAsmJsFallback
  );

  clipperInstance = await clipperInitPromise;
  return clipperInstance;
}

/**
 * 우리 Polygon 타입을 Clipper 포맷으로 변환
 */
function polygonToClipperPath(polygon: Polygon): clipperLib.Path {
  return polygon.map(p => ({
    x: Math.round(p.x * SCALE_FACTOR),
    y: Math.round(p.y * SCALE_FACTOR),
  }));
}

// Clipper 포맷을 우리 Polygon 타입으로 변환 (향후 NFP 구현시 사용)
// function clipperPathToPolygon(path: clipperLib.Path): Polygon {
//   return path.map(p => ({
//     x: p.x / SCALE_FACTOR,
//     y: p.y / SCALE_FACTOR,
//   }));
// }

/**
 * Clipper2를 사용한 폴리곤 충돌 감지
 * 두 폴리곤의 교집합이 있으면 충돌
 */
export async function doPolygonsCollideAsync(
  polygonA: Polygon,
  polygonB: Polygon,
  margin: number = 0
): Promise<boolean> {
  // 빠른 사전 검사: 바운딩 박스 충돌 확인
  const bboxA = getPolygonBoundingBox(polygonA);
  const bboxB = getPolygonBoundingBox(polygonB);

  if (!doBoundingBoxesOverlap(bboxA, bboxB, margin)) {
    return false;
  }

  const clipper = await initClipper();

  let pathA = polygonToClipperPath(polygonA);
  let pathB = polygonToClipperPath(polygonB);

  // margin이 있는 경우: 폴리곤을 margin만큼 확장
  if (margin > 0) {
    const scaledMargin = margin * SCALE_FACTOR;

    // A를 margin만큼 확장
    const offsetResultA = clipper.offsetToPaths({
      delta: scaledMargin,
      offsetInputs: [{ data: pathA, joinType: clipperLib.JoinType.Miter, endType: clipperLib.EndType.ClosedPolygon }],
    });

    // B를 margin만큼 확장
    const offsetResultB = clipper.offsetToPaths({
      delta: scaledMargin,
      offsetInputs: [{ data: pathB, joinType: clipperLib.JoinType.Miter, endType: clipperLib.EndType.ClosedPolygon }],
    });

    if (offsetResultA && offsetResultA.length > 0) {
      pathA = offsetResultA[0];
    }
    if (offsetResultB && offsetResultB.length > 0) {
      pathB = offsetResultB[0];
    }
  }

  // 교집합 계산 (ClipInput은 항상 닫힌 경로이므로 closed 속성 불필요)
  const intersectionResult = clipper.clipToPaths({
    clipType: clipperLib.ClipType.Intersection,
    subjectInputs: [{ data: pathA, closed: true }],
    clipInputs: [{ data: pathB }],
    subjectFillType: clipperLib.PolyFillType.EvenOdd,
  });

  // 교집합이 있으면 충돌
  return intersectionResult !== undefined && intersectionResult.length > 0;
}

/**
 * 동기 버전 충돌 검사 (Clipper가 이미 초기화되어 있어야 함)
 */
export function doPolygonsCollideSync(
  polygonA: Polygon,
  polygonB: Polygon,
  margin: number = 0
): boolean {
  if (!clipperInstance) {
    console.warn('Clipper not initialized, falling back to bbox check');
    const bboxA = getPolygonBoundingBox(polygonA);
    const bboxB = getPolygonBoundingBox(polygonB);
    return doBoundingBoxesOverlap(bboxA, bboxB, margin);
  }

  // 빠른 사전 검사: 바운딩 박스 충돌 확인
  const bboxA = getPolygonBoundingBox(polygonA);
  const bboxB = getPolygonBoundingBox(polygonB);

  if (!doBoundingBoxesOverlap(bboxA, bboxB, margin)) {
    return false;
  }

  let pathA = polygonToClipperPath(polygonA);
  let pathB = polygonToClipperPath(polygonB);

  // margin이 있는 경우: 폴리곤을 margin만큼 확장
  if (margin > 0) {
    const scaledMargin = margin * SCALE_FACTOR;

    const offsetResultA = clipperInstance.offsetToPaths({
      delta: scaledMargin,
      offsetInputs: [{ data: pathA, joinType: clipperLib.JoinType.Miter, endType: clipperLib.EndType.ClosedPolygon }],
    });

    const offsetResultB = clipperInstance.offsetToPaths({
      delta: scaledMargin,
      offsetInputs: [{ data: pathB, joinType: clipperLib.JoinType.Miter, endType: clipperLib.EndType.ClosedPolygon }],
    });

    if (offsetResultA && offsetResultA.length > 0) {
      pathA = offsetResultA[0];
    }
    if (offsetResultB && offsetResultB.length > 0) {
      pathB = offsetResultB[0];
    }
  }

  // 교집합 계산 (ClipInput은 항상 닫힌 경로이므로 closed 속성 불필요)
  const intersectionResult = clipperInstance.clipToPaths({
    clipType: clipperLib.ClipType.Intersection,
    subjectInputs: [{ data: pathA, closed: true }],
    clipInputs: [{ data: pathB }],
    subjectFillType: clipperLib.PolyFillType.EvenOdd,
  });

  return intersectionResult !== undefined && intersectionResult.length > 0;
}

/**
 * 폴리곤이 바운딩 박스 안에 완전히 들어가는지 확인
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
 * 여러 폴리곤 간의 충돌 검사 (동기 버전)
 */
export function checkMultipleCollisionsSync(
  polygons: Array<{ polygon: Polygon; x: number; y: number }>,
  margin: number = 0
): boolean {
  for (let i = 0; i < polygons.length; i++) {
    for (let j = i + 1; j < polygons.length; j++) {
      const polyA = translatePolygon(polygons[i].polygon, polygons[i].x, polygons[i].y);
      const polyB = translatePolygon(polygons[j].polygon, polygons[j].x, polygons[j].y);

      if (doPolygonsCollideSync(polyA, polyB, margin)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 폴리곤 이동
 */
function translatePolygon(polygon: Polygon, dx: number, dy: number): Polygon {
  return polygon.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

/**
 * Clipper 초기화 상태 확인
 */
export function isClipperReady(): boolean {
  return clipperInstance !== null;
}
