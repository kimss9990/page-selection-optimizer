/**
 * NFP 알고리즘 통합 테스트
 *
 * 브라우저 렌더링(DesignLayer.tsx)과 동일한 변환 로직으로 검증
 * 좌표계 불일치를 방지하는 End-to-End 테스트
 *
 * 실행: npx tsx scripts/test-nfp.ts
 */

import type { BoundingBox, Design, Placement, Polygon, Point } from '../src/types';
import { initNFPPlacer, nestWithNFP } from '../src/lib/nfpPlacer';
import { rotatePolygon, translatePolygon, getPolygonsBoundingBox } from '../src/lib/geometryUtils';
import { doPolygonsCollide } from '../src/lib/collisionDetection';

// ============================================================
// 브라우저 렌더링과 동일한 변환 로직 (DesignLayer.tsx에서 복사)
// ============================================================

function getTransformedPolygons(design: Design, placement: Placement): Polygon[] {
  const center: Point = {
    x: design.boundingBox.width / 2,
    y: design.boundingBox.height / 2,
  };
  return design.polygons.map(poly => {
    let transformed = rotatePolygon(poly, placement.rotation, center);
    transformed = translatePolygon(transformed, placement.x, placement.y);
    return transformed;
  });
}

function isPolygonInsideBounds(polygon: Polygon, bounds: BoundingBox, margin: number): boolean {
  for (const point of polygon) {
    if (point.x < bounds.x + margin ||
        point.x > bounds.x + bounds.width - margin ||
        point.y < bounds.y + margin ||
        point.y > bounds.y + bounds.height - margin) {
      return false;
    }
  }
  return true;
}

// ============================================================
// 테스트 데이터
// ============================================================

// sample-box.svg L자형
const sampleBoxPolygon: Polygon = [
  { x: 10, y: 10 },
  { x: 190, y: 10 },
  { x: 190, y: 60 },
  { x: 140, y: 60 },
  { x: 140, y: 140 },
  { x: 10, y: 140 },
];

// 단순 사각형
const rectanglePolygon: Polygon = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
  { x: 0, y: 50 },
];

// L자형 (원점 시작)
const lShapePolygon: Polygon = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 30 },
  { x: 30, y: 30 },
  { x: 30, y: 60 },
  { x: 0, y: 60 },
];

function getPolygonArea(polygon: Polygon): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return Math.abs(area / 2);
}

function createDesign(id: string, name: string, polygon: Polygon): Design {
  const bbox = getPolygonsBoundingBox([polygon]);
  return {
    id,
    name,
    svgContent: '',
    viewBox: bbox,
    boundingBox: bbox,
    polygons: [polygon],
    area: getPolygonArea(polygon),
  };
}

// ============================================================
// 검증 함수들
// ============================================================

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validatePlacements(
  design: Design,
  placements: Placement[],
  paperBounds: BoundingBox,
  margin: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. 각 배치가 경계 안에 있는지 검증
  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    const transformedPolygons = getTransformedPolygons(design, placement);

    for (const poly of transformedPolygons) {
      if (!isPolygonInsideBounds(poly, paperBounds, margin)) {
        const bbox = getPolygonsBoundingBox([poly]);
        errors.push(
          `배치 #${i + 1} 경계 초과: ` +
          `bbox(${bbox.x.toFixed(1)}, ${bbox.y.toFixed(1)}, ` +
          `${(bbox.x + bbox.width).toFixed(1)}, ${(bbox.y + bbox.height).toFixed(1)}) ` +
          `vs paper(${margin}, ${margin}, ` +
          `${paperBounds.width - margin}, ${paperBounds.height - margin})`
        );
      }
    }
  }

  // 2. 배치 간 충돌 검증
  for (let i = 0; i < placements.length; i++) {
    const polysA = getTransformedPolygons(design, placements[i]);

    for (let j = i + 1; j < placements.length; j++) {
      const polysB = getTransformedPolygons(design, placements[j]);

      for (const polyA of polysA) {
        for (const polyB of polysB) {
          if (doPolygonsCollide(polyA, polyB, 0)) {
            errors.push(`배치 #${i + 1}과 #${j + 1} 충돌`);
          }
        }
      }
    }
  }

  // 3. 배치 간 margin 검증
  for (let i = 0; i < placements.length; i++) {
    const polysA = getTransformedPolygons(design, placements[i]);

    for (let j = i + 1; j < placements.length; j++) {
      const polysB = getTransformedPolygons(design, placements[j]);

      for (const polyA of polysA) {
        for (const polyB of polysB) {
          if (doPolygonsCollide(polyA, polyB, margin * 0.9)) {
            warnings.push(`배치 #${i + 1}과 #${j + 1} margin(${margin}mm) 미만 간격`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================
// 테스트 케이스들
// ============================================================

interface TestCase {
  name: string;
  design: Design;
  paper: { name: string; width: number; height: number };
  margin: number;
  minExpectedPlacements: number;
}

const testCases: TestCase[] = [
  {
    name: 'sample-box on B1',
    design: createDesign('sample-box', 'Sample Box', sampleBoxPolygon),
    paper: { name: 'B1', width: 728, height: 1030 },
    margin: 3,
    minExpectedPlacements: 20,
  },
  {
    name: 'sample-box on B2',
    design: createDesign('sample-box', 'Sample Box', sampleBoxPolygon),
    paper: { name: 'B2', width: 515, height: 728 },
    margin: 3,
    minExpectedPlacements: 10,
  },
  {
    name: 'rectangle on A3',
    design: createDesign('rectangle', 'Rectangle', rectanglePolygon),
    paper: { name: 'A3', width: 297, height: 420 },
    margin: 3,
    minExpectedPlacements: 15,
  },
  {
    name: 'L-shape on A2',
    design: createDesign('l-shape', 'L-Shape', lShapePolygon),
    paper: { name: 'A2', width: 420, height: 594 },
    margin: 3,
    minExpectedPlacements: 30,
  },
];

// ============================================================
// 메인 테스트 실행
// ============================================================

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          NFP 통합 테스트 (브라우저 렌더링 검증)            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  await initNFPPlacer();
  console.log('✓ NFP Placer 초기화 완료\n');

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    totalTests++;
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`테스트: ${testCase.name}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const paperBounds: BoundingBox = {
      x: 0,
      y: 0,
      width: testCase.paper.width,
      height: testCase.paper.height,
    };

    console.log(`  도형: ${testCase.design.name} (${testCase.design.boundingBox.width}x${testCase.design.boundingBox.height}mm)`);
    console.log(`  종이: ${testCase.paper.name} (${testCase.paper.width}x${testCase.paper.height}mm)`);
    console.log(`  여백: ${testCase.margin}mm\n`);

    // NFP 배치 실행
    const startTime = Date.now();
    const result = await nestWithNFP(testCase.design, paperBounds, {
      margin: testCase.margin,
      rotationStep: 90,
      gridStep: 5,
    });
    const elapsed = Date.now() - startTime;

    console.log(`  배치 결과: ${result.placements.length}개 (${elapsed}ms)`);
    console.log(`  효율: ${result.efficiency}%\n`);

    // 브라우저 렌더링과 동일한 방식으로 검증
    const validation = validatePlacements(
      testCase.design,
      result.placements,
      paperBounds,
      testCase.margin
    );

    // 결과 출력
    let testPassed = true;

    if (result.placements.length < testCase.minExpectedPlacements) {
      console.log(`  ⚠ 기대 배치 수 미달: ${result.placements.length} < ${testCase.minExpectedPlacements}`);
    }

    if (validation.errors.length > 0) {
      testPassed = false;
      console.log(`  ✗ 오류 발견 (${validation.errors.length}개):`);
      validation.errors.slice(0, 5).forEach(err => console.log(`    - ${err}`));
      if (validation.errors.length > 5) {
        console.log(`    ... 외 ${validation.errors.length - 5}개`);
      }
    }

    if (validation.warnings.length > 0) {
      console.log(`  ⚠ 경고 (${validation.warnings.length}개):`);
      validation.warnings.slice(0, 3).forEach(warn => console.log(`    - ${warn}`));
      if (validation.warnings.length > 3) {
        console.log(`    ... 외 ${validation.warnings.length - 3}개`);
      }
    }

    if (testPassed && validation.valid) {
      passedTests++;
      console.log(`  ✓ 테스트 통과`);
    } else {
      failedTests++;
      console.log(`  ✗ 테스트 실패`);
    }

    console.log('');
  }

  // 최종 결과
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                      테스트 결과 요약                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`  총 테스트: ${totalTests}`);
  console.log(`  통과: ${passedTests}`);
  console.log(`  실패: ${failedTests}`);
  console.log('');

  if (failedTests > 0) {
    console.log('❌ 일부 테스트 실패 - 브라우저에서 문제가 발생할 수 있습니다.');
    process.exit(1);
  } else {
    console.log('✅ 모든 테스트 통과 - 브라우저에서 정상 동작할 것입니다.');
    process.exit(0);
  }
}

// 실행
runTests().catch(err => {
  console.error('테스트 실행 오류:', err);
  process.exit(1);
});
