/**
 * 유전 알고리즘 (Genetic Algorithm) for Nesting Optimization
 *
 * 최적화 대상:
 * - 배치 순서 (placement order)
 * - 각 도형의 회전 각도 (rotation)
 */

import type { Polygon, Point, BoundingBox, Placement, Design } from '../types';
import {
  initNFPGenerator,
  isNFPGeneratorReady,
  computeNFP,
  unionPolygons,
  differencePolygons,
  offsetPolygons,
} from './nfpGenerator';
import { rotatePolygon, translatePolygon, normalizePolygonToOrigin } from './geometryUtils';
import { doPolygonsCollide } from './collisionDetection';

// GA 설정
export interface GAConfig {
  populationSize: number;      // 개체군 크기
  generations: number;         // 세대 수
  mutationRate: number;        // 돌연변이 확률 (0-1)
  crossoverRate: number;       // 교차 확률 (0-1)
  eliteCount: number;          // 엘리트 보존 수
  tournamentSize: number;      // 토너먼트 선택 크기
  rotationAngles: number[];    // 허용 회전 각도
}

// 기본 GA 설정
export const DEFAULT_GA_CONFIG: GAConfig = {
  populationSize: 30,
  generations: 50,
  mutationRate: 0.1,
  crossoverRate: 0.8,
  eliteCount: 2,
  tournamentSize: 3,
  rotationAngles: [0, 90, 180, 270],
};

// 염색체: 각 유전자는 (배치순서인덱스, 회전각도)
interface Gene {
  rotation: number;
}

interface Chromosome {
  genes: Gene[];           // 배치 순서대로의 회전 정보
  order: number[];         // 배치 순서 (인덱스 순열)
  fitness: number;         // 적합도 (배치 개수 또는 효율)
}

// 진행률 콜백
export type GAProgressCallback = (
  generation: number,
  bestFitness: number,
  message: string
) => void;

/**
 * 무작위 염색체 생성
 */
function createRandomChromosome(
  partCount: number,
  rotationAngles: number[]
): Chromosome {
  // 무작위 순서
  const order = Array.from({ length: partCount }, (_, i) => i);
  shuffleArray(order);

  // 무작위 회전
  const genes: Gene[] = order.map(() => ({
    rotation: rotationAngles[Math.floor(Math.random() * rotationAngles.length)],
  }));

  return { genes, order, fitness: 0 };
}

/**
 * 배열 셔플 (Fisher-Yates)
 */
function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * 토너먼트 선택
 */
function tournamentSelect(
  population: Chromosome[],
  tournamentSize: number
): Chromosome {
  let best: Chromosome | null = null;

  for (let i = 0; i < tournamentSize; i++) {
    const idx = Math.floor(Math.random() * population.length);
    const candidate = population[idx];
    if (!best || candidate.fitness > best.fitness) {
      best = candidate;
    }
  }

  return best!;
}

/**
 * 순서 교차 (Order Crossover, OX)
 */
function orderCrossover(
  parent1: Chromosome,
  parent2: Chromosome,
  _rotationAngles: number[]
): [Chromosome, Chromosome] {
  const len = parent1.order.length;

  // 두 개의 교차점 선택
  let point1 = Math.floor(Math.random() * len);
  let point2 = Math.floor(Math.random() * len);
  if (point1 > point2) [point1, point2] = [point2, point1];

  // 자식 1: parent1의 중간 부분 복사
  const child1Order: (number | null)[] = new Array(len).fill(null);
  const child1Genes: Gene[] = new Array(len);

  for (let i = point1; i <= point2; i++) {
    child1Order[i] = parent1.order[i];
    child1Genes[i] = { ...parent1.genes[i] };
  }

  // parent2에서 나머지 채우기
  let pos = (point2 + 1) % len;
  for (let i = 0; i < len; i++) {
    const idx = (point2 + 1 + i) % len;
    const val = parent2.order[idx];
    if (!child1Order.includes(val)) {
      child1Order[pos] = val;
      child1Genes[pos] = { ...parent2.genes[idx] };
      pos = (pos + 1) % len;
    }
  }

  // 자식 2: parent2의 중간 부분 복사
  const child2Order: (number | null)[] = new Array(len).fill(null);
  const child2Genes: Gene[] = new Array(len);

  for (let i = point1; i <= point2; i++) {
    child2Order[i] = parent2.order[i];
    child2Genes[i] = { ...parent2.genes[i] };
  }

  pos = (point2 + 1) % len;
  for (let i = 0; i < len; i++) {
    const idx = (point2 + 1 + i) % len;
    const val = parent1.order[idx];
    if (!child2Order.includes(val)) {
      child2Order[pos] = val;
      child2Genes[pos] = { ...parent1.genes[idx] };
      pos = (pos + 1) % len;
    }
  }

  return [
    { order: child1Order as number[], genes: child1Genes, fitness: 0 },
    { order: child2Order as number[], genes: child2Genes, fitness: 0 },
  ];
}

/**
 * 돌연변이: 순서 스왑 + 회전 변경
 */
function mutate(
  chromosome: Chromosome,
  mutationRate: number,
  rotationAngles: number[]
): void {
  const len = chromosome.order.length;

  // 순서 스왑 돌연변이
  if (Math.random() < mutationRate) {
    const i = Math.floor(Math.random() * len);
    const j = Math.floor(Math.random() * len);
    [chromosome.order[i], chromosome.order[j]] = [chromosome.order[j], chromosome.order[i]];
    [chromosome.genes[i], chromosome.genes[j]] = [chromosome.genes[j], chromosome.genes[i]];
  }

  // 회전 돌연변이
  for (let i = 0; i < len; i++) {
    if (Math.random() < mutationRate) {
      chromosome.genes[i].rotation =
        rotationAngles[Math.floor(Math.random() * rotationAngles.length)];
    }
  }
}

/**
 * 폴리곤 바운딩 박스 계산
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
 * 점이 폴리곤 내부에 있는지 확인
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
 * IFP 계산 (직사각형 bin용)
 */
function computeRectBinIFP(binBounds: BoundingBox, polygon: Polygon): Polygon {
  if (polygon.length < 3) return [];

  const polyBBox = getPolygonBBox(polygon);
  const refPoint = polygon[0];

  const offsetLeft = refPoint.x - polyBBox.minX;
  const offsetRight = polyBBox.maxX - refPoint.x;
  const offsetTop = refPoint.y - polyBBox.minY;
  const offsetBottom = polyBBox.maxY - refPoint.y;

  const ifpMinX = binBounds.x + offsetLeft;
  const ifpMaxX = binBounds.x + binBounds.width - offsetRight;
  const ifpMinY = binBounds.y + offsetTop;
  const ifpMaxY = binBounds.y + binBounds.height - offsetBottom;

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
 * validArea에서 Bottom-Left 위치 찾기
 */
function findBottomLeftPosition(
  validArea: Polygon[],
  gridStep: number
): Point | null {
  let bestPosition: Point | null = null;

  for (const polygon of validArea) {
    if (polygon.length < 3) continue;

    const bbox = getPolygonBBox(polygon);

    // 그리드 탐색
    for (let y = bbox.minY; y <= bbox.maxY; y += gridStep) {
      for (let x = bbox.minX; x <= bbox.maxX; x += gridStep) {
        const point = { x, y };
        if (isPointInPolygon(point, polygon)) {
          if (!bestPosition || y < bestPosition.y || (y === bestPosition.y && x < bestPosition.x)) {
            bestPosition = point;
          }
        }
      }
    }

    // 꼭짓점도 확인
    for (const vertex of polygon) {
      if (isPointInPolygon(vertex, polygon)) {
        if (!bestPosition || vertex.y < bestPosition.y ||
            (vertex.y === bestPosition.y && vertex.x < bestPosition.x)) {
          bestPosition = { ...vertex };
        }
      }
    }
  }

  return bestPosition;
}

/**
 * 도형 ID 생성
 */
function getShapeId(polygon: Polygon): string {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  area = Math.abs(area / 2);
  return `p${polygon.length}_a${Math.round(area * 100)}`;
}

/**
 * 염색체 적합도 평가 (실제 배치 시뮬레이션)
 * nfpPlacer.ts와 동일한 구조 사용
 */
function evaluateFitness(
  chromosome: Chromosome,
  normalizedPart: Polygon,
  _partId: string,
  design: Design,
  effectiveBounds: BoundingBox,
  paperBounds: BoundingBox,
  margin: number
): { fitness: number; placements: Placement[] } {
  const placements: Placement[] = [];
  // 실제 렌더링된 폴리곤 저장 (충돌 검사용)
  const placedRenderedPolygons: Polygon[] = [];
  // NFP 계산용 (원점 기준 폴리곤 + 위치)
  const placedParts: Array<{ polygon: Polygon; position: Point }> = [];

  // 최대 배치 개수
  const maxPlacements = Math.ceil(
    (effectiveBounds.width * effectiveBounds.height) / design.area
  ) + 10;

  // 염색체 순서대로 배치 시도
  for (let i = 0; i < maxPlacements && placements.length < maxPlacements; i++) {
    const geneIdx = i % chromosome.genes.length;
    const rotation = chromosome.genes[geneIdx].rotation;

    // 회전된 도형 준비 (원점 기준)
    const rotatedPart = rotation === 0
      ? normalizedPart
      : normalizePolygonToOrigin(rotatePolygon(normalizedPart, rotation, { x: 0, y: 0 }));

    // IFP 계산
    const ifpPolygon = computeRectBinIFP(effectiveBounds, rotatedPart);
    if (ifpPolygon.length === 0) continue;

    const binIFP = [ifpPolygon];

    // 배치된 도형들의 NFP 계산 (nfpPlacer와 동일)
    const allNFPs: Polygon[] = [];
    for (const placed of placedParts) {
      const nfpPolygons = computeNFP(placed.polygon, rotatedPart);
      for (const nfp of nfpPolygons) {
        // NFP를 배치된 위치로 이동
        const translatedNFP = translatePolygon(nfp, placed.position.x, placed.position.y);
        allNFPs.push(translatedNFP);
      }
    }

    // NFP Union 및 확장
    const unionedNFPs = allNFPs.length > 0 ? unionPolygons(allNFPs) : [];
    const expandedNFPs = unionedNFPs.length > 0
      ? offsetPolygons(unionedNFPs, margin)
      : [];

    // validArea 계산
    let validArea: Polygon[];
    if (expandedNFPs.length > 0) {
      validArea = differencePolygons(binIFP, expandedNFPs);
    } else {
      validArea = binIFP;
    }

    if (validArea.length === 0) break;

    // 적응형 그리드 스텝
    const areaBbox = getPolygonBBox(validArea[0] || []);
    const areaSize = (areaBbox.maxX - areaBbox.minX) * (areaBbox.maxY - areaBbox.minY);
    const gridStep = Math.max(2, Math.sqrt(areaSize / 50000));

    // Bottom-Left 위치 찾기
    const position = findBottomLeftPosition(validArea, gridStep);
    if (!position) break;

    // 실제 렌더링될 폴리곤으로 검증 (nfpPlacer와 동일)
    const designCenter = { x: design.boundingBox.width / 2, y: design.boundingBox.height / 2 };
    const transformedPolygons = design.polygons.map(poly => {
      let transformed = rotatePolygon(poly, rotation, designCenter);
      transformed = translatePolygon(transformed, position.x, position.y);
      return transformed;
    });

    // 경계 검사 (실제 렌더링될 폴리곤 기준)
    let outOfBounds = false;
    for (const poly of transformedPolygons) {
      const bbox = getPolygonBBox(poly);
      if (bbox.minX < margin || bbox.minY < margin ||
          bbox.maxX > paperBounds.width - margin ||
          bbox.maxY > paperBounds.height - margin) {
        outOfBounds = true;
        break;
      }
    }
    if (outOfBounds) continue;

    // 충돌 검사 (동일한 폴리곤 표현으로 비교)
    let hasCollision = false;
    for (const placedPoly of placedRenderedPolygons) {
      for (const poly of transformedPolygons) {
        if (doPolygonsCollide(poly, placedPoly, 0)) {
          hasCollision = true;
          break;
        }
      }
      if (hasCollision) break;
    }
    if (hasCollision) continue;

    // 배치 추가
    placements.push({
      designId: design.id,
      x: position.x,
      y: position.y,
      rotation: (rotation % 360) as 0 | 90 | 180 | 270,
    });

    // NFP 계산용 저장 (원점 기준 폴리곤 + 위치)
    placedParts.push({
      polygon: rotatedPart,
      position: position,
    });

    // 충돌 검사용 저장 (실제 렌더링 폴리곤)
    for (const poly of transformedPolygons) {
      placedRenderedPolygons.push(poly);
    }
  }

  return {
    fitness: placements.length,
    placements,
  };
}

/**
 * GA 기반 NFP 네스팅
 */
export async function nestWithGA(
  design: Design,
  paperBounds: BoundingBox,
  margin: number,
  config: Partial<GAConfig> = {},
  onProgress?: GAProgressCallback
): Promise<{ placements: Placement[]; efficiency: number; generations: number }> {
  const gaConfig = { ...DEFAULT_GA_CONFIG, ...config };

  if (!isNFPGeneratorReady()) {
    await initNFPGenerator();
  }

  // 여백 적용된 bin
  const effectiveBounds: BoundingBox = {
    x: margin,
    y: margin,
    width: paperBounds.width - 2 * margin,
    height: paperBounds.height - 2 * margin,
  };

  // 메인 폴리곤
  const mainPolygon = design.polygons.reduce((largest, poly) =>
    poly.length > largest.length ? poly : largest, design.polygons[0]);

  const normalizedPart = normalizePolygonToOrigin(mainPolygon);
  const partId = getShapeId(normalizedPart);

  // 최대 배치 개수 추정
  const maxPlacements = Math.ceil(
    (effectiveBounds.width * effectiveBounds.height) / design.area
  );

  // 초기 개체군 생성
  let population: Chromosome[] = [];
  for (let i = 0; i < gaConfig.populationSize; i++) {
    population.push(createRandomChromosome(maxPlacements, gaConfig.rotationAngles));
  }

  // 적합도 평가
  for (const chromosome of population) {
    const result = evaluateFitness(
      chromosome, normalizedPart, partId, design,
      effectiveBounds, paperBounds, margin
    );
    chromosome.fitness = result.fitness;
  }

  // 최고 염색체 추적
  let bestChromosome = population.reduce((best, c) =>
    c.fitness > best.fitness ? c : best, population[0]);

  // 세대 진화
  for (let gen = 0; gen < gaConfig.generations; gen++) {
    // 진행률 콜백
    if (onProgress) {
      onProgress(gen, bestChromosome.fitness, `세대 ${gen + 1}/${gaConfig.generations}`);
    }

    // 정렬 (적합도 높은 순)
    population.sort((a, b) => b.fitness - a.fitness);

    // 새 개체군
    const newPopulation: Chromosome[] = [];

    // 엘리트 보존
    for (let i = 0; i < gaConfig.eliteCount && i < population.length; i++) {
      newPopulation.push({
        order: [...population[i].order],
        genes: population[i].genes.map(g => ({ ...g })),
        fitness: population[i].fitness,
      });
    }

    // 교차 및 돌연변이로 새 개체 생성
    while (newPopulation.length < gaConfig.populationSize) {
      const parent1 = tournamentSelect(population, gaConfig.tournamentSize);
      const parent2 = tournamentSelect(population, gaConfig.tournamentSize);

      let child1: Chromosome, child2: Chromosome;

      if (Math.random() < gaConfig.crossoverRate) {
        [child1, child2] = orderCrossover(parent1, parent2, gaConfig.rotationAngles);
      } else {
        child1 = {
          order: [...parent1.order],
          genes: parent1.genes.map(g => ({ ...g })),
          fitness: 0,
        };
        child2 = {
          order: [...parent2.order],
          genes: parent2.genes.map(g => ({ ...g })),
          fitness: 0,
        };
      }

      mutate(child1, gaConfig.mutationRate, gaConfig.rotationAngles);
      mutate(child2, gaConfig.mutationRate, gaConfig.rotationAngles);

      newPopulation.push(child1);
      if (newPopulation.length < gaConfig.populationSize) {
        newPopulation.push(child2);
      }
    }

    population = newPopulation;

    // 적합도 재평가
    for (const chromosome of population) {
      if (chromosome.fitness === 0) {
        const result = evaluateFitness(
          chromosome, normalizedPart, partId, design,
          effectiveBounds, paperBounds, margin
        );
        chromosome.fitness = result.fitness;
      }
    }

    // 최고 염색체 갱신
    const currentBest = population.reduce((best, c) =>
      c.fitness > best.fitness ? c : best, population[0]);

    if (currentBest.fitness > bestChromosome.fitness) {
      bestChromosome = currentBest;
    }
  }

  // 최종 결과 생성
  const finalResult = evaluateFitness(
    bestChromosome, normalizedPart, partId, design,
    effectiveBounds, paperBounds, margin
  );

  const usedArea = design.area * finalResult.placements.length;
  const paperArea = paperBounds.width * paperBounds.height;
  const efficiency = (usedArea / paperArea) * 100;

  if (onProgress) {
    onProgress(gaConfig.generations, finalResult.fitness, '완료');
  }

  return {
    placements: finalResult.placements,
    efficiency: Math.round(efficiency * 100) / 100,
    generations: gaConfig.generations,
  };
}
