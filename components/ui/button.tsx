import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon, renderIcon, type IconName } from "./icon";

type Common = {
  variant?: "primary" | "brand" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
  icon?: IconName | ReactNode;
  iconRight?: IconName | ReactNode;
  className?: string;
  children?: ReactNode;
};

type ButtonProps = Common & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; href?: undefined };
type LinkProps = Common & { href: string; "aria-label"?: string };

function classes({ variant = "primary", size = "md", icon, iconRight, children, className }: Common) {
  const iconOnly = !children && Boolean(icon || iconRight);
  return cn("pxt-btn", `pxt-btn-${variant}`, size !== "md" && `pxt-btn-${size}`, iconOnly && "pxt-btn-icon", className);
}

/** Pill action. One primary per screen. Pass href to render a link styled as a button. */
export function Button(props: ButtonProps | LinkProps) {
  const { icon, iconRight, children } = props;
  if (props.href !== undefined) {
    return (
      <Link className={classes(props)} href={props.href} aria-label={props["aria-label"]}>
        {renderIcon(icon)}
        {children && <span>{children}</span>}
        {renderIcon(iconRight)}
      </Link>
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { variant, size, icon: _icon, iconRight: _iconRight, children: _children, loading, className, type = "button", disabled, ...rest } = props;
  return (
    <button {...rest} type={type} className={classes(props)} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading ? <Icon name="spinner" /> : renderIcon(icon)}
      {children && <span>{children}</span>}
      {renderIcon(iconRight)}
    </button>
  );
}
