"use client";

import { useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Availability } from "@/lib/routine-workbench";

export interface PickerOption {
  id: number;
  code: string;
  label: string;
  availability: Availability;
}

const stateText: Record<Availability["state"], { word: string; className: string; mark: string }> = {
  free: { word: "Free", className: "text-[var(--color-pine)]", mark: "✓" },
  busy: { word: "In use", className: "text-[var(--color-clay)]", mark: "✕" },
  external: { word: "Other department", className: "text-[var(--color-clay)]", mark: "✕" },
  check: { word: "Check", className: "text-gold-text", mark: "!" },
};

const order: Record<Availability["state"], number> = { free: 0, check: 1, external: 2, busy: 3 };

/**
 * Searchable multi-select (ARIA combobox + listbox). Every option states its
 * availability at the chosen time in words, and free options are listed first.
 */
export function AvailabilityPicker({ label, options, selected, onChange, placeholder, emptyText }: {
  label: string;
  options: PickerOption[];
  selected: number[];
  onChange: (ids: number[]) => void;
  placeholder: string;
  emptyText: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((o) => !selected.includes(o.id))
      .filter((o) => !q || o.code.toLowerCase().includes(q) || o.label.toLowerCase().includes(q))
      .sort((a, b) => order[a.availability.state] - order[b.availability.state] || a.code.localeCompare(b.code))
      .slice(0, 40);
  }, [options, selected, query]);

  const choose = (optionId: number) => {
    onChange([...selected, optionId]);
    setQuery("");
    setActive(0);
    setOpen(false);
    input.current?.focus();
  };

  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className="mb-1 block text-[12.5px] font-medium text-ink-2">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-white p-1.5 focus-within:border-[var(--color-pine)]">
        {selected.map((selectedId) => {
          const option = options.find((o) => o.id === selectedId);
          if (!option) return null;
          const state = stateText[option.availability.state];
          return (
            <span key={selectedId} className="inline-flex items-center gap-1 rounded border border-[var(--color-line)] bg-wash px-1.5 py-0.5 font-mono text-[12.5px] font-semibold">
              {option.code}
              {option.availability.state !== "free" ? <span className={`font-sans text-[11.5px] ${state.className}`}>{state.mark} {state.word}</span> : null}
              <button type="button" aria-label={`Remove ${option.code}`} onClick={() => onChange(selected.filter((x) => x !== selectedId))} className="text-muted hover:text-[var(--color-ink)]">
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          );
        })}
        <input
          ref={input}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${id}-opt-${filtered[active].id}` : undefined}
          value={query}
          placeholder={selected.length ? "" : placeholder}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }}
          onClick={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (event.key === "Enter" && open && filtered[active]) { event.preventDefault(); choose(filtered[active].id); }
            else if (event.key === "Escape" && open) { event.stopPropagation(); event.preventDefault(); setOpen(false); }
            else if (event.key === "Backspace" && !query && selected.length) onChange(selected.slice(0, -1));
          }}
          className="min-w-[90px] flex-1 border-0 bg-transparent px-1 py-1 text-[13px] outline-none"
        />
      </div>
      {open ? (
        <ul id={`${id}-list`} role="listbox" aria-label={label}
          className="absolute inset-x-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-[var(--color-line)] bg-white text-[13px] shadow-[0_12px_28px_-18px_rgba(16,29,22,0.5)]">
          {filtered.length === 0 ? <li className="px-3 py-2 text-muted">{emptyText}</li> : filtered.map((option, index) => {
            const state = stateText[option.availability.state];
            const detail = option.availability.state === "free" ? [option.label, option.availability.note].filter(Boolean).join(" · ") : option.availability.detail;
            return (
              <li key={option.id} id={`${id}-opt-${option.id}`} role="option" aria-selected={index === active}
                onMouseDown={(event) => { event.preventDefault(); choose(option.id); }}
                onMouseEnter={() => setActive(index)}
                className={`grid cursor-pointer grid-cols-[64px_minmax(0,1fr)_auto] items-baseline gap-2 border-t border-[var(--color-line-soft)] px-2.5 py-1.5 first:border-t-0 ${index === active ? "bg-pine-tint" : ""}`}>
                <span className="font-mono font-semibold">{option.code}</span>
                <span className="truncate text-[12px] text-muted">{detail}</span>
                <span className={`whitespace-nowrap text-[12px] font-semibold ${state.className}`}>{state.mark} {state.word}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
