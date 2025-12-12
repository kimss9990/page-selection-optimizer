# Nesting Algorithm Improvement Roadmap

## 현재 완료된 작업

### Phase 1: 기반 성능 최적화 ✅
- [x] Clipper Path 캐싱
- [x] 바운딩 박스 사전 필터링
- [x] 적응형 그리드 탐색

### Phase 4: Web Worker & UX ✅
- [x] Web Worker로 네스팅 연산 분리
- [x] 진행률 표시 UI
- [x] 취소 기능

---

## 진행 예정 작업

### Step 1: True NFP (Minkowski Sum) 🔄
**목표:** 바운딩박스 근사치 → 정확한 NFP 계산

**작업 내용:**
- [ ] `js-angusj-clipper`의 `minkowskiSum` 함수 검증
- [ ] NFP 생성 함수 구현: `NFP(A,B) = A ⊕ (-B)`
- [ ] IFP (Inner Fit Polygon) 구현: 컨테이너 내부 배치 가능 영역
- [ ] NFP 캐싱 시스템: `Map<"ShapeA-ShapeB-Rotation", NFP>`
- [ ] 시각화로 NFP 정확성 검증

**핵심 코드:**
```typescript
// NFP 계산
const negativeMovingPoly = movingPoly.map(p => ({ x: -p.x, y: -p.y }));
const nfp = clipper.minkowskiSum(fixedPoly, negativeMovingPoly, true);
```

---

### Step 2: NFP 기반 Bottom-Left 배치
**목표:** 그리드 탐색 → NFP 경계선 기반 정확한 배치

**작업 내용:**
- [ ] Bottom-Left Fill (BLF) 알고리즘 구현
- [ ] NFP Union으로 배치 불가 영역 계산
- [ ] NFP 경계선에서 최적 위치 탐색
- [ ] GA 없이 고정 순서로 먼저 검증

**알고리즘:**
1. 첫 번째 도형을 좌하단에 배치
2. 두 번째 도형 배치 시:
   - 기존 도형들과의 NFP를 Union
   - 합쳐진 NFP 외곽선에서 가장 좌하단 점 찾기
3. 반복

---

### Step 3: Genetic Algorithm 통합
**목표:** 브루트포스 → 전역 최적화

**유전자 구조:**
```typescript
interface Individual {
  sequence: number[];   // 도형 배치 순서 [3, 1, 5, 2, 4]
  rotations: number[];  // 각 도형 회전 각도 [90, 0, 15, 270, 45]
  fitness: number;
}
```

**작업 내용:**
- [ ] 초기 집단 생성 (순서 랜덤 + 회전 이산화 45도/90도)
- [ ] 선택 (Selection): 토너먼트 or 룰렛
- [ ] 교차 (Crossover): Order Crossover (OX) - 순서 기반 필수
- [ ] 변이 (Mutation): 순서 swap + 각도 미세 조정 (±5도)
- [ ] 적합도 함수: 배치 개수 + 효율성

**세밀한 회전 전략:**
- 초기: 45도/90도 단위 (8~4개 옵션)
- 수렴 후: 미세 조정 (±5도 변이)
- Lazy NFP 계산: 필요한 각도만 계산 후 캐시

---

## 아키텍처 원칙

### 1. 위치는 직접 탐색하지 않는다
```
❌ 유전자 = [x1, y1, x2, y2, ...]  → 99% 무효해
✅ 유전자 = [순서, 각도]  → BLF가 위치 결정
```

### 2. NFP 캐싱 필수
```typescript
// 캐시 키 예시
const cacheKey = `${shapeA.id}-${shapeB.id}-${rotation}`;
nfpCache.set(cacheKey, computedNFP);
```

### 3. Lazy Calculation
- 360도 전부 미리 계산 불가능
- GA가 특정 각도 시도할 때 NFP 없으면 그때 계산

---

## 참고 자료

- **SVGnest**: https://github.com/Jack000/SVGnest (GA + NFP 조합)
- **Deepnest**: https://github.com/nicholaslu/Deepnest (산업용)
- **js-angusj-clipper**: Minkowski Sum 제공

---

## 진행 상태

| Step | 상태 | 예상 효과 |
|------|-----|----------|
| Step 1: True NFP | 🔄 진행 예정 | 도형 맞물림 정확도 ↑ |
| Step 2: BLF | ⏳ 대기 | 배치 정확도 ↑ |
| Step 3: GA | ⏳ 대기 | 전역 최적해 + 세밀 회전 |

---

*마지막 업데이트: 2025-12-12*
