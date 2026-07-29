import { useEffect, useRef, useState } from 'react';
import type { BinOption } from '@/lib/binStock';

export type { BinOption };

/**
 * Searchable bin picker: type to filter, click to pick, or just type a bin that
 * isn't in the list yet (e.g. an empty/new bin) and it's used as-is — receiving
 * stock often needs to land somewhere other than where the product already lives.
 */
export default function BinCombobox({ options, value, onChange, placeholder }: { options: BinOption[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
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
    ? options.filter((o) => o.value.toLowerCase().includes(query.toLowerCase()))
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
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setOpen(false); setQuery(''); } }}
          placeholder={placeholder || 'Search or type a bin…'}
          className="w-full px-3 py-2 pr-7 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
        />
        <i className="ri-search-line absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 text-sm pointer-events-none"></i>
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-44 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">No matching bin{query ? ` — "${query}" will be used as entered` : ''}</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => select(o.value)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left hover:bg-emerald-50 cursor-pointer ${
                  o.value === value ? 'bg-emerald-50/60 text-emerald-700 font-medium' : 'text-gray-600'
                }`}
              >
                <span className="truncate">{o.value}</span>
                <span className="text-gray-400 flex-shrink-0">{o.hint}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
