/**
 * 네스팅 Web Worker 관리 Hook
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Design, Paper, NestingResult, NestingAlgorithm } from '../types';
import type { NestingWorkerMessage, NestingWorkerResponse } from '../workers/nestingWorker';

export interface NestingProgress {
  isRunning: boolean;
  progress: number;
  message: string;
}

export function useNestingWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState<NestingProgress>({
    isRunning: false,
    progress: 0,
    message: '',
  });

  // Worker 초기화
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/nestingWorker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (event: MessageEvent<NestingWorkerResponse>) => {
      const { type, progress: prog, message, results, error } = event.data;

      switch (type) {
        case 'progress':
          setProgress({
            isRunning: true,
            progress: prog ?? 0,
            message: message ?? '',
          });
          break;

        case 'complete':
          setProgress({
            isRunning: false,
            progress: 100,
            message: '완료',
          });
          if (onCompleteRef.current && results) {
            onCompleteRef.current(results);
          }
          break;

        case 'error':
          setProgress({
            isRunning: false,
            progress: 0,
            message: `오류: ${error}`,
          });
          if (onErrorRef.current) {
            onErrorRef.current(error ?? 'Unknown error');
          }
          break;

        case 'cancelled':
          setProgress({
            isRunning: false,
            progress: 0,
            message: '취소됨',
          });
          break;
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // 콜백 레퍼런스 (리렌더링 시에도 최신 유지)
  const onCompleteRef = useRef<((results: NestingResult[]) => void) | null>(null);
  const onErrorRef = useRef<((error: string) => void) | null>(null);

  // 네스팅 시작
  const startNesting = useCallback((
    design: Design,
    papers: Paper[],
    margin: number,
    algorithm: NestingAlgorithm,
    onComplete: (results: NestingResult[]) => void,
    onError?: (error: string) => void
  ) => {
    if (!workerRef.current) return;

    onCompleteRef.current = onComplete;
    onErrorRef.current = onError ?? null;

    setProgress({
      isRunning: true,
      progress: 0,
      message: '분석 시작...',
    });

    workerRef.current.postMessage({
      type: 'start',
      design,
      papers,
      margin,
      algorithm,
    } satisfies NestingWorkerMessage);
  }, []);

  // 취소
  const cancelNesting = useCallback(() => {
    if (!workerRef.current) return;

    workerRef.current.postMessage({
      type: 'cancel',
    } satisfies NestingWorkerMessage);
  }, []);

  return {
    progress,
    startNesting,
    cancelNesting,
  };
}
