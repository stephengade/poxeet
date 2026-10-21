"use client";

import { Toaster as Sonner } from "sonner";

/** The one toast stack for the whole app: top centre, coloured by type (success, error, warning, info). */
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      richColors
      closeButton
      theme="light"
      duration={4500}
      gap={8}
      toastOptions={{ className: "pxt-sonner" }}
    />
  );
}
