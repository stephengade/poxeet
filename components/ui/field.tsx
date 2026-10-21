"use client";

import { useId, useState, type ChangeEvent, type CSSProperties, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "./icon";

export type FieldProps = { label: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string };

/** Label, control, then hint or error. Shared by every form control. */
export function Field({ id, label, hint, error, className, children, extra }: FieldProps & { id: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className={cn("pxt-field", className)} data-invalid={error ? "true" : undefined}>
      <label htmlFor={id}>{label}</label>
      {children}
      {(hint || error || extra) && (
        <div className="pxt-field-foot">
          {error ? <span className="pxt-error" id={`${id}-error`}><Icon name="alert" size={14} />{error}</span>
            : hint ? <span className="pxt-hint" id={`${id}-hint`}>{hint}</span> : null}
          {extra}
        </div>
      )}
    </div>
  );
}

export function describedBy(id: string, hint: ReactNode, error: ReactNode, extra?: string) {
  const ids = [error ? `${id}-error` : hint ? `${id}-hint` : null, extra].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

type InputProps = FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  ref?: Ref<HTMLInputElement>;
  /** A leading icon inside the field. */
  icon?: IconName;
};

/** Labelled single-line field; hint or error below, tied with aria-describedby. */
export function Input({ label, hint, error, className, id: givenId, icon, ...rest }: InputProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      <span className="pxt-control" data-icon={icon ? "" : undefined}>
        {icon && <Icon name={icon} size={18} className="pxt-control-icon" />}
        <input {...rest} id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} />
      </span>
    </Field>
  );
}

type CodeInputProps = FieldProps & {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  ref?: Ref<HTMLInputElement>;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
};

/**
 * One-time code as separate boxes. One real input sits over the boxes, so typing, pasting, deleting and the
 * phone's code suggestion all work as in a normal field; the boxes only draw what it holds.
 */
export function CodeInput({ label, hint, error, className, id: givenId, length = 6, value, onChange, onBlur, ref, ...rest }: CodeInputProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  const [focused, setFocused] = useState(false);
  const digits = value.slice(0, length);
  const active = Math.min(digits.length, length - 1);
  return (
    <Field id={id} label={label} hint={hint} error={error} className={cn("pxt-field-code", className)}>
      <span className="pxt-code" style={{ "--code-length": length } as CSSProperties}>
        <input
          {...rest}
          ref={ref}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={length}
          value={digits}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value.replace(/\D/g, "").slice(0, length))}
        />
        {Array.from({ length }, (_, index) => (
          <span
            key={index}
            className="pxt-code-cell"
            aria-hidden="true"
            data-filled={index < digits.length || undefined}
            data-active={(focused && index === active) || undefined}
          >
            {digits[index] ?? ""}
          </span>
        ))}
      </span>
    </Field>
  );
}

/** Counts Unicode characters, not bytes or UTF-16 units, as LinkedIn does. */
export function countCharacters(text: string) {
  return Array.from(text).length;
}

type TextareaProps = FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "value" | "defaultValue"> & {
  ref?: Ref<HTMLTextAreaElement>;
  value?: string;
  defaultValue?: string;
  /** Character limit for the counter; 0 hides it. LinkedIn's limit by default. */
  limit?: number;
};

export function Textarea({ label, hint, error, className, id: givenId, limit = 3000, value, defaultValue = "", onChange, ...rest }: TextareaProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  const [own, setOwn] = useState(defaultValue);
  const text = value ?? own;
  const count = countCharacters(text);
  const state = limit && count > limit ? "over" : limit && count > limit * 0.9 ? "warn" : undefined;
  const shownError = error ?? (state === "over" ? `Over the ${limit.toLocaleString("en-US")}-character limit. Shorten it to approve.` : undefined);
  const counter = limit ? (
    <span className="pxt-counter" id={`${id}-count`} data-state={state} aria-live={state ? "polite" : undefined}>
      {count.toLocaleString("en-US")} / {limit.toLocaleString("en-US")}
    </span>
  ) : null;
  return (
    <Field id={id} label={label} hint={hint} error={shownError} className={className} extra={counter}>
      <textarea
        {...rest}
        id={id}
        value={text}
        aria-invalid={shownError ? true : undefined}
        aria-describedby={describedBy(id, hint, shownError, limit ? `${id}-count` : undefined)}
        onChange={(event) => { if (value === undefined) setOwn(event.target.value); onChange?.(event); }}
      />
    </Field>
  );
}
