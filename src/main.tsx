import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// NFP 테스트 함수를 전역으로 노출 (개발용)
import { testMinkowskiSum, testLShapeNFP, initNFPGenerator } from './lib/nfpGenerator';
import { testNFPPlacement, initNFPPlacer } from './lib/nfpPlacer';

declare global {
  interface Window {
    nfpTest: {
      init: typeof initNFPGenerator;
      testBasic: typeof testMinkowskiSum;
      testLShape: typeof testLShapeNFP;
      testPlacement: typeof testNFPPlacement;
      initPlacer: typeof initNFPPlacer;
    };
  }
}

window.nfpTest = {
  init: initNFPGenerator,
  testBasic: testMinkowskiSum,
  testLShape: testLShapeNFP,
  testPlacement: testNFPPlacement,
  initPlacer: initNFPPlacer,
};

console.log('NFP Test available:');
console.log('  - window.nfpTest.testBasic()     // Minkowski Sum 테스트');
console.log('  - window.nfpTest.testLShape()    // L자 NFP 테스트');
console.log('  - window.nfpTest.testPlacement() // NFP 배치 테스트');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
