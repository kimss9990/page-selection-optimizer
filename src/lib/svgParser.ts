import type { Design, BoundingBox, Polygon } from '../types';
import { extractPolygonsFromSVG } from './pathToPolygon';
import { getPolygonsBoundingBox, getPolygonArea } from './geometryUtils';

/**
 * SVG 파일 내용을 파싱하여 Design 객체로 변환
 */
export async function parseSVGFile(file: File): Promise<Design> {
  const content = await file.text();
  return parseSVGContent(content, file.name);
}

/**
 * SVG 문자열을 파싱하여 Design 객체로 변환
 */
export function parseSVGContent(svgContent: string, name: string = 'design'): Design {
  // SVG 파싱
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');

  // 파싱 에러 확인
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('SVG 파싱 오류: ' + parseError.textContent);
  }

  const svgElement = doc.querySelector('svg');
  if (!svgElement) {
    throw new Error('SVG 요소를 찾을 수 없습니다.');
  }

  // viewBox 추출
  const viewBox = parseViewBox(svgElement);

  // 폴리곤 추출 (SVG의 모든 도형 요소를 폴리곤으로 변환)
  const polygons = extractPolygonsFromSVG(svgElement, 20);

  if (polygons.length === 0) {
    throw new Error('SVG에서 도형을 찾을 수 없습니다.');
  }

  // 전체 바운딩 박스 계산 (음수 좌표 포함)
  const rawBoundingBox = getPolygonsBoundingBox(polygons);

  // 모든 폴리곤을 동일한 오프셋으로 정규화 (원점 기준)
  // 상대 위치 유지
  const offsetX = rawBoundingBox.x;
  const offsetY = rawBoundingBox.y;
  const normalizedPolygons = polygons.map(poly =>
    poly.map(p => ({ x: p.x - offsetX, y: p.y - offsetY }))
  );

  // 정규화된 바운딩 박스 (원점에서 시작)
  const boundingBox = {
    x: 0,
    y: 0,
    width: rawBoundingBox.width,
    height: rawBoundingBox.height,
  };

  // 총 면적 계산
  const totalArea = normalizedPolygons.reduce((sum, poly) => sum + getPolygonArea(poly), 0);

  return {
    id: generateId(),
    name: name.replace(/\.svg$/i, ''),
    svgContent,
    viewBox,
    boundingBox,
    polygons: normalizedPolygons,
    area: totalArea,
  };
}

/**
 * SVG viewBox 속성 파싱
 */
function parseViewBox(svgElement: SVGSVGElement): BoundingBox {
  const viewBoxAttr = svgElement.getAttribute('viewBox');

  if (viewBoxAttr) {
    const parts = viewBoxAttr.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(n => !isNaN(n))) {
      return {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3],
      };
    }
  }

  // viewBox가 없으면 width/height 속성 사용
  const width = parseFloat(svgElement.getAttribute('width') || '100');
  const height = parseFloat(svgElement.getAttribute('height') || '100');

  return { x: 0, y: 0, width, height };
}

/**
 * 고유 ID 생성
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * SVG 콘텐츠에서 단위 추출 (mm, cm, px 등)
 */
export function getSVGUnit(svgContent: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svgElement = doc.querySelector('svg');

  if (!svgElement) return 'px';

  const width = svgElement.getAttribute('width') || '';
  const match = width.match(/[a-z]+$/i);

  return match ? match[0].toLowerCase() : 'px';
}

/**
 * 단위를 mm로 변환하는 스케일 팩터
 */
export function getUnitScale(unit: string): number {
  switch (unit.toLowerCase()) {
    case 'mm':
      return 1;
    case 'cm':
      return 10;
    case 'in':
      return 25.4;
    case 'pt':
      return 25.4 / 72;
    case 'pc':
      return 25.4 / 6;
    case 'px':
    default:
      // 기본 96 DPI 가정
      return 25.4 / 96;
  }
}

/**
 * Design의 폴리곤을 특정 스케일로 변환
 */
export function scaleDesign(design: Design, scale: number): Design {
  return {
    ...design,
    boundingBox: {
      ...design.boundingBox,
      x: design.boundingBox.x * scale,
      y: design.boundingBox.y * scale,
      width: design.boundingBox.width * scale,
      height: design.boundingBox.height * scale,
    },
    viewBox: {
      ...design.viewBox,
      x: design.viewBox.x * scale,
      y: design.viewBox.y * scale,
      width: design.viewBox.width * scale,
      height: design.viewBox.height * scale,
    },
    polygons: design.polygons.map(poly =>
      poly.map(p => ({ x: p.x * scale, y: p.y * scale }))
    ),
    area: design.area * scale * scale,
  };
}

/**
 * 폴리곤을 SVG path 문자열로 변환 (시각화용)
 */
export function polygonToSVGPath(polygon: Polygon): string {
  if (polygon.length === 0) return '';

  const commands = polygon.map((p, i) => {
    const cmd = i === 0 ? 'M' : 'L';
    return `${cmd}${p.x},${p.y}`;
  });

  return commands.join(' ') + ' Z';
}

/**
 * 여러 폴리곤을 SVG path 문자열로 변환
 */
export function polygonsToSVGPath(polygons: Polygon[]): string {
  return polygons.map(polygonToSVGPath).join(' ');
}
