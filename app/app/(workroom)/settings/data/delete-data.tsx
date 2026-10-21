"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, Modal } from "../../../../../components/ui";
import { deleteMyData } from "./actions";

type Counts = { imported: number; versions: number; posts: number; linkedin: boolean };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The danger card, and the dialog that asks for DELETE typed out before anything is removed. */
export function DeleteData({ counts }: { counts: Counts }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const close = () => { if (!pending) { setOpen(false); setConfirm(""); } };

  const removed = [
    plural(counts.imported, "added post"),
    plural(counts.versions, "voice version"),
    `${plural(counts.posts, "post")} in your calendar`,
    ...(counts.linkedin ? ["the LinkedIn connection"] : []),
  ];

  function remove() {
    start(async () => {
      const result = await deleteMyData(confirm);
      if (!result.ok) return void toast.error(result.message);
      setOpen(false);
      setConfirm("");
      toast.success("Your data is deleted.", { description: "Your account is still here. Add posts again whenever you're ready." });
      router.push("/app");
    });
  }

  return (
    <>
      <section className="wr-card wr-settings-card" data-tone="danger">
        <div className="wr-settings-card-head wr-settings-card-row">
          <div>
            <h3 className="wr-h2">Delete my data</h3>
            <p className="wr-sub wr-small">Removes your posts, voice profile, brief, calendar and LinkedIn connection, and keeps your account. Posts already on LinkedIn stay there. This can&apos;t be undone.</p>
          </div>
          <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>Delete my data</Button>
        </div>
      </section>
      {open && (
        <Modal
          title="Delete all your data?"
          onClose={close}
          actions={<>
            <Button variant="secondary" onClick={close} disabled={pending}>Keep my data</Button>
            <Button variant="destructive" disabled={confirm !== "DELETE"} loading={pending} onClick={remove}>Delete everything</Button>
          </>}
        >
          <div className="wr-stack">
            <p style={{ margin: 0 }}>{removed.slice(0, -1).join(", ")} and {removed.at(-1)} will be removed, with your brief. Export first if you want a copy.</p>
            <label className="wr-field">Type DELETE to confirm<input value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} /></label>
          </div>
        </Modal>
      )}
    </>
  );
}
