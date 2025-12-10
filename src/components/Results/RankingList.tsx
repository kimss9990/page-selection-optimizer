import { useAppStore } from '../../stores/appStore';

export function RankingList() {
  const results = useAppStore(state => state.results);
  const selectedResultIndex = useAppStore(state => state.selectedResultIndex);
  const selectResult = useAppStore(state => state.selectResult);
  const isManualMode = useAppStore(state => state.isManualMode);
  const toggleManualMode = useAppStore(state => state.toggleManualMode);

  if (results.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-800 mb-3">결과 순위</h3>
        <p className="text-sm text-gray-500 text-center py-4">
          분석 결과가 없습니다
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">결과 순위</h3>
        <span className="text-xs text-gray-500">효율 순</span>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {results.map((result, index) => {
          const isSelected = index === selectedResultIndex;
          return (
            <button
              key={result.paperId}
              onClick={() => selectResult(index)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${
                    index === 0 ? 'text-yellow-500' :
                    index === 1 ? 'text-gray-400' :
                    index === 2 ? 'text-amber-600' : 'text-gray-400'
                  }`}>
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium text-gray-800">{result.paperName}</p>
                    <p className="text-xs text-gray-500">
                      {result.paperWidth} x {result.paperHeight}mm
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${
                    result.efficiency >= 70 ? 'text-green-600' :
                    result.efficiency >= 50 ? 'text-yellow-600' : 'text-red-500'
                  }`}>
                    {result.efficiency.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-500">
                    {result.count}개 배치
                  </p>
                </div>
              </div>

              {result.warning && (
                <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span>여백 3mm 미만 (주의 필요)</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 선택된 결과 상세 */}
      {results[selectedResultIndex] && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2">상세 정보</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">사용 면적</span>
              <span className="text-gray-800">
                {(results[selectedResultIndex].usedArea / 100).toFixed(1)} cm²
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">손실 면적</span>
              <span className="text-gray-800">
                {(results[selectedResultIndex].wastedArea / 100).toFixed(1)} cm²
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">손실률</span>
              <span className="text-gray-800">
                {(100 - results[selectedResultIndex].efficiency).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* 수동 모드 토글 */}
          <button
            onClick={toggleManualMode}
            className={`mt-4 w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              isManualMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {isManualMode ? '수동 조정 중' : '수동 조정 모드'}
          </button>
        </div>
      )}
    </div>
  );
}
