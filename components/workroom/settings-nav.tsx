"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../ui";
import { SETTINGS_PAGES, type SettingsPage } from "./settings-pages";

// Only the settings that exist in the real app. The preview's longer list stays in components/preview/settings-ui.
const GROUPS: Array<{ title: string; items: SettingsPage["id"][] }> = [
  { title: "Account", items: ["profile", "notifications"] },
  { title: "Workspace", items: ["channels", "ai", "schedule"] },
  { title: "Privacy", items: ["data"] },
];

/** `billing` adds Credits, which exists only when BILLING_ENABLED is on. */
export function AppSettingsNav({ pathname, billing = false }: { pathname?: string; billing?: boolean }) {
  const current = pathname?.split("/")[3];
  const groups = billing
    ? GROUPS.map((group) => group.title === "Workspace" ? { ...group, items: [...group.items.slice(0, 2), "credits" as const, ...group.items.slice(2)] } : group)
    : GROUPS;
  return (
    <nav className="wr-settings-nav" aria-label="Settings">
      <h1 className="wr-settings-title">Settings</h1>
      {groups.map((group) => (
        <div key={group.title} className="wr-settings-group">
          <span className="wr-settings-head">{group.title}</span>
          {group.items.map((id) => {
            const page = SETTINGS_PAGES[id];
            return (
              <Link key={id} href={`/app/settings/${id}`} aria-current={current === id ? "page" : undefined} data-tone={page.tone}>
                <span className="wr-settings-icon" aria-hidden="true"><Icon name={page.icon} size={14} /></span>{page.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function CurrentAppSettingsNav({ billing = false }: { billing?: boolean }) {
  return <AppSettingsNav pathname={usePathname()} billing={billing} />;
}
