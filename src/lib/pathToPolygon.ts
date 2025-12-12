import paper from 'paper';
import type { Point, Polygon } from '../types';

// Paper.js 초기화 (가상 캔버스 - 화면에 렌더링하지 않음)
let isPaperInitialized = false;

function ensurePaperSetup() {
  if (!isPaperInitialized) {
    paper.setup(new paper.Size(1000, 1000));
    isPaperInitialized = true;
  }
}

/**
 * SVG path d 속성을 폴리곤 배열로 변환
 * Paper.js를 사용하여 베지어 곡선과 아크를 선분으로 근사화
 *
 * @param pathData - SVG path의 d 속성 문자열
 * @param precision - 곡선 근사화 정밀도 (낮을수록 정밀, 기본값 0.5)
 * @returns 폴리곤 배열
 */
export function pathToPolygon(pathData: string, precision: number = 0.5): Polygon[] {
  ensurePaperSetup();

  try {
    // Paper.js Path 객체 생성
    const path = new paper.Path(pathData);

    // 곡선을 직선으로 근사화 (flatten)
    path.flatten(precision);

    // 점 배열 추출
    const points: Point[] = path.segments.map(segment => ({
      x: segment.point.x,
      y: segment.point.y,
    }));

    // 정리
    path.remove();

    if (points.length < 3) {
      return [];
    }

    return [points];
  } catch (error) {
    console.warn('pathToPolygon 오류:', error);
    return [];
  }
}

/**
 * SVG 요소에서 모든 path를 폴리곤으로 변환
 * Paper.js의 importSVG를 사용하여 transform, 중첩 그룹 등을 자동 처리
 *
 * @param svgElement - SVG DOM 요소
 * @param precision - 곡선 근사화 정밀도 (낮을수록 정밀, 기본값 0.5)
 * @returns 폴리곤 배열
 */
export function extractPolygonsFromSVG(svgElement: SVGElement, precision: number = 0.5): Polygon[] {
  ensurePaperSetup();

  const polygons: Polygon[] = [];

  try {
    // SVG를 Paper.js로 import
    // applyMatrix: true - 모든 transform을 좌표에 적용
    // insert: false - 캔버스에 추가하지 않음
    const item = paper.project.importSVG(svgElement, {
      insert: false,
      applyMatrix: true,
    });

    if (!item) {
      console.warn('SVG import 실패');
      return [];
    }

    // 재귀적으로 모든 Path 아이템 처리
    processItem(item, polygons, precision);

    // 정리
    item.remove();

  } catch (error) {
    console.warn('extractPolygonsFromSVG 오류:', error);
  }

  return polygons;
}

/**
 * Paper.js 아이템을 재귀적으로 처리하여 폴리곤 추출
 */
function processItem(item: paper.Item, polygons: Polygon[], precision: number): void {
  // 그룹이나 복합 경로인 경우 자식들 순회
  if (item.hasChildren()) {
    const children = (item as paper.Group | paper.CompoundPath).children;
    if (children) {
      for (const child of children) {
        processItem(child, polygons, precision);
      }
    }
    return;
  }

  // Path인 경우 처리
  if (item instanceof paper.Path) {
    const polygon = extractPolygonFromPath(item, precision);
    if (polygon && polygon.length >= 3) {
      polygons.push(polygon);
    }
    return;
  }

  // Shape (rect, circle, ellipse 등)인 경우 Path로 변환 후 처리
  if (item instanceof paper.Shape) {
    const pathItem = item.toPath(false); // insert: false
    if (pathItem) {
      const polygon = extractPolygonFromPath(pathItem, precision);
      if (polygon && polygon.length >= 3) {
        polygons.push(polygon);
      }
      pathItem.remove();
    }
  }
}

/**
 * Paper.js Path에서 폴리곤 추출
 */
function extractPolygonFromPath(path: paper.Path, precision: number): Polygon | null {
  try {
    // 원본을 변경하지 않기 위해 복제
    const clonedPath = path.clone() as paper.Path;

    // 곡선을 직선으로 근사화
    clonedPath.flatten(precision);

    // 점 배열 추출
    const points: Point[] = clonedPath.segments.map(segment => ({
      x: segment.point.x,
      y: segment.point.y,
    }));

    // 정리
    clonedPath.remove();

    return points.length >= 3 ? points : null;
  } catch (error) {
    console.warn('extractPolygonFromPath 오류:', error);
    return null;
  }
}
