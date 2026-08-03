import { useEffect, useRef, useState } from 'react';

/**
 * Searchable text picker: type to filter existing values, click to pick one,
 * or type a value that isn't in the list yet and press Enter to "create" it —
 * it's selected immediately and reported via onCreate so the caller can add it
 * to `options`, making it show up in the dropdown right away (not just after
 * a reload from wherever `options` is persisted).
 */
export default function TextCombobox({ options, value, onChange, onCreate, placeholder }: { options: string[]; value: string; onChange: (v: string) => void; onCreate?: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const select = (v: string) => {
    onChange(v);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <input
          value={open ? query : value}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => { setQuery(''); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== 'Escape') return;
            e.preventDefault();
            if (e.key === 'Enter') {
              const trimmed = value.trim();
              const isNew = trimmed && !options.some((o) => o.toLowerCase() === trimmed.toLowerCase());
              if (isNew) onCreate?.(trimmed);
            }
            setOpen(false);
            setQuery('');
          }}
          placeholder={placeholder || 'Search or type…'}
          className="w-full px-3 py-2 pr-7 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
        />
        <i className="ri-search-line absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 text-sm pointer-events-none"></i>
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-44 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">{query ? `No match — "${query}" will be added as a new remark` : 'No remarks used yet'}</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => select(o)}
                className={`w-full flex items-center px-3 py-1.5 text-xs text-left hover:bg-emerald-50 cursor-pointer ${
                  o === value ? 'bg-emerald-50/60 text-emerald-700 font-medium' : 'text-gray-600'
                }`}
              >
                <span className="truncate">{o}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
