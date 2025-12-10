import { useAppStore } from '../../stores/appStore';

export function MarginInput() {
  const margin = useAppStore(state => state.margin);
  const setMargin = useAppStore(state => state.setMargin);

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="margin-input" className="text-sm font-medium text-gray-700 whitespace-nowrap">
        여백
      </label>
      <div className="flex items-center gap-2">
        <input
          id="margin-input"
          type="number"
          min="0"
          max="50"
          step="0.5"
          value={margin}
          onChange={(e) => setMargin(Math.max(0, parseFloat(e.target.value) || 0))}
          className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
        />
        <span className="text-sm text-gray-500">mm</span>
      </div>
    </div>
  );
}
