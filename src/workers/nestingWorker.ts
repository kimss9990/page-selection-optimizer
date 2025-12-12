/**
 * 네스팅 연산 Web Worker
 * 메인 스레드 블로킹 없이 복잡한 네스팅 계산 수행
 */

import type { Design, Paper, NestingResult, NestingAlgorithm } from '../types';
import { performNestingWithProgress, type ProgressCallback } from '../lib/nestingEngine';

export interface NestingWorkerMessage {
  type: 'start' | 'cancel';
  design?: Design;
  papers?: Paper[];
  margin?: number;
  algorithm?: NestingAlgorithm;
}

export interface NestingWorkerResponse {
  type: 'progress' | 'complete' | 'error' | 'cancelled';
  progress?: number;
  message?: string;
  results?: NestingResult[];
  error?: string;
}

let isCancelled = false;

self.onmessage = async (event: MessageEvent<NestingWorkerMessage>) => {
  const { type, design, papers, margin, algorithm } = event.data;

  if (type === 'cancel') {
    isCancelled = true;
    return;
  }

  if (type === 'start') {
    if (!design || !papers || margin === undefined) {
      self.postMessage({
        type: 'error',
        error: 'Missing required parameters',
      } satisfies NestingWorkerResponse);
      return;
    }

    isCancelled = false;

    const progressCallback: ProgressCallback = (progress, message) => {
      if (isCancelled) {
        throw new Error('CANCELLED');
      }
      self.postMessage({
        type: 'progress',
        progress,
        message,
      } satisfies NestingWorkerResponse);
    };

    try {
      const results = await performNestingWithProgress(
        design,
        papers,
        margin,
        algorithm ?? 'fast',
        progressCallback
      );

      if (isCancelled) {
        self.postMessage({ type: 'cancelled' } satisfies NestingWorkerResponse);
      } else {
        self.postMessage({
          type: 'complete',
          results,
        } satisfies NestingWorkerResponse);
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'CANCELLED') {
        self.postMessage({ type: 'cancelled' } satisfies NestingWorkerResponse);
      } else {
        self.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        } satisfies NestingWorkerResponse);
      }
    }
  }
};
