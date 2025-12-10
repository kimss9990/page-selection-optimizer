import type { Design, Paper, Placement, NestingResult, Polygon, BoundingBox, Point } from '../types';
import { doPolygonsCollide, isPolygonInsideBounds, getMinDistanceToBounds } from './collisionDetection';
import { rotatePolygon, translatePolygon, getPolygonsBoundingBox } from './geometryUtils';

/**
 * 네스팅 엔진: 도면을 종이에 최적 배치
 */

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
 * 혼합 회전 배치 시도 (0도와 90도 조합)
 */
function tryMixedRotation(
  design: Design,
  paperBounds: BoundingBox,
  margin: number
): { placements: Placement[] } | null {
  const placements: Placement[] = [];
  const placedPolygons: Array<{ polygon: Polygon; x: number; y: number }> = [];

  // 그리드 기반 배치
  const gridSize = margin;
  const maxX = paperBounds.width - margin;
  const maxY = paperBounds.height - margin;

  for (let y = margin; y < maxY; y += gridSize) {
    for (let x = margin; x < maxX; x += gridSize) {
      // 0도와 90도 모두 시도
      for (const rotation of [0, 90] as const) {
        const placed = tryPlaceAt(
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

  if (placements.length === 0) {
    return null;
  }

  return { placements };
}

/**
 * 특정 위치에 도면 배치 시도
 */
function tryPlaceAt(
  design: Design,
  x: number,
  y: number,
  rotation: 0 | 90 | 180 | 270,
  paperBounds: BoundingBox,
  margin: number,
  existingPolygons: Array<{ polygon: Polygon; x: number; y: number }>
): { placement: Placement; polygons: Array<{ polygon: Polygon; x: number; y: number }> } | null {
  const center: Point = { x: design.boundingBox.width / 2, y: design.boundingBox.height / 2 };

  // 폴리곤 회전 및 이동
  const transformedPolygons = design.polygons.map(poly => {
    let transformed = rotatePolygon(poly, rotation, center);
    transformed = translatePolygon(transformed, x, y);
    return transformed;
  });

  // 종이 경계 내 확인
  for (const poly of transformedPolygons) {
    if (!isPolygonInsideBounds(poly, paperBounds, margin)) {
      return null;
    }
  }

  // 기존 배치와 충돌 확인
  for (const existing of existingPolygons) {
    const existingPoly = translatePolygon(existing.polygon, existing.x, existing.y);
    for (const poly of transformedPolygons) {
      if (doPolygonsCollide(poly, existingPoly, margin)) {
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
    polygons: transformedPolygons.map(poly => ({ polygon: poly, x: 0, y: 0 })),
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
