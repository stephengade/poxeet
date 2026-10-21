"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type Ref } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { describedBy, Field, type FieldProps } from "./field";
import { Icon } from "./icon";

export type SelectOption = string | { value: string; label: string };

type Props = FieldProps & {
  id?: string;
  /** Submitted with plain forms through a hidden input. */
  name?: string;
  options: SelectOption[];
  /** Controlled value. Leave out and pass defaultValue for an uncontrolled select. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Show a search box in the panel. Defaults to on when there are more than 10 options. */
  searchable?: boolean;
  /** The trigger button, so react-hook-form's Controller can focus it on an error. */
  ref?: Ref<HTMLButtonElement>;
};

const SEARCH_ABOVE = 10;
const PANEL_MAX = 300;
const GAP = 6;
const EDGE = 12;

const normalise = (option: SelectOption) => (typeof option === "string" ? { value: option, label: option } : option);

/**
 * The app's dropdown: a button that opens a branded list. Long lists get a search box automatically.
 * Keyboard: arrows, Home and End move; Enter picks; Escape closes; typing jumps to a match (or filters, with search).
 */
export function Select({
  label, hint, error, className, id: givenId, name, options, value, defaultValue, onChange, onBlur,
  placeholder = "Choose…", disabled, searchable, ref,
}: Props) {
  const autoId = useId();
  const id = givenId ?? autoId;
  const listId = `${id}-list`;
  const items = useMemo(() => options.map(normalise), [options]);
  const withSearch = searchable ?? items.length > SEARCH_ABOVE;

  const [own, setOwn] = useState(defaultValue ?? "");
  const current = value ?? own;
  const selected = items.find((item) => item.value === current);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [upward, setUpward] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({});

  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => item.label.toLowerCase().includes(term) || item.value.toLowerCase().includes(term));
  }, [items, query]);

  function setTrigger(node: HTMLButtonElement | null) {
    trigger.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }

  // The open list is rendered at the top of the page (a portal) with fixed coordinates taken from the field,
  // so no card or scroll area with overflow: hidden can clip it. Open upward when there's more room above.
  const position = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    const up = below < Math.min(PANEL_MAX, 200) && above > below;
    setUpward(up);
    setPlace({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(120, Math.min(PANEL_MAX, up ? above : below)),
      ...(up ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
    });
  }, []);

  function openPanel() {
    if (disabled) return;
    position();
    setQuery("");
    setActive(Math.max(0, items.findIndex((item) => item.value === current)));
    setOpen(true);
  }

  function close(focusTrigger = true) {
    setOpen(false);
    if (focusTrigger) trigger.current?.focus();
  }

  function pick(next: string) {
    if (value === undefined) setOwn(next);
    if (next !== current) onChange?.(next);
    close();
  }

  // Follow the field while the page scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", position, { capture: true, passive: true });
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, { capture: true });
      window.removeEventListener("resize", position);
    };
  }, [open, position]);

  // Focus the search box on open, without scrolling the page.
  useEffect(() => { if (open && withSearch) search.current?.focus({ preventScroll: true }); }, [open, withSearch]);

  // Keep the active option in view by scrolling the list only (scrollIntoView would scroll the page too).
  useLayoutEffect(() => {
    const box = list.current;
    const option = box?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!open || !box || !option) return;
    if (option.offsetTop < box.scrollTop) box.scrollTop = option.offsetTop - GAP;
    else if (option.offsetTop + option.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = option.offsetTop + option.offsetHeight - box.clientHeight + GAP;
  }, [open, active, shown]);

  // Close on a click outside the field and the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !panel.current?.contains(target)) { setOpen(false); onBlur?.(); }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, onBlur]);

  function onListKeys(event: KeyboardEvent) {
    const last = shown.length - 1;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(last, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(last); }
    else if (event.key === "Enter") { event.preventDefault(); if (shown[active]) pick(shown[active].value); }
    else if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "Tab") { setOpen(false); onBlur?.(); }
    else if (!withSearch && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      // Type-to-jump for short lists.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + event.key.toLowerCase(), at: now };
      const match = shown.findIndex((item) => item.label.toLowerCase().startsWith(typed.current.text));
      if (match >= 0) setActive(match);
    }
  }

  function onTriggerKeys(event: KeyboardEvent<HTMLButtonElement>) {
    if (open) return onListKeys(event);
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); openPanel(); }
  }

  const activeId = open && shown[active] ? `${id}-opt-${active}` : undefined;

  return (
    <Field id={id} label={label} hint={hint} error={error} className={cn("pxt-field-select", className)}>
      <div className="pxt-select" ref={root} data-open={open || undefined}>
        <button
          ref={setTrigger}
          id={id}
          type="button"
          className="pxt-select-trigger"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={withSearch ? undefined : activeId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          disabled={disabled}
          onClick={() => (open ? close() : openPanel())}
          onKeyDown={onTriggerKeys}
          onBlur={() => { if (!open) onBlur?.(); }}
        >
          <span className={cn("pxt-select-value", !selected && "pxt-select-placeholder")}>{selected?.label ?? placeholder}</span>
          <Icon name="chevron-down" size={16} className="pxt-select-chevron" />
        </button>
        {name && <input type="hidden" name={name} value={current} />}

        {open && createPortal(
          <div ref={panel} className="pxt-select-panel" data-side={upward ? "top" : "bottom"} style={place}>
            {withSearch && (
              <div className="pxt-select-search">
                <Icon name="search" size={16} />
                <input
                  ref={search}
                  type="text"
                  role="searchbox"
                  aria-label={`Search ${typeof label === "string" ? label.toLowerCase() : "options"}`}
                  aria-controls={listId}
                  aria-activedescendant={activeId}
                  placeholder="Search…"
                  value={query}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => { setQuery(event.target.value); setActive(0); }}
                  onKeyDown={onListKeys}
                />
              </div>
            )}
            <ul ref={list} id={listId} role="listbox" aria-labelledby={id} className="pxt-select-list" tabIndex={-1}>
              {shown.length === 0 && <li className="pxt-select-empty" role="presentation">No matches for “{query.trim()}”</li>}
              {shown.map((item, index) => {
                const isSelected = item.value === current;
                return (
                  <li
                    key={item.value}
                    id={`${id}-opt-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    data-active={index === active || undefined}
                    className="pxt-select-option"
                    onPointerMove={() => setActive(index)}
                    onClick={() => pick(item.value)}
                  >
                    <span>{item.label}</span>
                    {isSelected && <Icon name="check" size={16} strokeWidth={2.2} />}
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
      </div>
    </Field>
  );
}
