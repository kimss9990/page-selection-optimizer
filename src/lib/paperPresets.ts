import type { Paper } from '../types';

export const paperPresets: Paper[] = [
  // 일반 인쇄용지
  {
    id: 'jeonji',
    name: '전지',
    width: 788,
    height: 1091,
    category: '일반 인쇄',
  },
  {
    id: 'gukjeonji',
    name: '국전지',
    width: 636,
    height: 939,
    category: '일반 인쇄',
  },

  // 포장재용
  {
    id: '4x6-baepan',
    name: '4x6배판',
    width: 788,
    height: 545,
    category: '포장재',
  },
  {
    id: '46-jeonji',
    name: '46전지',
    width: 788,
    height: 1091,
    category: '포장재',
  },

  // A 시리즈
  {
    id: 'a1',
    name: 'A1',
    width: 594,
    height: 841,
    category: '도면',
  },
  {
    id: 'a2',
    name: 'A2',
    width: 420,
    height: 594,
    category: '도면',
  },
  {
    id: 'a3',
    name: 'A3',
    width: 297,
    height: 420,
    category: '도면',
  },

  // B 시리즈
  {
    id: 'b1',
    name: 'B1',
    width: 728,
    height: 1030,
    category: '포스터',
  },
  {
    id: 'b2',
    name: 'B2',
    width: 515,
    height: 728,
    category: '포스터',
  },
  {
    id: 'b3',
    name: 'B3',
    width: 364,
    height: 515,
    category: '포스터',
  },
];

export const getPaperById = (id: string): Paper | undefined => {
  return paperPresets.find(p => p.id === id);
};

export const getPapersByCategory = (category: string): Paper[] => {
  return paperPresets.filter(p => p.category === category);
};

export const getAllCategories = (): string[] => {
  return [...new Set(paperPresets.map(p => p.category))];
};
