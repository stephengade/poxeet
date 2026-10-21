"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "../lib/config";
import { Logo } from "./brand/logo";
import { Icon, type IconName } from "./ui/icon";
import { Switch } from "./ui/switch";

type NavItem = { id: string; label: ReactNode; icon?: IconName; href: string };
type Connection = { state: "connected" | "expiring" | "expired"; label: string };

type Props = {
  items?: NavItem[];
  current?: string;
  connection?: Connection;
  /** Pass both to show the Pause all switch. */
  paused?: boolean;
  onPauseChange?: (next: boolean) => void;
  /** The account menu. */
  end?: ReactNode;
};

/** The workspace top bar. Pause all lives here so it is always one click away. */
export function AppBar({ items = [], current, connection, paused, onPauseChange, end }: Props) {
  return (
    <header className="pxt-appbar">
      <Link className="pxt-appbar-brand" href="/app" aria-label={`${APP_NAME} home`}><Logo size={26} /></Link>
      {items.length > 0 && (
        <nav className="pxt-nav" aria-label="Main">
          {items.map((item) => (
            <Link key={item.id} className="pxt-nav-item" href={item.href} aria-current={item.id === current ? "page" : undefined}>
              {item.icon && <Icon name={item.icon} />}
              {item.label}
            </Link>
          ))}
        </nav>
      )}
      <div className="pxt-appbar-end">
        {connection && (
          <span className="pxt-conn" data-state={connection.state}>
            <span className="pxt-conn-dot" aria-hidden="true" />
            <span className="pxt-conn-label">{connection.label}</span>
          </span>
        )}
        {onPauseChange && <Switch label="Pause all" checked={paused} onChange={onPauseChange} />}
        {end}
      </div>
    </header>
  );
}
