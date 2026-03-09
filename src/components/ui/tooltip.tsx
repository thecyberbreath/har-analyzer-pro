'use client';

import { useState, useRef, type ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const posClass = side === 'top'
    ? 'bottom-full mb-2'
    : 'top-full mt-2';

  const arrowClass = side === 'top'
    ? 'top-full -mt-px border-t-gray-900'
    : 'bottom-full -mb-px border-b-gray-900';

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className={`absolute z-[60] left-1/2 -translate-x-1/2 ${posClass} px-3 py-2 text-[11px] leading-relaxed text-white bg-gray-900 rounded-lg shadow-xl animate-fade-in pointer-events-none max-w-xs`}
          role="tooltip"
        >
          {content}
          <div className={`absolute left-1/2 -translate-x-1/2 border-[5px] border-transparent ${arrowClass}`} />
        </div>
      )}
    </div>
  );
}

export function Term({ children, definition }: { children: ReactNode; definition: string }) {
  return (
    <Tooltip content={definition}>
      <span className="underline decoration-dotted decoration-gray-400 underline-offset-2 cursor-help">
        {children}
      </span>
    </Tooltip>
  );
}
