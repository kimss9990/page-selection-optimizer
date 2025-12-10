// 좌표 관련 타입
export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 폴리곤 (SVG path를 변환한 결과)
export type Polygon = Point[];

// 종이 관련 타입
export interface Paper {
  id: string;
  name: string;
  width: number;   // mm
  height: number;  // mm
  category: string;
}

// 도면 관련 타입
export interface Design {
  id: string;
  name: string;
  svgContent: string;
  viewBox: BoundingBox;
  boundingBox: BoundingBox;
  polygons: Polygon[];  // 실제 윤곽선들
  area: number;         // 실제 면적 (mm²)
}

// 배치 관련 타입
export interface Placement {
  designId: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
}

// 네스팅 결과 타입
export interface NestingResult {
  paperId: string;
  paperName: string;
  paperWidth: number;
  paperHeight: number;
  placements: Placement[];
  count: number;          // 배치된 도면 개수
  efficiency: number;     // 효율 (0-100)
  usedArea: number;       // 사용된 면적 (mm²)
  wastedArea: number;     // 버려지는 면적 (mm²)
  warning: boolean;       // 여백 3mm 미만 경고
}

// 앱 상태 타입
export interface AppState {
  // 설정
  margin: number;           // 여백 (mm)
  selectedPapers: string[]; // 선택된 종이 ID 목록

  // 도면
  design: Design | null;

  // 결과
  results: NestingResult[];
  selectedResultIndex: number;

  // 캔버스 상태
  canvasZoom: number;
  canvasPan: Point;

  // 수동 조정 상태
  manualPlacements: Placement[];
  isManualMode: boolean;
}

// 액션 타입
export interface AppActions {
  setMargin: (margin: number) => void;
  setSelectedPapers: (papers: string[]) => void;
  togglePaper: (paperId: string) => void;
  setDesign: (design: Design | null) => void;
  setResults: (results: NestingResult[]) => void;
  selectResult: (index: number) => void;
  setCanvasZoom: (zoom: number) => void;
  setCanvasPan: (pan: Point) => void;
  setManualPlacements: (placements: Placement[]) => void;
  updateManualPlacement: (index: number, placement: Partial<Placement>) => void;
  toggleManualMode: () => void;
  reset: () => void;
}
