'use client';

import { useRef, useState, useCallback } from 'react';

interface Props {
  onFileSelected: (file: File) => void;
  isLoading?: boolean;
}

export function HarUpload({ onFileSelected, isLoading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (file.name.endsWith('.har') || file.type === 'application/json') {
      onFileSelected(file);
    }
  }, [onFileSelected]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  if (isLoading) {
    return (
      <div className="w-full max-w-md rounded-2xl border-2 border-brand-200 bg-brand-50/50 p-10 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-brand-200 border-t-brand-500 animate-spin" />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-700">Analyzing your HAR file...</p>
            <p className="text-xs text-gray-500 mt-1">This usually takes a few seconds</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-full max-w-md rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200 ${
        dragging
          ? 'border-brand-500 bg-brand-50 scale-[1.02] shadow-lg shadow-brand-500/10'
          : 'border-gray-300 bg-white hover:border-brand-400 hover:bg-gray-50/50'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".har,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      <div className="flex flex-col items-center gap-4">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
          dragging ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-400'
        }`}>
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">
            Drop your <span className="text-brand-600">.har</span> file here
          </p>
          <p className="text-xs text-gray-400 mt-1.5">or click to browse</p>
        </div>
      </div>
    </div>
  );
}
