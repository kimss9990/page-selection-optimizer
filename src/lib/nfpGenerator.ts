/**
 * NFP Generator - Clipper2 Minkowski Sum 기반
 *
 * SVGnest의 복잡한 Orbiting 알고리즘 대신
 * Clipper2의 안정적인 Minkowski Sum 사용
 */

import * as clipperLib from 'js-angusj-clipper';
import type { Polygon } from '../types';

// Clipper 스케일 팩터 (정수 좌표 변환용)
const SCALE = 1000;

// Clipper 인스턴스 (싱글톤)
let clipper: clipperLib.ClipperLibWrapper | null = null;

/**
 * Clipper 초기화
 */
export async function initNFPGenerator(): Promise<void> {
  if (!clipper) {
    clipper = await clipperLib.loadNativeClipperLibInstanceAsync(
      clipperLib.NativeClipperLibRequestedFormat.WasmWithAsmJsFallback
    );
    console.log('NFP Generator initialized with Clipper2');
  }
}

/**
 * Clipper 준비 상태 확인
 */
export function isNFPGeneratorReady(): boolean {
  return clipper !== null;
}

/**
 * 우리 Polygon → Clipper Path 변환
 */
function toClipperPath(polygon: Polygon): clipperLib.Path {
  return polygon.map(p => ({
    x: Math.round(p.x * SCALE),
    y: Math.round(p.y * SCALE),
  }));
}

/**
 * Clipper Path → 우리 Polygon 변환
 */
function fromClipperPath(path: clipperLib.Path): Polygon {
  return path.map(p => ({
    x: p.x / SCALE,
    y: p.y / SCALE,
  }));
}

/**
 * 폴리곤을 원점 대칭 (180도 회전)
 * NFP 계산에 필요: NFP(A, B) = MinkowskiSum(A, -B)
 */
function negatePolygon(polygon: Polygon): Polygon {
  return polygon.map(p => ({ x: -p.x, y: -p.y }));
}

/**
 * 폴리곤을 특정 점으로 이동
 */
function translatePolygon(polygon: Polygon, dx: number, dy: number): Polygon {
  return polygon.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

// ============================================================
// NFP 캐시
// ============================================================

interface NFPCacheKey {
  shapeAId: string;
  shapeBId: string;
  rotationA: number;
  rotationB: number;
  inside: boolean;
}

const nfpCache = new Map<string, Polygon[]>();

function makeCacheKey(key: NFPCacheKey): string {
  return `${key.shapeAId}:${key.rotationA}-${key.shapeBId}:${key.rotationB}-${key.inside}`;
}

export function getCachedNFP(key: NFPCacheKey): Polygon[] | undefined {
  return nfpCache.get(makeCacheKey(key));
}

export function setCachedNFP(key: NFPCacheKey, nfp: Polygon[]): void {
  nfpCache.set(makeCacheKey(key), nfp);
}

export function clearNFPCache(): void {
  nfpCache.clear();
}

// ============================================================
// Core NFP Functions
// ============================================================

/**
 * NFP 계산 (No-Fit Polygon)
 *
 * 고정된 도형 A 주위로 도형 B가 겹치지 않고 이동할 수 있는 경계
 * 수식: NFP = MinkowskiSum(A, -B)
 *
 * @param fixedPolygon 고정된 도형 A
 * @param movingPolygon 이동할 도형 B (기준점: 첫 번째 점)
 * @returns NFP 폴리곤 배열
 */
export function computeNFP(
  fixedPolygon: Polygon,
  movingPolygon: Polygon
): Polygon[] {
  if (!clipper) {
    console.error('NFP Generator not initialized');
    return [];
  }

  if (fixedPolygon.length < 3 || movingPolygon.length < 3) {
    return [];
  }

  try {
    // 1. Moving polygon을 원점 대칭 (-B)
    // 기준점(첫 번째 점)을 원점으로 이동 후 대칭
    const movingCenter = movingPolygon[0];
    const centeredMoving = translatePolygon(movingPolygon, -movingCenter.x, -movingCenter.y);
    const negatedMoving = negatePolygon(centeredMoving);

    // 2. Clipper 경로로 변환
    const fixedPath = toClipperPath(fixedPolygon);
    const patternPath = toClipperPath(negatedMoving);

    // 3. Minkowski Sum 계산
    // pattern: 이동하는 도형 (-B)
    // path: 고정된 도형 (A)
    const nfpPaths = clipper.minkowskiSumPath(
      patternPath,  // pattern (움직이는 도형의 음수)
      fixedPath,    // path (고정 도형)
      true          // pathIsClosed
    );

    if (!nfpPaths || nfpPaths.length === 0) {
      console.warn('Minkowski Sum returned empty result');
      return [];
    }

    // 4. 결과 변환
    return nfpPaths.map(fromClipperPath);

  } catch (error) {
    console.error('NFP computation error:', error);
    return [];
  }
}

/**
 * IFP 계산 (Inner Fit Polygon)
 *
 * 컨테이너(Bin) 내부에서 도형이 배치될 수 있는 영역
 * 도형의 기준점이 이 영역 안에 있으면 도형이 컨테이너 밖으로 나가지 않음
 *
 * @param binPolygon 컨테이너 폴리곤 (보통 직사각형)
 * @param partPolygon 배치할 도형
 * @returns IFP 폴리곤
 */
export function computeIFP(
  binPolygon: Polygon,
  partPolygon: Polygon
): Polygon[] {
  if (!clipper) {
    console.error('NFP Generator not initialized');
    return [];
  }

  try {
    // Part의 기준점을 원점으로 이동
    const partRef = partPolygon[0];
    const centeredPart = translatePolygon(partPolygon, -partRef.x, -partRef.y);
    const negatedPart = negatePolygon(centeredPart);

    // Minkowski Sum: Bin + (-Part) = IFP
    const binPath = toClipperPath(binPolygon);
    const patternPath = toClipperPath(negatedPart);

    const ifpPaths = clipper.minkowskiSumPath(
      patternPath,
      binPath,
      true
    );

    if (!ifpPaths || ifpPaths.length === 0) {
      return [];
    }

    return ifpPaths.map(fromClipperPath);

  } catch (error) {
    console.error('IFP computation error:', error);
    return [];
  }
}

/**
 * 여러 NFP를 Union하여 하나로 합침
 */
export function unionPolygons(polygons: Polygon[]): Polygon[] {
  if (!clipper || polygons.length === 0) return [];
  if (polygons.length === 1) return polygons;

  try {
    const paths = polygons.map(toClipperPath);

    const result = clipper.clipToPaths({
      clipType: clipperLib.ClipType.Union,
      subjectInputs: paths.map(p => ({ data: p, closed: true })),
      subjectFillType: clipperLib.PolyFillType.NonZero,
    });

    if (!result || result.length === 0) {
      return polygons;
    }

    return result.map(fromClipperPath);

  } catch (error) {
    console.error('Union error:', error);
    return polygons;
  }
}

/**
 * 폴리곤 확장/축소 (Offset)
 * delta > 0: 확장, delta < 0: 축소
 */
export function offsetPolygons(polygons: Polygon[], delta: number): Polygon[] {
  if (!clipper || polygons.length === 0 || delta === 0) return polygons;

  try {
    const paths = polygons.map(toClipperPath);
    const scaledDelta = delta * SCALE;

    const result = clipper.offsetToPaths({
      delta: scaledDelta,
      offsetInputs: paths.map(p => ({
        data: p,
        joinType: clipperLib.JoinType.Miter,
        endType: clipperLib.EndType.ClosedPolygon,
      })),
      miterLimit: 2,
      arcTolerance: 0.25 * SCALE,
    });

    if (!result || result.length === 0) {
      return polygons;
    }

    return result.map(fromClipperPath);

  } catch (error) {
    console.error('Offset error:', error);
    return polygons;
  }
}

/**
 * Difference: A - B
 * validArea = binIFP - Union(placedNFPs)
 */
export function differencePolygons(
  subject: Polygon[],
  clip: Polygon[]
): Polygon[] {
  if (!clipper) return [];
  if (clip.length === 0) return subject;

  try {
    const subjectPaths = subject.map(toClipperPath);
    const clipPaths = clip.map(toClipperPath);

    const result = clipper.clipToPaths({
      clipType: clipperLib.ClipType.Difference,
      subjectInputs: subjectPaths.map(p => ({ data: p, closed: true })),
      clipInputs: clipPaths.map(p => ({ data: p, closed: true })),
      subjectFillType: clipperLib.PolyFillType.NonZero,
      clipFillType: clipperLib.PolyFillType.NonZero,
    });

    if (!result || result.length === 0) {
      return [];
    }

    return result.map(fromClipperPath);

  } catch (error) {
    console.error('Difference error:', error);
    return [];
  }
}

// ============================================================
// Test & Debug Functions
// ============================================================

/**
 * 간단한 테스트: 사각형과 삼각형의 NFP 계산
 */
export async function testMinkowskiSum(): Promise<{
  square: Polygon;
  triangle: Polygon;
  nfp: Polygon[];
}> {
  await initNFPGenerator();

  // 테스트용 도형: 10x10 사각형
  const square: Polygon = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  // 테스트용 도형: 5x5 삼각형
  const triangle: Polygon = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 2.5, y: 5 },
  ];

  const nfp = computeNFP(square, triangle);

  console.log('=== Minkowski Sum Test ===');
  console.log('Square:', JSON.stringify(square));
  console.log('Triangle:', JSON.stringify(triangle));
  console.log('NFP result:', JSON.stringify(nfp, null, 2));
  console.log('NFP vertex count:', nfp.length > 0 ? nfp[0].length : 0);

  return { square, triangle, nfp };
}

/**
 * L자 도형 테스트
 */
export async function testLShapeNFP(): Promise<{
  lShape: Polygon;
  nfp: Polygon[];
}> {
  await initNFPGenerator();

  // L자 도형
  const lShape: Polygon = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 30 },
    { x: 0, y: 30 },
  ];

  // L자 vs L자 NFP
  const nfp = computeNFP(lShape, lShape);

  console.log('=== L-Shape NFP Test ===');
  console.log('L-Shape:', JSON.stringify(lShape));
  console.log('NFP result:', JSON.stringify(nfp, null, 2));
  console.log('NFP count:', nfp.length);
  if (nfp.length > 0) {
    console.log('NFP[0] vertices:', nfp[0].length);
  }

  return { lShape, nfp };
}
