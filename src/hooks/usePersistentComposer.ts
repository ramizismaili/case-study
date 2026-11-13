"use client";

import { useEffect, useLayoutEffect, useState } from "react";

/** Keep the SDK editor mounted when its floating thread unmounts on close. */
export function usePersistentComposer(
  threadElement: HTMLElement | null,
  open: boolean
) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open || host) return;
    const element = document.createElement("div");
    element.className = "lb-thread-composer";
    setHost(element);
  }, [open, host]);
  useLayoutEffect(() => {
    if (!host || !threadElement) return;
    threadElement.appendChild(host);
    return () => host.remove();
  }, [host, threadElement]);
  return host;
}
