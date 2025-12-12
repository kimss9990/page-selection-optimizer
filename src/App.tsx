import { useCallback } from 'react';
import { FileUpload } from './components/FileUpload/FileUpload';
import { PaperSelector } from './components/PaperSelector/PaperSelector';
import { Canvas } from './components/Canvas/Canvas';
import { RankingList } from './components/Results/RankingList';
import { MarginInput } from './components/Controls/MarginInput';
import { AlgorithmSelector } from './components/Controls/AlgorithmSelector';
import { useAppStore } from './stores/appStore';
import { paperPresets, getPaperById } from './lib/paperPresets';
import { useNestingWorker } from './hooks/useNestingWorker';

function App() {
  const design = useAppStore(state => state.design);
  const margin = useAppStore(state => state.margin);
  const algorithm = useAppStore(state => state.algorithm);
  const selectedPapers = useAppStore(state => state.selectedPapers);
  const setResults = useAppStore(state => state.setResults);
  const results = useAppStore(state => state.results);

  const { progress, startNesting, cancelNesting } = useNestingWorker();

  const handleAnalyze = useCallback(() => {
    if (!design) return;

    // 선택된 종이만 필터링
    const papers = selectedPapers
      .map(id => getPaperById(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    if (papers.length === 0) {
      alert('분석할 종이를 선택해주세요.');
      return;
    }

    // Web Worker로 네스팅 수행
    startNesting(
      design,
      papers,
      margin,
      algorithm,
      (nestingResults) => setResults(nestingResults),
      (error) => alert(`분석 오류: ${error}`)
    );
  }, [design, margin, algorithm, selectedPapers, setResults, startNesting]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Smart Paper Fit</h1>
            <p className="text-sm text-gray-500">패키지 디자인 용지 효율 최적화 도구</p>
          </div>
          <div className="flex items-center gap-4">
            <AlgorithmSelector />
            <MarginInput />
            {progress.isRunning ? (
              <div className="flex items-center gap-3">
                <div className="w-48">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>{progress.message}</span>
                    <span>{Math.round(progress.progress)}%</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-200"
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                </div>
                <button
                  onClick={cancelNesting}
                  className="px-4 py-2 rounded-lg font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                onClick={handleAnalyze}
                disabled={!design || selectedPapers.length === 0}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  design && selectedPapers.length > 0
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                분석 실행
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        <div className="grid grid-cols-12 gap-6 h-full">
          {/* 좌측 패널 */}
          <div className="col-span-3 space-y-4">
            <FileUpload />
            <PaperSelector />
          </div>

          {/* 중앙 캔버스 */}
          <div className="col-span-6 flex flex-col" style={{ minHeight: '600px' }}>
            <Canvas />
          </div>

          {/* 우측 결과 패널 */}
          <div className="col-span-3">
            <RankingList />
          </div>
        </div>
      </main>

      {/* 푸터 */}
      <footer className="bg-white border-t border-gray-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-gray-500">
          <div>
            {design && (
              <span>
                도면: {design.name} ({design.boundingBox.width.toFixed(1)} x {design.boundingBox.height.toFixed(1)})
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span>등록된 종이: {paperPresets.length}종</span>
            <span>선택됨: {selectedPapers.length}종</span>
            {results.length > 0 && (
              <span className="text-green-600 font-medium">
                최고 효율: {results[0].efficiency.toFixed(1)}% ({results[0].paperName})
              </span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
