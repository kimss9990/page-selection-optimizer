import type { Design, Paper, Placement, NestingResult, Polygon, BoundingBox, Point, NestingAlgorithm } from '../types';
import { doPolygonsCollide, isPolygonInsideBounds, getMinDistanceToBounds } from './collisionDetection';
import { rotatePolygon, translatePolygon, getPolygonsBoundingBox, normalizePolygonToOrigin, doBoundingBoxesOverlap } from './geometryUtils';
import { computeNFP, computeIFP, findValidPositions, selectBottomLeftPosition } from './nfpAlgorithm';
import { nestWithNFP, initNFPPlacer } from './nfpPlacer';
import { nestWithGA } from './geneticAlgorithm';

/**
 * 네스팅 엔진: 도면을 종이에 최적 배치
 */

// 진행률 콜백 타입
export type ProgressCallback = (progress: number, message: string) => void;

interface PlacementCandidate {
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  count: number;
}

/**
 * 모든 선택된 종이에 대해 네스팅 수행
 */
export function performNesting(
  design: Design,
  papers: Paper[],
  margin: number
): NestingResult[] {
  const results: NestingResult[] = [];

  for (const paper of papers) {
    const result = nestOnPaper(design, paper, margin);
    if (result) {
      results.push(result);
    }
  }

  // 효율 순으로 정렬
  results.sort((a, b) => b.efficiency - a.efficiency);

  return results;
}

/**
 * 진행률 콜백과 함께 네스팅 수행 (Web Worker용)
 */
export async function performNestingWithProgress(
  design: Design,
  papers: Paper[],
  margin: number,
  algorithm: NestingAlgorithm,
  onProgress: ProgressCallback
): Promise<NestingResult[]> {
  const results: NestingResult[] = [];
  const totalPapers = papers.length;

  // NFP 알고리즘 사용 시 초기화
  if (algorithm === 'nfp' || algorithm === 'nfp-ga') {
    onProgress(0, 'NFP 엔진 초기화 중...');
    await initNFPPlacer();
  }

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    const baseProgress = (i / totalPapers) * 100;
    const paperProgress = (1 / totalPapers) * 100;

    onProgress(baseProgress, `${paper.name} 분석 중... (${i + 1}/${totalPapers})`);

    // 비동기로 양보하여 취소 신호 처리 가능하게
    await new Promise(resolve => setTimeout(resolve, 0));

    let result: NestingResult | null = null;

    if (algorithm === 'nfp' || algorithm === 'nfp-ga') {
      // NFP 기반 알고리즘
      result = await nestOnPaperWithNFP(
        design,
        paper,
        margin,
        algorithm === 'nfp-ga', // GA 사용 여부
        (stepProgress, stepMessage) => {
          const totalProgress = baseProgress + (stepProgress / 100) * paperProgress;
          onProgress(totalProgress, `${paper.name}: ${stepMessage}`);
        }
      );
    } else {
      // 기존 빠른 알고리즘
      result = nestOnPaperWithProgress(
        design,
        paper,
        margin,
        (stepProgress, stepMessage) => {
          const totalProgress = baseProgress + (stepProgress / 100) * paperProgress;
          onProgress(totalProgress, `${paper.name}: ${stepMessage}`);
        }
      );
    }

    if (result) {
      results.push(result);
    }

    onProgress(baseProgress + paperProgress, `${paper.name} 완료`);
  }

  // 효율 순으로 정렬
  results.sort((a, b) => b.efficiency - a.efficiency);

  onProgress(100, '분석 완료');
  return results;
}

/**
 * 단일 종이에 도면 배치 (진행률 콜백 지원)
 */
function nestOnPaperWithProgress(
  design: Design,
  paper: Paper,
  margin: number,
  onProgress: ProgressCallback
): NestingResult | null {
  const paperBounds: BoundingBox = {
    x: 0,
    y: 0,
    width: paper.width,
    height: paper.height,
  };

  // 각 회전 각도별로 최적 배치 찾기
  const rotations: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270];
  let bestResult: PlacementCandidate | null = null;
  let bestPlacements: Placement[] = [];

  onProgress(0, '기본 배치 계산');

  for (const rotation of rotations) {
    const result = findBestPlacement(design, paperBounds, margin, rotation);
    if (result && (!bestResult || result.count > bestResult.count)) {
      bestResult = result;
      bestPlacements = generatePlacements(design, paperBounds, margin, rotation, result.count);
    }
  }

  onProgress(25, '혼합 회전 배치');

  // 0도와 90도 혼합 배치 시도
  const mixedResult = tryMixedRotation(design, paperBounds, margin);
  if (mixedResult && (!bestResult || mixedResult.placements.length > bestResult.count)) {
    bestResult = {
      x: 0,
      y: 0,
      rotation: 0,
      count: mixedResult.placements.length,
    };
    bestPlacements = mixedResult.placements;
  }

  onProgress(50, 'NFP 네스팅');

  // NFP 기반 퍼즐 네스팅 시도 (오목한 부분에 끼워넣기)
  const nfpResult = tryNFPNesting(design, paperBounds, margin);
  if (nfpResult && (!bestResult || nfpResult.placements.length > bestResult.count)) {
    bestResult = {
      x: 0,
      y: 0,
      rotation: 0,
      count: nfpResult.placements.length,
    };
    bestPlacements = nfpResult.placements;
  }

  onProgress(90, '결과 계산');

  if (!bestResult || bestPlacements.length === 0) {
    return null;
  }

  // 효율 계산
  const usedArea = design.area * bestPlacements.length;
  const paperArea = paper.width * paper.height;
  const efficiency = (usedArea / paperArea) * 100;
  const wastedArea = paperArea - usedArea;

  // 여백 경고 확인
  const warning = checkMarginWarning(design, bestPlacements, paperBounds, margin);

  onProgress(100, '완료');

  return {
    paperId: paper.id,
    paperName: paper.name,
    paperWidth: paper.width,
    paperHeight: paper.height,
    placements: bestPlacements,
    count: bestPlacements.length,
    efficiency: Math.round(efficiency * 100) / 100,
    usedArea,
    wastedArea,
    warning,
  };
}

/**
 * 단일 종이에 도면 배치
 */
function nestOnPaper(design: Design, paper: Paper, margin: number): NestingResult | null {
  const paperBounds: BoundingBox = {
    x: 0,
    y: 0,
    width: paper.width,
    height: paper.height,
  };

  // 각 회전 각도별로 최적 배치 찾기
  const rotations: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270];
  let bestResult: PlacementCandidate | null = null;
  let bestPlacements: Placement[] = [];

  for (const rotation of rotations) {
    const result = findBestPlacement(design, paperBounds, margin, rotation);
    if (result && (!bestResult || result.count > bestResult.count)) {
      bestResult = result;
      bestPlacements = generatePlacements(design, paperBounds, margin, rotation, result.count);
    }
  }

  // 0도와 90도 혼합 배치 시도
  const mixedResult = tryMixedRotation(design, paperBounds, margin);
  if (mixedResult && (!bestResult || mixedResult.placements.length > bestResult.count)) {
    bestResult = {
      x: 0,
      y: 0,
      rotation: 0,
      count: mixedResult.placements.length,
    };
    bestPlacements = mixedResult.placements;
  }

  // NFP 기반 퍼즐 네스팅 시도 (오목한 부분에 끼워넣기)
  const nfpResult = tryNFPNesting(design, paperBounds, margin);
  if (nfpResult && (!bestResult || nfpResult.placements.length > bestResult.count)) {
    bestResult = {
      x: 0,
      y: 0,
      rotation: 0,
      count: nfpResult.placements.length,
    };
    bestPlacements = nfpResult.placements;
  }

  if (!bestResult || bestPlacements.length === 0) {
    return null;
  }

  // 효율 계산
  const usedArea = design.area * bestPlacements.length;
  const paperArea = paper.width * paper.height;
  const efficiency = (usedArea / paperArea) * 100;
  const wastedArea = paperArea - usedArea;

  // 여백 경고 확인
  const warning = checkMarginWarning(design, bestPlacements, paperBounds, margin);

  return {
    paperId: paper.id,
    paperName: paper.name,
    paperWidth: paper.width,
    paperHeight: paper.height,
    placements: bestPlacements,
    count: bestPlacements.length,
    efficiency: Math.round(efficiency * 100) / 100,
    usedArea,
    wastedArea,
    warning,
  };
}

/**
 * 특정 회전 각도에서 최대 배치 개수 찾기
 */
function findBestPlacement(
  design: Design,
  paperBounds: BoundingBox,
  margin: number,
  rotation: 0 | 90 | 180 | 270
): PlacementCandidate | null {
  // 회전된 폴리곤의 바운딩 박스 계산
  const rotatedPolygons = design.polygons.map(poly => {
    const center = { x: design.boundingBox.width / 2, y: design.boundingBox.height / 2 };
    return rotatePolygon(poly, rotation, center);
  });
  const rotatedBBox = getPolygonsBoundingBox(rotatedPolygons);

  // 배치 가능한 공간 계산
  const availableWidth = paperBounds.width - 2 * margin;
  const availableHeight = paperBounds.height - 2 * margin;

  const designWidth = rotatedBBox.width;
  const designHeight = rotatedBBox.height;

  if (designWidth > availableWidth || designHeight > availableHeight) {
    return null;
  }

  // 가로/세로로 배치 가능한 개수 (마지막 요소는 여백 필요 없음)
  const adjustedCountX = Math.max(1, Math.floor((availableWidth + margin) / (designWidth + margin)));
  const adjustedCountY = Math.max(1, Math.floor((availableHeight + margin) / (designHeight + margin)));

  const count = adjustedCountX * adjustedCountY;

  return {
    x: margin,
    y: margin,
    rotation,
    count,
  };
}

/**
 * 배치 위치 생성
 */
function generatePlacements(
  design: Design,
  paperBounds: BoundingBox,
  margin: number,
  rotation: 0 | 90 | 180 | 270,
  _maxCount: number
): Placement[] {
  const placements: Placement[] = [];

  // 회전된 바운딩 박스 계산
  const rotatedPolygons = design.polygons.map(poly => {
    const center = { x: design.boundingBox.width / 2, y: design.boundingBox.height / 2 };
    return rotatePolygon(poly, rotation, center);
  });
  const rotatedBBox = getPolygonsBoundingBox(rotatedPolygons);

  const designWidth = rotatedBBox.width;
  const designHeight = rotatedBBox.height;

  const availableWidth = paperBounds.width - 2 * margin;
  const availableHeight = paperBounds.height - 2 * margin;

  const countX = Math.floor((availableWidth + margin) / (designWidth + margin));
  const countY = Math.floor((availableHeight + margin) / (designHeight + margin));

  for (let row = 0; row < countY; row++) {
    for (let col = 0; col < countX; col++) {
      const x = margin + col * (designWidth + margin) - rotatedBBox.x;
      const y = margin + row * (designHeight + margin) - rotatedBBox.y;

      placements.push({
        designId: design.id,
        x,
        y,
        rotation,
      });
    }
  }

  return placements;
}

/**
 * 혼합 회전 배치 시도 (0도와 90도 조합) - 적응형 그리드 기반
 */
function tryMixedRotation(
  design: Design,
  paperBounds: BoundingBox,
  margin: number
): { placements: Placement[] } | null {
  const placements: Placement[] = [];
  const placedPolygons: Array<{ polygon: Polygon; x: number; y: number; bbox: BoundingBox }> = [];

  // 적응형 그리드 크기: 도면 크기의 1/4 ~ 최소 margin
  // 이렇게 하면 작은 도면은 촘촘히, 큰 도면은 성글게 탐색
  const minDimension = Math.min(design.boundingBox.width, design.boundingBox.height);
  const gridSize = Math.max(margin, minDimension / 4);

  const maxX = paperBounds.width - margin;
  const maxY = paperBounds.height - margin;

  // 첫 번째 패스: 큰 그리드로 빠르게 배치
  for (let y = margin; y < maxY; y += gridSize) {
    for (let x = margin; x < maxX; x += gridSize) {
      // 0도와 90도 모두 시도
      for (const rotation of [0, 90] as const) {
        const placed = tryPlaceAtOptimized(
          design,
          x,
          y,
          rotation,
          paperBounds,
          margin,
          placedPolygons
        );

        if (placed) {
          placements.push(placed.placement);
          placedPolygons.push(...placed.polygons);
          break; // 배치 성공하면 다음 위치로
        }
      }
    }
  }

  // 두 번째 패스: 빈 공간에 추가 배치 시도 (더 세밀한 그리드)
  if (placements.length > 0 && gridSize > margin * 2) {
    const fineGridSize = Math.max(margin, gridSize / 2);
    for (let y = margin; y < maxY; y += fineGridSize) {
      for (let x = margin; x < maxX; x += fineGridSize) {
        // 이미 그리드 위치에서 시도한 곳은 스킵
        if (x % gridSize < 0.1 && y % gridSize < 0.1) continue;

        for (const rotation of [0, 90] as const) {
          const placed = tryPlaceAtOptimized(
            design,
            x,
            y,
            rotation,
            paperBounds,
            margin,
            placedPolygons
          );

          if (placed) {
            placements.push(placed.placement);
            placedPolygons.push(...placed.polygons);
            break;
          }
        }
      }
    }
  }

  if (placements.length === 0) {
    return null;
  }

  return { placements };
}

/**
 * NFP 기반 퍼즐 네스팅 - 오목한 부분에 끼워넣기 가능 (최적화 버전)
 */
function tryNFPNesting(
  design: Design,
  paperBounds: BoundingBox,
  margin: number
): { placements: Placement[] } | null {
  const placements: Placement[] = [];
  const placedPolygons: Array<{ polygon: Polygon; bbox: BoundingBox }> = [];

  // 여백이 적용된 종이 바운딩 박스
  const effectiveBounds: BoundingBox = {
    x: margin,
    y: margin,
    width: paperBounds.width - 2 * margin,
    height: paperBounds.height - 2 * margin,
  };

  // 회전 각도별로 시도
  const rotations: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270];

  // 도면을 원점 기준으로 정규화
  const normalizedPolygons = design.polygons.map(poly => normalizePolygonToOrigin(poly));

  // 모든 폴리곤을 하나로 합침 (가장 큰 폴리곤 사용)
  const mainPolygon = normalizedPolygons.reduce((largest, poly) =>
    poly.length > largest.length ? poly : largest, normalizedPolygons[0]);

  // 적응형 그리드 스텝: 도면 크기에 비례
  const minDimension = Math.min(design.boundingBox.width, design.boundingBox.height);
  const gridStep = Math.max(margin, minDimension / 8);

  // 최대 배치 개수 제한 (성능을 위해)
  const maxPlacements = Math.ceil(
    (effectiveBounds.width * effectiveBounds.height) / design.area
  ) + 5;

  while (placements.length < maxPlacements) {
    let bestPosition: { x: number; y: number; rotation: 0 | 90 | 180 | 270 } | null = null;

    // 각 회전에서 가장 좋은 위치 찾기
    for (const rotation of rotations) {
      const center: Point = { x: design.boundingBox.width / 2, y: design.boundingBox.height / 2 };
      const rotatedPolygon = rotatePolygon(mainPolygon, rotation, center);
      const normalizedRotated = normalizePolygonToOrigin(rotatedPolygon);

      // IFP 계산 (종이 내부에 배치 가능한 영역)
      const ifp = computeIFP(effectiveBounds, normalizedRotated);

      if (ifp.length === 0) continue;

      // 이미 배치된 폴리곤들에 대한 NFP 계산
      const nfps: Polygon[] = [];
      for (const { polygon: placed } of placedPolygons) {
        const nfp = computeNFP(placed, normalizedRotated);
        if (nfp.length > 0) {
          nfps.push(nfp);
        }
      }

      // 유효한 배치 위치 찾기
      const validPositions = findValidPositions(ifp, nfps, gridStep);

      if (validPositions.length === 0) continue;

      // Bottom-Left 전략으로 최적 위치 선택
      const position = selectBottomLeftPosition(validPositions);

      if (position) {
        // 이 위치가 실제로 유효한지 정밀 검사
        const candidatePolygons = design.polygons.map(poly => {
          let transformed = rotatePolygon(poly, rotation, center);
          transformed = translatePolygon(transformed, position.x, position.y);
          return transformed;
        });

        // 후보 폴리곤의 바운딩 박스 계산
        const candidateBBox = getPolygonsBoundingBox(candidatePolygons);

        let isValid = true;

        // 빠른 경계 검사
        if (candidateBBox.x < margin || candidateBBox.y < margin ||
            candidateBBox.x + candidateBBox.width > paperBounds.width - margin ||
            candidateBBox.y + candidateBBox.height > paperBounds.height - margin) {
          isValid = false;
        }

        // 기존 배치와 충돌 확인 (바운딩 박스 사전 필터링 적용)
        if (isValid) {
          for (const { polygon: placed, bbox: placedBBox } of placedPolygons) {
            // 바운딩 박스가 겹치지 않으면 스킵
            if (!doBoundingBoxesOverlap(candidateBBox, placedBBox, margin)) {
              continue;
            }
            // 바운딩 박스가 겹치면 정밀 검사
            for (const poly of candidatePolygons) {
              if (doPolygonsCollide(poly, placed, margin)) {
                isValid = false;
                break;
              }
            }
            if (!isValid) break;
          }
        }

        if (isValid && (!bestPosition || position.y < bestPosition.y ||
            (position.y === bestPosition.y && position.x < bestPosition.x))) {
          bestPosition = { x: position.x, y: position.y, rotation };
        }
      }
    }

    if (!bestPosition) break;

    // 배치 추가
    const center: Point = { x: design.boundingBox.width / 2, y: design.boundingBox.height / 2 };
    const newPlacement: Placement = {
      designId: design.id,
      x: bestPosition.x,
      y: bestPosition.y,
      rotation: bestPosition.rotation,
    };
    placements.push(newPlacement);

    // 배치된 폴리곤 추가 (바운딩 박스 포함)
    for (const poly of design.polygons) {
      let transformed = rotatePolygon(poly, bestPosition.rotation, center);
      transformed = translatePolygon(transformed, bestPosition.x, bestPosition.y);
      placedPolygons.push({
        polygon: transformed,
        bbox: getPolygonsBoundingBox([transformed]),
      });
    }
  }

  if (placements.length === 0) {
    return null;
  }

  return { placements };
}

/**
 * 특정 위치에 도면 배치 시도 (최적화 버전 - 바운딩 박스 사전 필터링)
 */
function tryPlaceAtOptimized(
  design: Design,
  x: number,
  y: number,
  rotation: 0 | 90 | 180 | 270,
  paperBounds: BoundingBox,
  margin: number,
  existingPolygons: Array<{ polygon: Polygon; x: number; y: number; bbox: BoundingBox }>
): { placement: Placement; polygons: Array<{ polygon: Polygon; x: number; y: number; bbox: BoundingBox }> } | null {
  const center: Point = { x: design.boundingBox.width / 2, y: design.boundingBox.height / 2 };

  // 폴리곤 회전 및 이동
  const transformedPolygons = design.polygons.map(poly => {
    let transformed = rotatePolygon(poly, rotation, center);
    transformed = translatePolygon(transformed, x, y);
    return transformed;
  });

  // 전체 바운딩 박스 계산 (빠른 사전 검사용)
  const newBBox = getPolygonsBoundingBox(transformedPolygons);

  // 빠른 경계 검사: 바운딩 박스가 종이 안에 있는지 확인
  if (newBBox.x < margin || newBBox.y < margin ||
      newBBox.x + newBBox.width > paperBounds.width - margin ||
      newBBox.y + newBBox.height > paperBounds.height - margin) {
    return null;
  }

  // 바운딩 박스 사전 필터링: 겹칠 가능성 있는 폴리곤만 정밀 검사
  for (const existing of existingPolygons) {
    // 바운딩 박스 겹침 확인 (margin 포함)
    if (!doBoundingBoxesOverlap(newBBox, existing.bbox, margin)) {
      continue; // 바운딩 박스가 겹치지 않으면 스킵
    }

    // 바운딩 박스가 겹치면 정밀 폴리곤 충돌 검사
    for (const poly of transformedPolygons) {
      if (doPolygonsCollide(poly, existing.polygon, margin)) {
        return null;
      }
    }
  }

  return {
    placement: {
      designId: design.id,
      x,
      y,
      rotation,
    },
    polygons: transformedPolygons.map(poly => ({
      polygon: poly,
      x: 0,
      y: 0,
      bbox: getPolygonsBoundingBox([poly]),
    })),
  };
}


/**
 * 여백 경고 확인 (3mm 미만)
 */
function checkMarginWarning(
  design: Design,
  placements: Placement[],
  paperBounds: BoundingBox,
  _margin: number
): boolean {
  const WARNING_THRESHOLD = 3; // mm

  for (const placement of placements) {
    const center: Point = { x: design.boundingBox.width / 2, y: design.boundingBox.height / 2 };

    for (const poly of design.polygons) {
      let transformed = rotatePolygon(poly, placement.rotation, center);
      transformed = translatePolygon(transformed, placement.x, placement.y);

      const minDist = getMinDistanceToBounds(transformed, paperBounds);
      if (minDist < WARNING_THRESHOLD) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 수동 배치 유효성 검사
 */
export function validatePlacements(
  design: Design,
  placements: Placement[],
  paperBounds: BoundingBox,
  margin: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    const center: Point = { x: design.boundingBox.width / 2, y: design.boundingBox.height / 2 };

    const transformedPolygons = design.polygons.map(poly => {
      let transformed = rotatePolygon(poly, placement.rotation, center);
      transformed = translatePolygon(transformed, placement.x, placement.y);
      return transformed;
    });

    // 종이 경계 확인
    for (const poly of transformedPolygons) {
      if (!isPolygonInsideBounds(poly, paperBounds, 0)) {
        errors.push(`배치 ${i + 1}이(가) 종이 경계를 벗어납니다.`);
        break;
      }
    }

    // 다른 배치와 충돌 확인
    for (let j = i + 1; j < placements.length; j++) {
      const otherPlacement = placements[j];
      const otherCenter: Point = { x: design.boundingBox.width / 2, y: design.boundingBox.height / 2 };

      const otherPolygons = design.polygons.map(poly => {
        let transformed = rotatePolygon(poly, otherPlacement.rotation, otherCenter);
        transformed = translatePolygon(transformed, otherPlacement.x, otherPlacement.y);
        return transformed;
      });

      for (const poly of transformedPolygons) {
        for (const otherPoly of otherPolygons) {
          if (doPolygonsCollide(poly, otherPoly, margin)) {
            errors.push(`배치 ${i + 1}과(와) 배치 ${j + 1}이(가) 충돌합니다.`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * NFP 기반 단일 종이 배치 (Minkowski Sum)
 */
async function nestOnPaperWithNFP(
  design: Design,
  paper: Paper,
  margin: number,
  useGA: boolean,
  onProgress: ProgressCallback
): Promise<NestingResult | null> {
  const paperBounds: BoundingBox = {
    x: 0,
    y: 0,
    width: paper.width,
    height: paper.height,
  };

  onProgress(0, useGA ? 'GA 최적화 시작' : 'NFP 배치 시작');

  try {
    let placements: Placement[];

    if (useGA) {
      // GA 기반 최적화
      const gaGenerations = 50;
      const gaResult = await nestWithGA(
        design,
        paperBounds,
        margin,
        {
          populationSize: 40,
          generations: gaGenerations,
          mutationRate: 0.12,
          crossoverRate: 0.85,
          eliteCount: 3,
          tournamentSize: 4,
          rotationAngles: [0, 90, 180, 270],
        },
        (generation, bestFitness, message) => {
          const progress = (generation / gaGenerations) * 90;
          onProgress(progress, `${message} (최고: ${bestFitness}개)`);
        }
      );
      placements = gaResult.placements;
    } else {
      // 기존 NFP 배치
      const nfpResult = await nestWithNFP(
        design,
        paperBounds,
        {
          margin,
          rotationStep: 90,
          gridStep: Math.max(1, margin),
        },
        (progress, message) => {
          onProgress(progress * 0.9, message);
        }
      );
      placements = nfpResult.placements;
    }

    onProgress(95, '결과 계산');

    if (placements.length === 0) {
      return null;
    }

    // 효율 계산
    const usedArea = design.area * placements.length;
    const paperArea = paper.width * paper.height;
    const calculatedEfficiency = (usedArea / paperArea) * 100;
    const wastedArea = paperArea - usedArea;

    // 여백 경고 확인
    const warning = checkMarginWarningForPlacements(design, placements, paperBounds, margin);

    onProgress(100, '완료');

    return {
      paperId: paper.id,
      paperName: paper.name,
      paperWidth: paper.width,
      paperHeight: paper.height,
      placements,
      count: placements.length,
      efficiency: Math.round(calculatedEfficiency * 100) / 100,
      usedArea,
      wastedArea,
      warning,
    };
  } catch (error) {
    console.error('NFP nesting error:', error);
    return null;
  }
}

/**
 * 여백 경고 확인 (분리된 함수)
 */
function checkMarginWarningForPlacements(
  design: Design,
  placements: Placement[],
  paperBounds: BoundingBox,
  _margin: number
): boolean {
  const WARNING_THRESHOLD = 3; // mm

  for (const placement of placements) {
    const center: Point = { x: design.boundingBox.width / 2, y: design.boundingBox.height / 2 };

    for (const poly of design.polygons) {
      let transformed = rotatePolygon(poly, placement.rotation, center);
      transformed = translatePolygon(transformed, placement.x, placement.y);

      const minDist = getMinDistanceToBounds(transformed, paperBounds);
      if (minDist < WARNING_THRESHOLD) {
        return true;
      }
    }
  }

  return false;
}
