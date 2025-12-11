import { useRef, useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { DesignLayer } from './DesignLayer';

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const design = useAppStore(state => state.design);
  const results = useAppStore(state => state.results);
  const selectedResultIndex = useAppStore(state => state.selectedResultIndex);
  const canvasZoom = useAppStore(state => state.canvasZoom);
  const setCanvasZoom = useAppStore(state => state.setCanvasZoom);
  const manualPlacements = useAppStore(state => state.manualPlacements);
  const setManualPlacements = useAppStore(state => state.setManualPlacements);
  const isManualMode = useAppStore(state => state.isManualMode);
  const margin = useAppStore(state => state.margin);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const selectedResult = results[selectedResultIndex];

  // 컨테이너 크기 감지
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // 줌 처리
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setCanvasZoom(canvasZoom + delta);
  }, [canvasZoom, setCanvasZoom]);

  // 원래 배치로 되돌리기 (Hook은 조건문 이전에 선언해야 함)
  const resetPlacements = useCallback(() => {
    if (selectedResult) {
      setManualPlacements([...selectedResult.placements]);
    }
  }, [selectedResult, setManualPlacements]);

  // 빈 상태
  if (!design || !selectedResult) {
    return (
      <div
        ref={containerRef}
        className="flex-1 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400"
      >
        <div className="text-center">
          <svg
            className="mx-auto h-16 w-16 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
            />
          </svg>
          <p>SVG 파일을 업로드하고 분석을 실행하세요</p>
        </div>
      </div>
    );
  }

  // 종이 크기에 맞춰 스케일 계산
  const paperWidth = selectedResult.paperWidth;
  const paperHeight = selectedResult.paperHeight;
  const padding = 40;
  const availableWidth = containerSize.width - padding * 2;
  const availableHeight = containerSize.height - padding * 2;

  const scaleX = availableWidth / paperWidth;
  const scaleY = availableHeight / paperHeight;
  const baseScale = Math.min(scaleX, scaleY, 1);
  const scale = baseScale * canvasZoom;

  const svgWidth = paperWidth * scale + padding * 2;
  const svgHeight = paperHeight * scale + padding * 2;

  // 항상 manualPlacements 사용 (수동 조정 결과 유지)
  const placements = manualPlacements;

  // 배치가 원래와 다른지 확인
  const hasChanges = JSON.stringify(manualPlacements) !== JSON.stringify(selectedResult.placements);

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-gray-100 rounded-lg overflow-auto"
      onWheel={handleWheel}
    >
      <div className="min-h-full flex items-center justify-center p-4">
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="bg-white shadow-lg rounded"
        >
          {/* 그리드 패턴 */}
          <defs>
            <pattern
              id="grid"
              width={10 * scale}
              height={10 * scale}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${10 * scale} 0 L 0 0 0 ${10 * scale}`}
                fill="none"
                stroke="#f0f0f0"
                strokeWidth="0.5"
              />
            </pattern>
            <pattern
              id="gridLarge"
              width={50 * scale}
              height={50 * scale}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${50 * scale} 0 L 0 0 0 ${50 * scale}`}
                fill="none"
                stroke="#e0e0e0"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          {/* 배경 그리드 */}
          <g transform={`translate(${padding}, ${padding})`}>
            <rect
              x="0"
              y="0"
              width={paperWidth * scale}
              height={paperHeight * scale}
              fill="url(#grid)"
            />
            <rect
              x="0"
              y="0"
              width={paperWidth * scale}
              height={paperHeight * scale}
              fill="url(#gridLarge)"
            />

            {/* 종이 영역 */}
            <rect
              x="0"
              y="0"
              width={paperWidth * scale}
              height={paperHeight * scale}
              fill="none"
              stroke="#333"
              strokeWidth="2"
            />

            {/* 종이 크기 표시 */}
            <text
              x={paperWidth * scale / 2}
              y={-10}
              textAnchor="middle"
              className="text-xs fill-gray-500"
            >
              {paperWidth}mm
            </text>
            <text
              x={-10}
              y={paperHeight * scale / 2}
              textAnchor="middle"
              className="text-xs fill-gray-500"
              transform={`rotate(-90, -10, ${paperHeight * scale / 2})`}
            >
              {paperHeight}mm
            </text>

            {/* 배치된 도면들 */}
            <DesignLayer
              design={design}
              placements={placements}
              scale={scale}
              isManualMode={isManualMode}
              paperBounds={{ x: 0, y: 0, width: paperWidth, height: paperHeight }}
              margin={margin}
            />
          </g>
        </svg>
      </div>

      {/* 하단 컨트롤 */}
      <div className="absolute bottom-4 right-4 flex items-center gap-3">
        {/* 원래대로 되돌리기 버튼 */}
        {hasChanges && (
          <button
            onClick={resetPlacements}
            className="flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg shadow px-3 py-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            원래대로
          </button>
        )}

        {/* 줌 컨트롤 */}
        <div className="flex items-center gap-2 bg-white rounded-lg shadow px-3 py-2">
          <button
            onClick={() => setCanvasZoom(canvasZoom - 0.1)}
            className="p-1 hover:bg-gray-100 rounded"
            disabled={canvasZoom <= 0.2}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="text-sm text-gray-600 min-w-[50px] text-center">
            {Math.round(canvasZoom * 100)}%
          </span>
          <button
            onClick={() => setCanvasZoom(canvasZoom + 0.1)}
            className="p-1 hover:bg-gray-100 rounded"
            disabled={canvasZoom >= 3}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
