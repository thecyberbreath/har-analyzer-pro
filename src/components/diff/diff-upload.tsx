'use client';

import { useRef, useState, useCallback } from 'react';

interface Props {
  onFilesSelected: (fileA: File, fileB: File) => void;
  isLoading?: boolean;
  loadingStep?: string;
}

export function DiffUpload({ onFilesSelected, isLoading, loadingStep }: Props) {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);

  const handleReady = useCallback((a: File, b: File) => {
    onFilesSelected(a, b);
  }, [onFilesSelected]);

  const handleSetA = useCallback((file: File) => {
    setFileA(file);
    if (fileB) handleReady(file, fileB);
  }, [fileB, handleReady]);

  const handleSetB = useCallback((file: File) => {
    setFileB(file);
    if (fileA) handleReady(fileA, file);
  }, [fileA, handleReady]);

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl rounded-2xl border-2 border-brand-200 bg-brand-50/50 p-10 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-brand-200 border-t-brand-500 animate-spin" />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-700">{loadingStep || 'Comparing HAR files...'}</p>
            <p className="text-xs text-gray-500 mt-1">This may take a moment for large files</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DropSlot
          label="Baseline (HAR A)"
          sublabel="The known-good or faster run"
          file={fileA}
          onFile={handleSetA}
          accentColor="emerald"
        />
        <DropSlot
          label="Comparison (HAR B)"
          sublabel="The run you want to compare"
          file={fileB}
          onFile={handleSetB}
          accentColor="blue"
        />
      </div>

      {fileA && fileB && (
        <div className="mt-4 text-center">
          <button
            onClick={() => handleReady(fileA, fileB)}
            className="px-6 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold shadow-sm hover:bg-brand-700 transition-colors"
          >
            Compare HAR Files
          </button>
        </div>
      )}

      {(fileA || fileB) && !(fileA && fileB) && (
        <p className="mt-3 text-center text-xs text-gray-400">
          Upload both files to start the comparison
        </p>
      )}
    </div>
  );
}

function DropSlot({
  label, sublabel, file, onFile, accentColor,
}: {
  label: string;
  sublabel: string;
  file: File | null;
  onFile: (f: File) => void;
  accentColor: 'emerald' | 'blue';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback((f: File) => {
    if (f.name.endsWith('.har') || f.type === 'application/json') {
      onFile(f);
    }
  }, [onFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const colors = accentColor === 'emerald'
    ? {
        ring: 'border-emerald-400', bg: 'bg-emerald-50',
        icon: 'bg-emerald-100 text-emerald-600',
        text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700',
      }
    : {
        ring: 'border-blue-400', bg: 'bg-blue-50',
        icon: 'bg-blue-100 text-blue-600',
        text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700',
      };

  if (file) {
    return (
      <div className={`rounded-2xl border-2 ${colors.ring} ${colors.bg} p-6 text-center`}>
        <input
          ref={inputRef}
          type="file"
          accept=".har,application/json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <div className="flex flex-col items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${colors.icon} flex items-center justify-center`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${colors.badge} mb-1.5`}>
              {label}
            </span>
            <p className="text-xs font-medium text-gray-700 truncate max-w-[200px]" title={file.name}>
              {file.name}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {(file.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            className="text-[11px] text-gray-500 hover:text-gray-700 underline"
          >
            Change file
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200 ${
        dragging
          ? `${colors.ring} ${colors.bg} scale-[1.02] shadow-lg`
          : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50/50'
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
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <div className="flex flex-col items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
          dragging ? colors.icon : 'bg-gray-100 text-gray-400'
        }`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700">{label}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{sublabel}</p>
        </div>
      </div>
    </div>
  );
}
