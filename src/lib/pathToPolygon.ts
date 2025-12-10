import type { Point, Polygon } from '../types';

/**
 * SVG path 명령어 토큰
 */
interface PathCommand {
  type: string;
  values: number[];
}

/**
 * SVG path d 속성을 폴리곤 배열로 변환
 * Bezier 곡선은 선분으로 근사화
 */
export function pathToPolygon(pathData: string, precision: number = 10): Polygon[] {
  const commands = parsePath(pathData);
  const polygons: Polygon[] = [];
  let currentPolygon: Point[] = [];
  let currentPoint: Point = { x: 0, y: 0 };
  let startPoint: Point = { x: 0, y: 0 };

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M': // Move to (absolute)
        if (currentPolygon.length > 0) {
          polygons.push(currentPolygon);
          currentPolygon = [];
        }
        currentPoint = { x: cmd.values[0], y: cmd.values[1] };
        startPoint = { ...currentPoint };
        currentPolygon.push({ ...currentPoint });
        break;

      case 'm': // Move to (relative)
        if (currentPolygon.length > 0) {
          polygons.push(currentPolygon);
          currentPolygon = [];
        }
        currentPoint = { x: currentPoint.x + cmd.values[0], y: currentPoint.y + cmd.values[1] };
        startPoint = { ...currentPoint };
        currentPolygon.push({ ...currentPoint });
        break;

      case 'L': // Line to (absolute)
        currentPoint = { x: cmd.values[0], y: cmd.values[1] };
        currentPolygon.push({ ...currentPoint });
        break;

      case 'l': // Line to (relative)
        currentPoint = { x: currentPoint.x + cmd.values[0], y: currentPoint.y + cmd.values[1] };
        currentPolygon.push({ ...currentPoint });
        break;

      case 'H': // Horizontal line (absolute)
        currentPoint = { x: cmd.values[0], y: currentPoint.y };
        currentPolygon.push({ ...currentPoint });
        break;

      case 'h': // Horizontal line (relative)
        currentPoint = { x: currentPoint.x + cmd.values[0], y: currentPoint.y };
        currentPolygon.push({ ...currentPoint });
        break;

      case 'V': // Vertical line (absolute)
        currentPoint = { x: currentPoint.x, y: cmd.values[0] };
        currentPolygon.push({ ...currentPoint });
        break;

      case 'v': // Vertical line (relative)
        currentPoint = { x: currentPoint.x, y: currentPoint.y + cmd.values[0] };
        currentPolygon.push({ ...currentPoint });
        break;

      case 'C': // Cubic Bezier (absolute)
        {
          const p0 = currentPoint;
          const p1 = { x: cmd.values[0], y: cmd.values[1] };
          const p2 = { x: cmd.values[2], y: cmd.values[3] };
          const p3 = { x: cmd.values[4], y: cmd.values[5] };
          const bezierPoints = cubicBezierToPoints(p0, p1, p2, p3, precision);
          currentPolygon.push(...bezierPoints.slice(1));
          currentPoint = p3;
        }
        break;

      case 'c': // Cubic Bezier (relative)
        {
          const p0 = currentPoint;
          const p1 = { x: currentPoint.x + cmd.values[0], y: currentPoint.y + cmd.values[1] };
          const p2 = { x: currentPoint.x + cmd.values[2], y: currentPoint.y + cmd.values[3] };
          const p3 = { x: currentPoint.x + cmd.values[4], y: currentPoint.y + cmd.values[5] };
          const bezierPoints = cubicBezierToPoints(p0, p1, p2, p3, precision);
          currentPolygon.push(...bezierPoints.slice(1));
          currentPoint = p3;
        }
        break;

      case 'Q': // Quadratic Bezier (absolute)
        {
          const p0 = currentPoint;
          const p1 = { x: cmd.values[0], y: cmd.values[1] };
          const p2 = { x: cmd.values[2], y: cmd.values[3] };
          const bezierPoints = quadraticBezierToPoints(p0, p1, p2, precision);
          currentPolygon.push(...bezierPoints.slice(1));
          currentPoint = p2;
        }
        break;

      case 'q': // Quadratic Bezier (relative)
        {
          const p0 = currentPoint;
          const p1 = { x: currentPoint.x + cmd.values[0], y: currentPoint.y + cmd.values[1] };
          const p2 = { x: currentPoint.x + cmd.values[2], y: currentPoint.y + cmd.values[3] };
          const bezierPoints = quadraticBezierToPoints(p0, p1, p2, precision);
          currentPolygon.push(...bezierPoints.slice(1));
          currentPoint = p2;
        }
        break;

      case 'A': // Arc (absolute)
        {
          const arcPoints = arcToPoints(
            currentPoint,
            { x: cmd.values[5], y: cmd.values[6] },
            cmd.values[0],
            cmd.values[1],
            cmd.values[2],
            cmd.values[3] === 1,
            cmd.values[4] === 1,
            precision
          );
          currentPolygon.push(...arcPoints.slice(1));
          currentPoint = { x: cmd.values[5], y: cmd.values[6] };
        }
        break;

      case 'a': // Arc (relative)
        {
          const endPoint = { x: currentPoint.x + cmd.values[5], y: currentPoint.y + cmd.values[6] };
          const arcPoints = arcToPoints(
            currentPoint,
            endPoint,
            cmd.values[0],
            cmd.values[1],
            cmd.values[2],
            cmd.values[3] === 1,
            cmd.values[4] === 1,
            precision
          );
          currentPolygon.push(...arcPoints.slice(1));
          currentPoint = endPoint;
        }
        break;

      case 'Z':
      case 'z': // Close path
        if (currentPolygon.length > 0) {
          currentPoint = startPoint;
          polygons.push(currentPolygon);
          currentPolygon = [];
        }
        break;
    }
  }

  if (currentPolygon.length > 0) {
    polygons.push(currentPolygon);
  }

  return polygons;
}

/**
 * SVG path d 속성을 파싱하여 명령어 배열로 변환
 */
function parsePath(pathData: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const regex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;

  let match;
  while ((match = regex.exec(pathData)) !== null) {
    const type = match[1];
    const valuesStr = match[2].trim();

    if (type === 'Z' || type === 'z') {
      commands.push({ type, values: [] });
      continue;
    }

    const values = valuesStr
      .split(/[\s,]+/)
      .map(Number)
      .filter(n => !isNaN(n));

    // Handle multiple coordinate pairs for same command
    const expectedValues = getExpectedValues(type);
    if (expectedValues > 0 && values.length > expectedValues) {
      for (let i = 0; i < values.length; i += expectedValues) {
        commands.push({
          type: i === 0 ? type : (type === 'M' ? 'L' : type === 'm' ? 'l' : type),
          values: values.slice(i, i + expectedValues),
        });
      }
    } else {
      commands.push({ type, values });
    }
  }

  return commands;
}

/**
 * 명령어별 예상 값 개수
 */
function getExpectedValues(type: string): number {
  switch (type.toUpperCase()) {
    case 'M':
    case 'L':
    case 'T':
      return 2;
    case 'H':
    case 'V':
      return 1;
    case 'S':
    case 'Q':
      return 4;
    case 'C':
      return 6;
    case 'A':
      return 7;
    default:
      return 0;
  }
}

/**
 * 3차 베지어 곡선을 점 배열로 변환 (de Casteljau 알고리즘)
 */
function cubicBezierToPoints(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  segments: number
): Point[] {
  const points: Point[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    points.push({
      x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
      y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
    });
  }

  return points;
}

/**
 * 2차 베지어 곡선을 점 배열로 변환
 */
function quadraticBezierToPoints(
  p0: Point,
  p1: Point,
  p2: Point,
  segments: number
): Point[] {
  const points: Point[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;

    points.push({
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    });
  }

  return points;
}

/**
 * 타원 호를 점 배열로 변환
 */
function arcToPoints(
  start: Point,
  end: Point,
  rx: number,
  ry: number,
  xAxisRotation: number,
  largeArcFlag: boolean,
  sweepFlag: boolean,
  segments: number
): Point[] {
  // 시작점과 끝점이 같으면 빈 배열 반환
  if (start.x === end.x && start.y === end.y) {
    return [start];
  }

  // 반지름이 0이면 직선으로 처리
  if (rx === 0 || ry === 0) {
    return [start, end];
  }

  // 라디안으로 변환
  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // 중점 좌표계로 변환
  const dx = (start.x - end.x) / 2;
  const dy = (start.y - end.y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // 반지름 보정
  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  // 중심점 계산
  let sq = (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq);
  sq = sq < 0 ? 0 : sq;
  const coef = (largeArcFlag !== sweepFlag ? 1 : -1) * Math.sqrt(sq);
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);

  // 원래 좌표계로 변환
  const cx = cosPhi * cxp - sinPhi * cyp + (start.x + end.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (start.y + end.y) / 2;

  // 각도 계산
  const theta1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
  let dtheta = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx) - theta1;

  if (sweepFlag && dtheta < 0) {
    dtheta += 2 * Math.PI;
  } else if (!sweepFlag && dtheta > 0) {
    dtheta -= 2 * Math.PI;
  }

  // 점 배열 생성
  const points: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = theta1 + t * dtheta;
    const x = cx + rx * Math.cos(angle) * cosPhi - ry * Math.sin(angle) * sinPhi;
    const y = cy + rx * Math.cos(angle) * sinPhi + ry * Math.sin(angle) * cosPhi;
    points.push({ x, y });
  }

  return points;
}

/**
 * SVG 요소에서 모든 path를 폴리곤으로 변환
 */
export function extractPolygonsFromSVG(svgElement: SVGElement, precision: number = 10): Polygon[] {
  const polygons: Polygon[] = [];

  // path 요소 처리
  const paths = svgElement.querySelectorAll('path');
  paths.forEach(path => {
    const d = path.getAttribute('d');
    if (d) {
      polygons.push(...pathToPolygon(d, precision));
    }
  });

  // polygon 요소 처리
  const polygonElements = svgElement.querySelectorAll('polygon');
  polygonElements.forEach(poly => {
    const points = poly.getAttribute('points');
    if (points) {
      const polygon = parsePolygonPoints(points);
      if (polygon.length > 0) {
        polygons.push(polygon);
      }
    }
  });

  // polyline 요소 처리
  const polylines = svgElement.querySelectorAll('polyline');
  polylines.forEach(polyline => {
    const points = polyline.getAttribute('points');
    if (points) {
      const polygon = parsePolygonPoints(points);
      if (polygon.length > 0) {
        polygons.push(polygon);
      }
    }
  });

  // rect 요소 처리
  const rects = svgElement.querySelectorAll('rect');
  rects.forEach(rect => {
    const x = parseFloat(rect.getAttribute('x') || '0');
    const y = parseFloat(rect.getAttribute('y') || '0');
    const width = parseFloat(rect.getAttribute('width') || '0');
    const height = parseFloat(rect.getAttribute('height') || '0');

    if (width > 0 && height > 0) {
      polygons.push([
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ]);
    }
  });

  // circle 요소 처리
  const circles = svgElement.querySelectorAll('circle');
  circles.forEach(circle => {
    const cx = parseFloat(circle.getAttribute('cx') || '0');
    const cy = parseFloat(circle.getAttribute('cy') || '0');
    const r = parseFloat(circle.getAttribute('r') || '0');

    if (r > 0) {
      polygons.push(circleToPolygon(cx, cy, r, precision * 2));
    }
  });

  // ellipse 요소 처리
  const ellipses = svgElement.querySelectorAll('ellipse');
  ellipses.forEach(ellipse => {
    const cx = parseFloat(ellipse.getAttribute('cx') || '0');
    const cy = parseFloat(ellipse.getAttribute('cy') || '0');
    const rx = parseFloat(ellipse.getAttribute('rx') || '0');
    const ry = parseFloat(ellipse.getAttribute('ry') || '0');

    if (rx > 0 && ry > 0) {
      polygons.push(ellipseToPolygon(cx, cy, rx, ry, precision * 2));
    }
  });

  return polygons;
}

/**
 * SVG polygon/polyline의 points 속성 파싱
 */
function parsePolygonPoints(pointsStr: string): Polygon {
  const values = pointsStr
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter(n => !isNaN(n));

  const points: Point[] = [];
  for (let i = 0; i < values.length - 1; i += 2) {
    points.push({ x: values[i], y: values[i + 1] });
  }

  return points;
}

/**
 * 원을 폴리곤으로 변환
 */
function circleToPolygon(cx: number, cy: number, r: number, segments: number): Polygon {
  const points: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  return points;
}

/**
 * 타원을 폴리곤으로 변환
 */
function ellipseToPolygon(cx: number, cy: number, rx: number, ry: number, segments: number): Polygon {
  const points: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    points.push({
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    });
  }
  return points;
}
