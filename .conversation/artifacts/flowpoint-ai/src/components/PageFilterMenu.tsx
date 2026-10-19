import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react';

export default function PageFilterMenu({
  activeCount,
  onReset,
  children,
  testId,
}: {
  activeCount: number;
  onReset: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideSelectMenu = target instanceof Element && target.closest('[data-flowpoint-select-menu]');
      if (ref.current?.contains(target) || insideSelectMenu) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return <div ref={ref} className="relative flex-shrink-0">
    <button
      type="button"
      data-testid={testId}
      onClick={() => setOpen((current) => !current)}
      aria-label="Filters"
      aria-expanded={open}
      className={`relative flex h-[30px] w-[30px] items-center justify-center rounded-full border transition-all ${open || activeCount > 0 ? 'border-[#151412] bg-[#151412] text-white' : 'border-[#e5e2dd] bg-[#faf9f7] text-[#89847c] hover:border-[#cfcac2] hover:text-[#151412]'}`}
    >
      <SlidersHorizontal size={13} strokeWidth={2} />
      {activeCount > 0 && <span className="absolute -right-1 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[#c54b3d] px-1 text-[8px] font-bold text-white">{activeCount}</span>}
    </button>
    <AnimatePresence>
      {open && <motion.div
        initial={{ opacity: 0, y: -6, scale: .97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: .97 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        className="absolute right-0 top-[38px] z-40 w-[292px] max-w-[calc(100vw-40px)] rounded-[12px] border border-[#e9e6e1] bg-white p-4 shadow-[0_8px_32px_rgba(31,28,23,.14)]"
      >
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold text-[#151412]">Filters</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onReset} className="flex items-center gap-1 text-[10px] font-medium text-[#8d8880] hover:text-[#151412]"><RotateCcw size={11} />Reset</button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close filters" className="flex h-5 w-5 items-center justify-center rounded-full border border-[#e5e2dd] text-[#8d8880] hover:text-[#151412]"><X size={10} /></button>
          </div>
        </div>
        <div className="mt-3 max-h-[60vh] space-y-3 overflow-y-auto pr-0.5">{children}</div>
      </motion.div>}
    </AnimatePresence>
  </div>;
}