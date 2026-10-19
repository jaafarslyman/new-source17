import { useState, type KeyboardEvent } from 'react';

interface TagListInputProps {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  suggestions?: readonly string[];
}

function normalizeTags(tags: string[]) {
  const seen = new Set<string>();
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function TagListInput({
  id,
  value,
  onChange,
  placeholder,
  suggestions = [],
}: TagListInputProps) {
  const [draft, setDraft] = useState('');
  const add = (tags: string[]) => onChange(normalizeTags([...value, ...tags]));
  const commitDraft = () => {
    const newTags = draft.split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean);
    if (newTags.length) add(newTags);
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft();
    }
    if (event.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const isSelected = (suggestion: string) =>
    value.some((tag) => tag.toLocaleLowerCase() === suggestion.toLocaleLowerCase());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-2 rounded-full border border-[#d8e2d8] bg-[#f0f4ef] px-3 py-1.5 text-sm text-[#526d5b]"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(value.filter((item) => item !== tag))}
              className="font-medium text-[#82948a] hover:text-[#a33e34]"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-[9px] border border-[#e4e2de] bg-white px-3 py-2 text-sm text-[#24211e] outline-none transition placeholder:text-[#b3afa8] focus:border-[#587b70] focus:ring-2 focus:ring-[#587b70]/10"
          aria-describedby={`${id}-hint`}
        />
        <button
          type="button"
          onClick={commitDraft}
          disabled={!draft.trim()}
          className="rounded-[9px] border border-[#dcd9d2] px-3 py-2 text-sm font-medium text-[#66635b] hover:bg-[#f3f2ee] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Add
        </button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-slate-500">
        Type an item and press Enter or choose a suggestion below.
      </p>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => {
            const selected = isSelected(suggestion);
            return (
              <button
                key={suggestion}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onChange(
                    selected
                      ? value.filter((tag) => tag.toLocaleLowerCase() !== suggestion.toLocaleLowerCase())
                      : normalizeTags([...value, suggestion]),
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  selected
                    ? 'border-[#8fa994] bg-[#edf4ee] text-[#4d6a59]'
                    : 'border-[#e7e4de] bg-[#f8f7f4] text-[#6f6b63] hover:border-[#b9cabe]'
                }`}
              >
                {suggestion}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
