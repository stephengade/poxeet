"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi; onPoxeetTurnstileLoad?: () => void }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onPoxeetTurnstileLoad";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** Turnstile state for a form: the current token, whether the form may submit, and a reset after each use. */
export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const refresh = useCallback(() => { setToken(null); setRound((value) => value + 1); }, []);
  const needed = Boolean(TURNSTILE_SITE_KEY);
  return { token: token ?? undefined, ready: !needed || Boolean(token), refresh, widget: <Turnstile onToken={setToken} resetKey={round} /> };
}

type Props = {
  onToken: (token: string | null) => void;
  /** Change this number to get a fresh token, for example after a code request (tokens work once). */
  resetKey?: number;
};

/** Cloudflare Turnstile. The server checks the token with Cloudflare (lib/turnstile.ts) before any code is sent. */
export function Turnstile({ onToken, resetKey = 0 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  useEffect(() => { callback.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !box.current) return;
    const element = box.current;
    const mount = () => {
      if (!window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(element, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "light",
        size: "flexible",
        callback: (token: string) => callback.current(token),
        "expired-callback": () => callback.current(null),
        // Client-side errors (the 300xxx family, for example) are retryable: get a fresh challenge shortly.
        "error-callback": () => {
          callback.current(null);
          window.setTimeout(() => { if (widget.current && window.turnstile) window.turnstile.reset(widget.current); }, 1500);
        },
      });
    };
    if (window.turnstile) mount();
    else {
      window.onPoxeetTurnstileLoad = mount;
      if (!document.getElementById(SCRIPT_ID)) {
        const script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    }
    return () => {
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey && widget.current && window.turnstile) {
      callback.current(null);
      window.turnstile.reset(widget.current);
    }
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="signin-captcha" />;
}
