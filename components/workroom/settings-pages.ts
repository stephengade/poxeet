import type { IconName } from "../ui";

export type SettingsPage = { id: "profile" | "notifications" | "channels" | "ai" | "credits" | "schedule" | "data"; label: string; icon: IconName; tone: number };

/** Each settings page's name, icon and colour (a pillar tone), shared by the settings nav and each page's header. */
export const SETTINGS_PAGES: Record<SettingsPage["id"], SettingsPage> = {
  profile: { id: "profile", label: "Profile", icon: "shield", tone: 0 },
  notifications: { id: "notifications", label: "Notifications", icon: "bell", tone: 3 },
  channels: { id: "channels", label: "Channels", icon: "link", tone: 2 },
  ai: { id: "ai", label: "AI access", icon: "sparkle", tone: 5 },
  credits: { id: "credits", label: "Credits", icon: "card", tone: 4 },
  schedule: { id: "schedule", label: "Publishing schedule", icon: "calendar", tone: 1 },
  data: { id: "data", label: "Your data", icon: "lock", tone: 2 },
};
