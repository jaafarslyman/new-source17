import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface FlowPointSelectOption {
  value: string;
  label: string;
  secondary?: string;
}

interface FlowPointSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: FlowPointSelectOption[];
  placeholder: string;
  disabled?: boolean;
  testId?: string;
  emptyLabel?: string;
}

export default function FlowPointSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  testId,
  emptyLabel = 'No options available',
}: FlowPointSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties | null>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = rootRef.current?.getBoundingClientRect();
      if (!anchor) return;

      const edge = 8;
      const spaceBelow = window.innerHeight - anchor.bottom - edge;
      const spaceAbove = anchor.top - edge;
      const desiredHeight = Math.min(260, Math.max(44, options.length * 42 + 8));
      const openAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const width = Math.min(anchor.width, window.innerWidth - edge * 2);
      const left = Math.max(edge, Math.min(anchor.left, window.innerWidth - width - edge));

      setMenuPosition({
        position: 'fixed',
        left,
        width,
        maxHeight: Math.max(44, Math.min(260, availableHeight - edge)),
        top: openAbove ? undefined : anchor.bottom + 5,
        bottom: openAbove ? window.innerHeight - anchor.top + 5 : undefined,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, options.length]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex h-[39px] w-full items-center justify-between gap-3 rounded-[9px] border border-[#e4e2de] bg-white px-[11px] text-left text-[13px] text-[#151412] outline-none transition-all hover:border-[#cfcac2] focus:border-[#151412] focus:ring-2 focus:ring-[#151412]/8 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={selected ? 'min-w-0 truncate' : 'truncate text-[#b3b0aa]'}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={14} className={`flex-shrink-0 text-[#8e8981] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && menuPosition && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          data-flowpoint-select-menu="true"
          style={menuPosition}
          className="z-[100] overflow-y-auto rounded-[10px] border border-[#e4e2de] bg-white p-1 shadow-[0_12px_30px_rgba(25,22,18,.14)]"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2.5 text-[12px] text-[#9b968d]">{emptyLabel}</p>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className="flex w-full items-start justify-between gap-3 rounded-[7px] px-2.5 py-2 text-left hover:bg-[#f5f3f0]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-[#38342e]">{option.label}</span>
                  {option.secondary && <span className="mt-0.5 block truncate text-[10px] text-[#9b968d]">{option.secondary}</span>}
                </span>
                {option.value === value && <Check size={14} className="mt-0.5 flex-shrink-0 text-[#151412]" />}
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}