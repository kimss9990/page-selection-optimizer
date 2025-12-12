import { useAppStore } from '../../stores/appStore';
import { ALGORITHM_INFO, type NestingAlgorithm } from '../../types';

const algorithms: NestingAlgorithm[] = ['fast', 'nfp', 'nfp-ga'];

export function AlgorithmSelector() {
  const algorithm = useAppStore(state => state.algorithm);
  const setAlgorithm = useAppStore(state => state.setAlgorithm);

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="algorithm-select" className="text-sm font-medium text-gray-700 whitespace-nowrap">
        알고리즘
      </label>
      <select
        id="algorithm-select"
        value={algorithm}
        onChange={(e) => setAlgorithm(e.target.value as NestingAlgorithm)}
        className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
        title={ALGORITHM_INFO[algorithm].description}
      >
        {algorithms.map(alg => (
          <option key={alg} value={alg}>
            {ALGORITHM_INFO[alg].name}
          </option>
        ))}
      </select>
    </div>
  );
}
