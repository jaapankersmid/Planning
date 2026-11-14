"use client";

import { useEffect } from "react";

/** Registreert de service worker zodat de site als app geïnstalleerd kan worden. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  return null;
}
