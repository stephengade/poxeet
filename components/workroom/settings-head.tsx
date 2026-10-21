import type { ReactNode } from "react";
import { Icon } from "../ui";
import { SETTINGS_PAGES } from "./settings-pages";

/** A settings page's title and one-line summary, with the page's icon in its colour. */
export function SettingsHead({ title, children }: { title: string; children?: ReactNode }) {
  const page = Object.values(SETTINGS_PAGES).find((item) => item.label === title);
  return (
    <div className="wr-settings-page-head" data-tone={page?.tone}>
      {page && <span className="wr-settings-page-icon" aria-hidden="true"><Icon name={page.icon} size={20} /></span>}
      <div>
        <h2 className="wr-title">{title}</h2>
        {children && <p className="wr-sub">{children}</p>}
      </div>
    </div>
  );
}
