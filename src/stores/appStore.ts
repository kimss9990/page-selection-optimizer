import { create } from 'zustand';
import type { AppState, AppActions, Design, NestingResult, Placement, Point } from '../types';
import { paperPresets } from '../lib/paperPresets';

const initialState: AppState = {
  margin: 3, // 기본 여백 3mm
  selectedPapers: paperPresets.map(p => p.id), // 기본적으로 모든 종이 선택
  design: null,
  results: [],
  selectedResultIndex: 0,
  canvasZoom: 1,
  canvasPan: { x: 0, y: 0 },
  manualPlacements: [],
  isManualMode: false,
};

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  ...initialState,

  setMargin: (margin: number) => set({ margin }),

  setSelectedPapers: (papers: string[]) => set({ selectedPapers: papers }),

  togglePaper: (paperId: string) => {
    const { selectedPapers } = get();
    if (selectedPapers.includes(paperId)) {
      set({ selectedPapers: selectedPapers.filter(id => id !== paperId) });
    } else {
      set({ selectedPapers: [...selectedPapers, paperId] });
    }
  },

  setDesign: (design: Design | null) => set({
    design,
    results: [],
    selectedResultIndex: 0,
    manualPlacements: [],
    isManualMode: false,
  }),

  setResults: (results: NestingResult[]) => {
    const firstResult = results[0];
    set({
      results,
      selectedResultIndex: 0,
      manualPlacements: firstResult ? [...firstResult.placements] : [],
    });
  },

  selectResult: (index: number) => {
    const { results } = get();
    if (index >= 0 && index < results.length) {
      set({
        selectedResultIndex: index,
        manualPlacements: [...results[index].placements],
        isManualMode: false,
      });
    }
  },

  setCanvasZoom: (zoom: number) => set({ canvasZoom: Math.max(0.1, Math.min(5, zoom)) }),

  setCanvasPan: (pan: Point) => set({ canvasPan: pan }),

  setManualPlacements: (placements: Placement[]) => set({ manualPlacements: placements }),

  updateManualPlacement: (index: number, updates: Partial<Placement>) => {
    const { manualPlacements } = get();
    if (index >= 0 && index < manualPlacements.length) {
      const newPlacements = [...manualPlacements];
      newPlacements[index] = { ...newPlacements[index], ...updates };
      set({ manualPlacements: newPlacements });
    }
  },

  toggleManualMode: () => set(state => ({ isManualMode: !state.isManualMode })),

  reset: () => set(initialState),
}));
