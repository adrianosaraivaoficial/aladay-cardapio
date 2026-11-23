import { Search, X } from 'lucide-react';
import { useRef } from 'react';

export function SearchInput({ label, placeholder, value, onChange }: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="relative min-w-0">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
      <input
        ref={input}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="aladay-search !pl-9 !pr-12 text-sm [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => { onChange(''); input.current?.focus(); }}
          className="aladay-action absolute inset-y-0 right-0 w-11 !px-0 text-slate-600 hover:bg-slate-100"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
