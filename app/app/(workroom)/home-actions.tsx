"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "../../../components/ui";
import { setPostStatus } from "./posts/actions";

/** Home's one-click decisions: approve a draft from the review queue, or stop the next post from going out. */
export function PostDecision({ id, decision }: { id: string; decision: "approve" | "stop" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function decide() {
    start(async () => {
      const result = await setPostStatus([id], decision === "approve" ? "approved" : "skipped");
      if (!result.ok) return void toast.error(result.message);
      toast.success(decision === "approve" ? "Approved. It goes out at its slot." : "Stopped. It won't be sent.", {
        action: { label: "Undo", onClick: () => { void setPostStatus([id], decision === "approve" ? "draft" : "approved").then(() => router.refresh()); } },
      });
      router.refresh();
    });
  }
  return decision === "approve"
    ? <Button size="sm" variant="secondary" className="wr-btn-soft" icon="check" loading={pending} onClick={decide}>Approve</Button>
    : <Button size="sm" variant="ghost" loading={pending} onClick={decide}>Stop this post</Button>;
}
