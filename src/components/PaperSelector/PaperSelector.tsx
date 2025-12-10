import { useAppStore } from '../../stores/appStore';
import { paperPresets, getAllCategories } from '../../lib/paperPresets';

export function PaperSelector() {
  const selectedPapers = useAppStore(state => state.selectedPapers);
  const togglePaper = useAppStore(state => state.togglePaper);
  const setSelectedPapers = useAppStore(state => state.setSelectedPapers);

  const categories = getAllCategories();

  const handleSelectAll = () => {
    setSelectedPapers(paperPresets.map(p => p.id));
  };

  const handleDeselectAll = () => {
    setSelectedPapers([]);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">종이 선택</h3>
        <div className="flex gap-2 text-sm">
          <button
            onClick={handleSelectAll}
            className="text-blue-600 hover:text-blue-800"
          >
            전체 선택
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={handleDeselectAll}
            className="text-blue-600 hover:text-blue-800"
          >
            선택 해제
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {categories.map(category => (
          <div key={category}>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              {category}
            </h4>
            <div className="space-y-1">
              {paperPresets
                .filter(p => p.category === category)
                .map(paper => (
                  <label
                    key={paper.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPapers.includes(paper.id)}
                      onChange={() => togglePaper(paper.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="flex-1 text-sm text-gray-700">{paper.name}</span>
                    <span className="text-xs text-gray-400">
                      {paper.width} x {paper.height}mm
                    </span>
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          선택됨: {selectedPapers.length} / {paperPresets.length}
        </p>
      </div>
    </div>
  );
}
