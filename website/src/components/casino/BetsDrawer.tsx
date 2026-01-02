import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type BetsDrawerProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
};

export const BetsDrawer: React.FC<BetsDrawerProps> = ({ title = 'PLACE BETS', children, className }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const overlay = open ? (
    <div className="fixed inset-0 z-[100] md:hidden" data-testid="bets-drawer">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[92%] max-w-sm sm:max-w-md max-h-[80vh] sm:max-h-[85vh] bg-titanium-900 border-2 border-gray-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        data-testid="bets-drawer-panel"
        data-drawer-label="Bets"
      >
        <div className="flex flex-col items-center gap-1 px-3 py-2 border-b border-gray-800 bg-titanium-900/90">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close Bets"
            className="flex items-center gap-1 rounded-full border border-gray-700 bg-black/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-gray-300"
          >
            <span>Bets</span>
            <span aria-hidden>▾</span>
          </button>
          {title ? (
            <div className="text-[10px] text-gray-500 uppercase tracking-widest">{title}</div>
          ) : null}
        </div>
        <div className="p-3 overflow-y-auto">{children}</div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Bets"
        className={`md:hidden text-[11px] font-mono px-3 py-2 rounded-full border border-gray-700 bg-black/50 text-gray-200 flex items-center gap-1 ${className ?? ''}`}
      >
        <span>Bets</span>
        <span aria-hidden>▾</span>
      </button>
      {overlay && typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay}
    </>
  );
};
