/**
 * NFP 기반 배치 알고리즘 (True Minkowski Sum)
 *
 * validArea = binIFP - Union(placedNFPs)
 * 알고리즘으로 정확한 배치 위치 계산
 */

import type { Point, Polygon, BoundingBox, Placement, Design } from '../types';
import {
  initNFPGenerator,
  isNFPGeneratorReady,
  computeNFP,
  unionPolygons,
  differencePolygons,
  offsetPolygons,
  getCachedNFP,
  setCachedNFP,
} from './nfpGenerator';
import { rotatePolygon, translatePolygon, getPolygonsBoundingBox, normalizePolygonToOrigin } from './geometryUtils';
import { doPolygonsCollide } from './collisionDetection';

// 진행률 콜백 타입
export type PlacerProgressCallback = (progress: number, message: string) => void;

// 배치 결과
export interface NFPPlacementResult {
  placements: Placement[];
  unplaced: number[];  // 배치 못한 도형 인덱스
  efficiency: number;
}

// 회전 각도 설정
export type RotationStep = 1 | 5 | 10 | 15 | 30 | 45 | 90;

interface PlacerConfig {
  margin: number;
  rotationStep: RotationStep;  // 회전 탐색 단위 (도)
  gridStep?: number;           // 그리드 탐색 단위 (mm)
}

/**
 * NFP Placer 초기화 (Clipper2 로드)
 */
export async function initNFPPlacer(): Promise<void> {
  await initNFPGenerator();
}

/**
 * NFP Placer 준비 상태 확인
 */
export function isNFPPlacerReady(): boolean {
  return isNFPGeneratorReady();
}

/**
 * 폴리곤의 바운딩 박스 계산
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
 * IFP 계산 (Inner-Fit Polygon) - 직사각형 bin용
 *
 * 도형의 기준점(첫 번째 점)이 IFP 내부에 있으면
 * 도형 전체가 bin 안에 완전히 들어감
 */
function computeRectBinIFP(binBounds: BoundingBox, polygon: Polygon): Polygon {
  if (polygon.length < 3) return [];

  const polyBBox = getPolygonBBox(polygon);
  const refPoint = polygon[0];

  // 기준점과 바운딩 박스 모서리 사이의 오프셋
  const offsetLeft = refPoint.x - polyBBox.minX;    // 기준점에서 왼쪽 끝까지
  const offsetRight = polyBBox.maxX - refPoint.x;   // 기준점에서 오른쪽 끝까지
  const offsetTop = refPoint.y - polyBBox.minY;     // 기준점에서 위쪽 끝까지
  const offsetBottom = polyBBox.maxY - refPoint.y;  // 기준점에서 아래쪽 끝까지

  // IFP: bin을 도형 크기만큼 축소
  const ifpMinX = binBounds.x + offsetLeft;
  const ifpMaxX = binBounds.x + binBounds.width - offsetRight;
  const ifpMinY = binBounds.y + offsetTop;
  const ifpMaxY = binBounds.y + binBounds.height - offsetBottom;

  // 유효한 IFP가 없으면 빈 배열 반환
  if (ifpMinX >= ifpMaxX || ifpMinY >= ifpMaxY) {
    return [];
  }

  return [
    { x: ifpMinX, y: ifpMinY },
    { x: ifpMaxX, y: ifpMinY },
    { x: ifpMaxX, y: ifpMaxY },
    { x: ifpMinX, y: ifpMaxY },
  ];
}

/**
 * 도형 ID 생성 (캐시 키용)
 */
function getShapeId(polygon: Polygon): string {
  // 폴리곤의 점 개수와 면적으로 간단한 ID 생성
  const area = Math.abs(getPolygonArea(polygon));
  return `p${polygon.length}_a${Math.round(area * 100)}`;
}

/**
 * 폴리곤 면적 계산 (Shoelace formula)
 */
function getPolygonArea(polygon: Polygon): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return area / 2;
}

/**
 * 점이 폴리곤 내부에 있는지 확인 (Ray casting)
 */
function isPointInPolygon(point: Point, polygon: Polygon): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    if ((yi > point.y) !== (yj > point.y) &&
        point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * 폴리곤 영역에서 유효한 배치 위치들 찾기
 */
function findValidPositionsInPolygons(
  validPolygons: Polygon[],
  gridStep: number
): Point[] {
  const positions: Point[] = [];

  for (const polygon of validPolygons) {
    if (polygon.length < 3) continue;

    // 폴리곤의 바운딩 박스 계산
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of polygon) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    // 그리드 탐색
    for (let y = minY; y <= maxY; y += gridStep) {
      for (let x = minX; x <= maxX; x += gridStep) {
        const point = { x, y };
        if (isPointInPolygon(point, polygon)) {
          positions.push(point);
        }
      }
    }

    // 폴리곤 꼭짓점도 후보에 추가
    for (const vertex of polygon) {
      if (isPointInPolygon(vertex, polygon)) {
        positions.push({ ...vertex });
      }
    }
  }

  return positions;
}

/**
 * Bottom-Left-Fill 전략으로 최적 위치 선택
 */
function selectBestPosition(positions: Point[]): Point | null {
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
 * NFP 기반 단일 도형 배치
 *
 * @param partPolygon 배치할 도형 (정규화됨, 기준점이 원점)
 * @param partId 도형 ID
 * @param rotation 회전 각도
 * @param binIFP bin의 IFP
 * @param placedParts 이미 배치된 도형들
 * @param config 설정
 * @returns 배치 위치 또는 null
 */
function placeSinglePart(
  partPolygon: Polygon,
  partId: string,
  rotation: number,
  binIFP: Polygon[],
  placedParts: Array<{ polygon: Polygon; position: Point; id: string; rotation: number }>,
  config: PlacerConfig
): Point | null {
  // 1. 회전된 도형 준비
  const center = { x: 0, y: 0 };
  const rotatedPart = rotation === 0
    ? partPolygon
    : normalizePolygonToOrigin(rotatePolygon(partPolygon, rotation, center));

  // 2. 배치된 도형들의 NFP 계산 및 Union
  const allNFPs: Polygon[] = [];

  for (const placed of placedParts) {
    // NFP 캐시 확인
    const cacheKey = {
      shapeAId: placed.id,
      shapeBId: partId,
      rotationA: placed.rotation,
      rotationB: rotation,
      inside: false,
    };

    let nfpPolygons = getCachedNFP(cacheKey);

    if (!nfpPolygons) {
      // NFP 계산: 배치된 도형 주위로 새 도형이 갈 수 없는 영역
      nfpPolygons = computeNFP(placed.polygon, rotatedPart);
      if (nfpPolygons.length > 0) {
        setCachedNFP(cacheKey, nfpPolygons);
      }
    }

    // NFP를 배치된 위치로 이동
    for (const nfp of nfpPolygons) {
      const translatedNFP = translatePolygon(nfp, placed.position.x, placed.position.y);
      allNFPs.push(translatedNFP);
    }
  }


  // 3. NFP들을 Union
  const unionedNFPs = allNFPs.length > 0 ? unionPolygons(allNFPs) : [];

  // 4. NFP를 margin만큼 확장 (충돌 여백 확보)
  const expandedNFPs = unionedNFPs.length > 0
    ? offsetPolygons(unionedNFPs, config.margin)
    : [];

  // 5. validArea = binIFP - expandedNFPs
  let validArea: Polygon[];
  if (expandedNFPs.length > 0) {
    validArea = differencePolygons(binIFP, expandedNFPs);
  } else {
    validArea = binIFP;
  }

  if (validArea.length === 0) {
    return null;
  }

  // 6. 그리드 탐색으로 유효한 위치들 찾기
  // 적응형 그리드: 영역 크기에 따라 조절 (너무 많은 후보 방지)
  const areaBbox = getPolygonBBox(validArea[0] || []);
  const areaSize = (areaBbox.maxX - areaBbox.minX) * (areaBbox.maxY - areaBbox.minY);
  const baseStep = config.gridStep || config.margin;
  // 영역이 크면 그리드 스텝을 늘림 (최대 10만 개 후보 목표)
  const targetCandidates = 100000;
  const estimatedCandidates = areaSize / (baseStep * baseStep);
  const gridStep = estimatedCandidates > targetCandidates
    ? Math.sqrt(areaSize / targetCandidates)
    : Math.max(1, baseStep);
  const candidatePositions = findValidPositionsInPolygons(validArea, gridStep);

  if (candidatePositions.length === 0) {
    return null;
  }

  // 6. Bottom-Left 전략으로 최적 위치 선택
  return selectBestPosition(candidatePositions);
}

/**
 * NFP 기반 네스팅 (단일 종이)
 */
export async function nestWithNFP(
  design: Design,
  paperBounds: BoundingBox,
  config: PlacerConfig,
  onProgress?: PlacerProgressCallback
): Promise<NFPPlacementResult> {
  if (!isNFPPlacerReady()) {
    await initNFPPlacer();
  }

  const placements: Placement[] = [];
  const unplaced: number[] = [];

  // 여백 적용된 bin
  const effectiveBounds: BoundingBox = {
    x: config.margin,
    y: config.margin,
    width: paperBounds.width - 2 * config.margin,
    height: paperBounds.height - 2 * config.margin,
  };

  // 도면의 메인 폴리곤 (가장 큰 것)
  const mainPolygon = design.polygons.reduce((largest, poly) =>
    poly.length > largest.length ? poly : largest, design.polygons[0]);

  const normalizedPart = normalizePolygonToOrigin(mainPolygon);
  const partId = getShapeId(normalizedPart);

  // 회전 각도 목록 생성
  const rotations: number[] = [];
  for (let r = 0; r < 360; r += config.rotationStep) {
    rotations.push(r);
  }

  // 배치된 도형들
  const placedParts: Array<{ polygon: Polygon; position: Point; id: string; rotation: number }> = [];

  // 최대 배치 개수 추정
  const maxPlacements = Math.ceil(
    (effectiveBounds.width * effectiveBounds.height) / design.area
  ) + 10;

  let attempts = 0;
  const maxAttempts = maxPlacements * 2;

  while (placements.length < maxPlacements && attempts < maxAttempts) {
    attempts++;

    if (onProgress) {
      const progress = Math.min(90, (placements.length / maxPlacements) * 100);
      onProgress(progress, `배치 중... (${placements.length}개)`);
    }

    let bestPosition: Point | null = null;
    let bestRotation = 0;
    let bestRotatedPart: Polygon | null = null;

    // 각 회전에서 배치 시도
    for (const rotation of rotations) {
      // 회전된 도형
      const center = { x: 0, y: 0 };
      const rotatedPart = rotation === 0
        ? normalizedPart
        : normalizePolygonToOrigin(rotatePolygon(normalizedPart, rotation, center));

      // 이 회전에 대한 binIFP 계산 (직사각형 bin용)
      const ifpPolygon = computeRectBinIFP(effectiveBounds, rotatedPart);

      if (ifpPolygon.length === 0) continue;

      const binIFP = [ifpPolygon]; // 배열로 감싸기

      // 배치 위치 찾기
      const position = placeSinglePart(
        normalizedPart,
        partId,
        rotation,
        binIFP,
        placedParts,
        config
      );

      if (position) {
        // Bottom-Left 기준으로 더 좋은 위치 선택
        if (!bestPosition ||
            position.y < bestPosition.y ||
            (position.y === bestPosition.y && position.x < bestPosition.x)) {
          bestPosition = position;
          bestRotation = rotation;
          bestRotatedPart = rotatedPart;
        }
      }
    }

    if (!bestPosition || !bestRotatedPart) {
      break; // 더 이상 배치 불가
    }

    // 정밀 충돌 검사
    const transformedPolygons = design.polygons.map(poly => {
      const center = { x: design.boundingBox.width / 2, y: design.boundingBox.height / 2 };
      let transformed = rotatePolygon(poly, bestRotation, center);
      transformed = translatePolygon(transformed, bestPosition!.x, bestPosition!.y);
      return transformed;
    });

    // 경계 검사
    const bbox = getPolygonsBoundingBox(transformedPolygons);
    if (bbox.x < config.margin || bbox.y < config.margin ||
        bbox.x + bbox.width > paperBounds.width - config.margin ||
        bbox.y + bbox.height > paperBounds.height - config.margin) {
      continue;
    }

    // 기존 배치와 충돌 검사
    // 주의: NFP 확장에서 이미 margin을 적용했으므로 여기서는 0 사용
    let hasCollision = false;
    for (const placed of placedParts) {
      const placedTransformed = translatePolygon(placed.polygon, placed.position.x, placed.position.y);
      for (const poly of transformedPolygons) {
        if (doPolygonsCollide(poly, placedTransformed, 0)) {
          hasCollision = true;
          break;
        }
      }
      if (hasCollision) break;
    }

    if (hasCollision) {
      continue;
    }

    // 배치 추가
    const placement: Placement = {
      designId: design.id,
      x: bestPosition.x,
      y: bestPosition.y,
      rotation: (bestRotation % 360) as 0 | 90 | 180 | 270,
    };
    placements.push(placement);

    // 배치된 도형 정보 저장 (원점 기준 폴리곤 저장 - NFP 계산용)
    // 주의: polygon은 원점 기준, position은 실제 배치 위치
    placedParts.push({
      polygon: bestRotatedPart,  // 원점 기준 (이동 안 됨)
      position: bestPosition,
      id: partId,
      rotation: bestRotation,
    });
  }

  if (onProgress) {
    onProgress(100, `완료 (${placements.length}개 배치)`);
  }

  // 효율 계산
  const usedArea = design.area * placements.length;
  const paperArea = paperBounds.width * paperBounds.height;
  const efficiency = (usedArea / paperArea) * 100;

  return {
    placements,
    unplaced,
    efficiency: Math.round(efficiency * 100) / 100,
  };
}

/**
 * 여러 종이에 대해 NFP 네스팅 수행
 */
export async function nestOnMultiplePapersWithNFP(
  design: Design,
  papers: Array<{ id: string; name: string; width: number; height: number }>,
  config: PlacerConfig,
  onProgress?: PlacerProgressCallback
): Promise<Array<NFPPlacementResult & { paperId: string; paperName: string }>> {
  const results: Array<NFPPlacementResult & { paperId: string; paperName: string }> = [];

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];

    if (onProgress) {
      const baseProgress = (i / papers.length) * 100;
      onProgress(baseProgress, `${paper.name} 분석 중...`);
    }

    const bounds: BoundingBox = {
      x: 0,
      y: 0,
      width: paper.width,
      height: paper.height,
    };

    const result = await nestWithNFP(design, bounds, config, (progress, message) => {
      if (onProgress) {
        const baseProgress = (i / papers.length) * 100;
        const paperProgress = (1 / papers.length) * (progress / 100) * 100;
        onProgress(baseProgress + paperProgress, `${paper.name}: ${message}`);
      }
    });

    results.push({
      ...result,
      paperId: paper.id,
      paperName: paper.name,
    });
  }

  // 효율 순 정렬
  results.sort((a, b) => b.efficiency - a.efficiency);

  return results;
}

// 테스트 함수 - 브라우저 콘솔에서 실행 가능
export async function testNFPPlacement(): Promise<void> {
  await initNFPPlacer();

  // 테스트용 L자 도형
  const lShape: Polygon = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 30 },
    { x: 0, y: 30 },
  ];

  // 테스트용 종이 (100x100mm)
  const paperBounds: BoundingBox = {
    x: 0, y: 0, width: 100, height: 100,
  };

  // 테스트용 Design 객체
  const design: Design = {
    id: 'test-lshape',
    name: 'Test L-Shape',
    svgContent: '',
    viewBox: { x: 0, y: 0, width: 20, height: 30 },
    boundingBox: { x: 0, y: 0, width: 20, height: 30 },
    polygons: [lShape],
    area: 20 * 30 - 10 * 20, // L자 면적: 400mm²
  };

  console.log('=== NFP Placement Test ===');
  console.log('Paper:', JSON.stringify(paperBounds));
  console.log('Design:', JSON.stringify(design.boundingBox));

  const result = await nestWithNFP(design, paperBounds, {
    margin: 3,
    rotationStep: 90,
    gridStep: 5,
  }, (progress, message) => {
    console.log(`[${progress.toFixed(1)}%] ${message}`);
  });

  console.log('=== Result ===');
  console.log('Placements:', JSON.stringify(result.placements, null, 2));
  console.log('Count:', result.placements.length);
  console.log('Efficiency:', result.efficiency + '%');
}
