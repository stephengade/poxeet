"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type Props = {
  label?: ReactNode;
  "aria-label"?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
};

/** On/off control that takes effect at once. Its main use is Pause all. */
export function Switch({ label, checked, defaultChecked = false, onChange, disabled, id: givenId, className, ...aria }: Props) {
  const autoId = useId();
  const id = givenId ?? autoId;
  const [own, setOwn] = useState(defaultChecked);
  const on = checked ?? own;
  return (
    <span className={cn("pxt-switch-wrap", className)}>
      <button
        type="button"
        role="switch"
        id={id}
        className="pxt-switch"
        aria-checked={on}
        aria-label={label ? undefined : aria["aria-label"]}
        aria-labelledby={label ? `${id}-label` : undefined}
        disabled={disabled}
        onClick={() => { if (checked === undefined) setOwn(!on); onChange?.(!on); }}
      />
      {label && <span id={`${id}-label`}>{label}</span>}
    </span>
  );
}
