"use client";

import { useEffect, useState, type ComponentType } from "react";

type ToasterComponent = ComponentType<{
  richColors?: boolean;
  closeButton?: boolean;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}>;

export function LazyToaster() {
  const [Toaster, setToaster] = useState<ToasterComponent | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadToaster = () => {
      void import("sonner").then((mod) => {
        if (!cancelled) {
          setToaster(() => mod.Toaster as ToasterComponent);
        }
      });
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(loadToaster, { timeout: 2000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = globalThis.setTimeout(loadToaster, 1000);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeoutId);
    };
  }, []);

  if (!Toaster) return null;

  return <Toaster richColors closeButton position="top-right" />;
}
