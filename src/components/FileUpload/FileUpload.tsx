import { useCallback, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { parseSVGFile } from '../../lib/svgParser';

export function FileUpload() {
  const setDesign = useAppStore(state => state.setDesign);
  const design = useAppStore(state => state.design);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);

    if (!file.name.toLowerCase().endsWith('.svg')) {
      setError('SVG 파일만 지원합니다.');
      return;
    }

    try {
      const parsedDesign = await parseSVGFile(file);
      setDesign(parsedDesign);
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일 파싱 중 오류가 발생했습니다.');
    }
  }, [setDesign]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleClear = useCallback(() => {
    setDesign(null);
    setError(null);
  }, [setDesign]);

  return (
    <div className="w-full">
      {!design ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
            ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".svg"
            className="hidden"
            onChange={handleInputChange}
          />
          <div className="text-gray-500">
            <svg
              className="mx-auto h-12 w-12 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-lg font-medium">SVG 파일을 드래그하거나 클릭하여 업로드</p>
            <p className="text-sm mt-1">패키지 도면 파일(.svg)을 선택하세요</p>
          </div>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg
                className="h-8 w-8 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="font-medium text-green-800">{design.name}</p>
                <p className="text-sm text-green-600">
                  {design.boundingBox.width.toFixed(1)} x {design.boundingBox.height.toFixed(1)} (viewBox 기준)
                </p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="text-gray-500 hover:text-gray-700 p-1"
              title="파일 제거"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
