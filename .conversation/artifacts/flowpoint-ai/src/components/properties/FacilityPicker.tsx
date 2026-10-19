import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

interface FacilityOption {
  value: string;
  label: string;
  group?: string;
}

interface FacilityPickerProps {
  options: readonly FacilityOption[];
  value: string[];
  onChange: (value: string[]) => void;
  testId: string;
}

export function FacilityPicker({ options, value, onChange, testId }: FacilityPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const selected = useMemo(
    () => options.filter((option) => value.includes(option.value)),
    [options, value],
  );
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return options.filter((option) =>
      !normalizedQuery
      || option.label.toLocaleLowerCase().includes(normalizedQuery)
      || option.group?.toLocaleLowerCase().includes(normalizedQuery)
      || option.value.replaceAll('_', ' ').toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [options, query]);
  const visibleGroups = useMemo(() => {
    const groups = new Map<string, FacilityOption[]>();
    visible.forEach((option) => {
      const group = option.group || 'Facilities';
      groups.set(group, [...(groups.get(group) ?? []), option]);
    });
    return Array.from(groups.entries());
  }, [visible]);
  const toggle = (facility: string) => onChange(
    value.includes(facility)
      ? value.filter((item) => item !== facility)
      : [...value, facility],
  );

  return (
    <div data-testid={testId} className="rounded-[11px] border border-[#e7e4de] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-[#37342f]">Selected facilities</p>
          <p className="mt-0.5 text-[10px] text-[#969188]">
            {selected.length ? `${selected.length} selected` : 'No facilities selected yet'}
          </p>
        </div>
        <button
          type="button"
          data-testid={`${testId}-toggle`}
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((current) => !current);
            setQuery('');
          }}
          className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-[#dedbd4] bg-[#fbfaf8] px-3 text-[10px] font-semibold text-[#555149] transition-colors hover:border-[#c9c6be] hover:bg-[#f3f2ee]"
        >
          {expanded ? 'Done' : 'Browse facilities'}
          <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {selected.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {selected.map((facility) => (
            <span
              key={facility.value}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#d8e3d9] bg-[#f1f6f0] py-1 pl-2.5 pr-1.5 text-[10px] font-medium text-[#4d6a59]"
            >
              {facility.label}
              <button
                type="button"
                aria-label={`Remove ${facility.label}`}
                data-testid={`${testId}-remove-${facility.value}`}
                onClick={() => toggle(facility.value)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-[#718875] hover:bg-white hover:text-[#9a3f34]"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-[8px] bg-[#f8f7f4] px-3 py-2 text-[10px] text-[#8f8a81]">
          Choose the features available at this property.
        </p>
      )}

      {expanded && (
        <div className="mt-3 border-t border-[#efede8] pt-3">
          <label className="relative block">
            <Search size={13} className="pointer-events-none absolute left-3 top-[10px] text-[#99948b]" />
            <input
              type="search"
              data-testid={`${testId}-search`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search facilities"
              className="h-9 w-full rounded-[8px] border border-[#e4e2de] bg-[#fbfaf8] pl-8 pr-3 text-[11px] text-[#34312d] outline-none focus:border-[#8fa697] focus:ring-2 focus:ring-[#8fa697]/15"
            />
          </label>
          <div aria-label="Available facilities" className="mt-2 max-h-[280px] overflow-y-auto overscroll-contain rounded-[8px] border border-[#efede8] bg-[#fdfdfc] p-1">
            {visible.length === 0 ? (
              <p className="px-3 py-5 text-center text-[10px] text-[#969188]">No matching facilities.</p>
            ) : (
              <div className="space-y-2">
                {visibleGroups.map(([group, groupOptions]) => (
                  <section key={group} aria-label={group}>
                    <p className="sticky top-0 z-[1] bg-[#fdfdfc] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[.1em] text-[#969188]">
                      {group}
                    </p>
                    {groupOptions.map((facility) => {
                      const isSelected = value.includes(facility.value);
                      return (
                        <button
                          key={facility.value}
                          type="button"
                          data-testid={`${testId}-option-${facility.value}`}
                          role="checkbox"
                          aria-checked={isSelected}
                          onClick={() => toggle(facility.value)}
                          className={`flex min-h-9 w-full items-center gap-2.5 rounded-[6px] px-2.5 text-left text-[10px] transition-colors ${
                            isSelected
                              ? 'bg-[#edf4ee] font-semibold text-[#4d6a59]'
                              : 'text-[#625e57] hover:bg-[#f3f2ee]'
                          }`}
                        >
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border ${
                            isSelected ? 'border-[#63816e] bg-[#63816e] text-white' : 'border-[#d5d2ca] bg-white'
                          }`}>
                            {isSelected && <Check size={10} />}
                          </span>
                          {facility.label}
                        </button>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}
          </div>
          <p className="mt-1.5 text-right text-[9px] text-[#aaa59d]">
            {visible.length} {visible.length === 1 ? 'facility' : 'facilities'}
          </p>
        </div>
      )}
    </div>
  );
}
