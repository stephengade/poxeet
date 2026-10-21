"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { reschedulePost } from "../../app/app/(workroom)/posts/actions";
import { longDay } from "../preview/parts";
import { Button, Icon } from "../ui";

type Props = {
  postId: string;
  date: string;
  time: string;
  timezone: string;
  /** Shown as plain text when the post can't be moved (sent, being sent, waiting for a check). */
  disabled?: boolean;
  onMoved?: (date: string, time: string) => void;
};

/**
 * When a post goes out, as a button: click it to pick a new date and time in place, in the member's timezone.
 * Used in the post editor's header and on each draft, so moving a post never needs a hunt.
 */
export function Reschedule({ postId, date, time, timezone, disabled, onMoved }: Props) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState({ date, time });
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const label = `${longDay(date)} · ${time}`;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (disabled) return <span className="wr-when">{label}</span>;

  function save() {
    start(async () => {
      const result = await reschedulePost(postId, when);
      if (!result.ok) return void toast.error(result.message);
      toast.success(`Moved to ${longDay(when.date)} at ${when.time}.`);
      setOpen(false);
      onMoved?.(when.date, when.time);
      router.refresh();
    });
  }

  return (
    <div className="wr-reschedule" ref={box}>
      <button type="button" className="wr-when wr-when-btn" aria-expanded={open} aria-controls={id} onClick={() => { setWhen({ date, time }); setOpen((value) => !value); }}>
        <Icon name="calendar" size={14} />{label}<span className="wr-when-change">Change</span>
      </button>
      {open && (
        <form id={id} className="wr-reschedule-pop" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <div className="wr-two">
            <label className="wr-field">Date<input type="date" value={when.date} onChange={(event) => setWhen({ ...when, date: event.target.value })} required autoFocus /></label>
            <label className="wr-field">Time<input type="time" value={when.time} onChange={(event) => setWhen({ ...when, time: event.target.value })} required /></label>
          </div>
          <span className="wr-small wr-muted">In {timezone.replaceAll("_", " ")}. The post keeps its status.</span>
          <span className="wr-actions">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" loading={pending} disabled={when.date === date && when.time === time}>Move post</Button>
          </span>
        </form>
      )}
    </div>
  );
}
