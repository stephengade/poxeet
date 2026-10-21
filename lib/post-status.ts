import type { IconName } from "../components/ui/icon";

// Mirrors the status check on public.scheduled_posts.
export type PostStatus = "draft" | "approved" | "posting" | "posted" | "failed" | "skipped" | "needs_check" | "missed";

type StatusLook = { label: string; icon: IconName; tone: "draft" | "approved" | "posting" | "posted" | "failed" | "skipped" | "warning" };

export const POST_STATUS: Record<PostStatus, StatusLook> = {
  draft: { label: "Draft", icon: "pencil", tone: "draft" },
  approved: { label: "Approved", icon: "check", tone: "approved" },
  posting: { label: "Being sent", icon: "send", tone: "posting" },
  posted: { label: "Posted", icon: "check-double", tone: "posted" },
  failed: { label: "Failed", icon: "alert", tone: "failed" },
  skipped: { label: "Skipped", icon: "skip", tone: "skipped" },
  needs_check: { label: "Needs check", icon: "clock", tone: "warning" },
  missed: { label: "Missed", icon: "clock", tone: "warning" },
};

// A day holding one of these shows an alert marker on the calendar.
export const ATTENTION_STATUSES: readonly PostStatus[] = ["failed", "needs_check", "missed"];
