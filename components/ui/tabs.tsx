"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "./icon";

type Item = { id: string; label: ReactNode; icon?: IconName };
type Props = { items: Item[]; value?: string; defaultValue?: string; onChange?: (id: string) => void; "aria-label": string; className?: string };

/** Segmented control for switching views of the same content. Left and right arrows move between tabs. */
export function Tabs({ items, value, defaultValue, onChange, className, ...aria }: Props) {
  const [own, setOwn] = useState(defaultValue ?? items[0]?.id);
  const current = value ?? own;

  function pick(id: string) {
    if (value === undefined) setOwn(id);
    onChange?.(id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = items.findIndex((item) => item.id === current);
    const next = items[(index + (event.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
    pick(next.id);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
  }

  return (
    <div className={cn("pxt-tabs", className)} role="tablist" aria-label={aria["aria-label"]} onKeyDown={onKeyDown}>
      {items.map((item) => {
        const selected = item.id === current;
        return (
          <button key={item.id} type="button" role="tab" className="pxt-tab" data-tab={item.id} aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={() => pick(item.id)}>
            {item.icon && <Icon name={item.icon} size={14} />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
