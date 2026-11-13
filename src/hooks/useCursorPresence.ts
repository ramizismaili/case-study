"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useStatus, useUpdateMyPresence } from "@liveblocks/react";
import { useImageCanvas } from "../components/ImageCanvasContext";
import {
  clientToViewport,
  viewportToImage,
  type ImagePoint,
  type Point,
} from "../lib/coordinates";
import { isImageCursor } from "../lib/collaborators";

export const CURSOR_UPDATE_INTERVAL = 50;

export function useCursorPresence() {
  const geometry = useImageCanvas();
  const { viewportRef, transform } = geometry;
  const latestGeometry = useRef(geometry);
  const updateMyPresence = useUpdateMyPresence();
  const connected = useStatus() === "connected";
  const ready = transform !== null;

  useLayoutEffect(() => {
    latestGeometry.current = geometry;
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !connected || !ready) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Point | null = null;
    let shared: ImagePoint | null = null;

    function clear() {
      clearTimeout(timer);
      timer = undefined;
      pending = null;
      if (shared) updateMyPresence({ cursor: null });
      shared = null;
    }

    function imagePoint(client: Point): ImagePoint | null {
      const { transform, imageSize, viewportSize } = latestGeometry.current;
      if (!transform || !viewport) return null;
      const point = clientToViewport(client, viewport.getBoundingClientRect());
      // Pointer capture can deliver moves outside the visible canvas.
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x > viewportSize.width ||
        point.y > viewportSize.height
      )
        return null;
      const cursor = viewportToImage(point, imageSize, transform);
      return isImageCursor(cursor) ? cursor : null;
    }

    function flush() {
      timer = undefined;
      const cursor = pending && imagePoint(pending);
      pending = null;
      if (!cursor) {
        clear();
        return;
      }
      if (cursor.x !== shared?.x || cursor.y !== shared?.y) {
        updateMyPresence({ cursor });
        shared = cursor;
      }
    }

    function move(event: PointerEvent) {
      // Pins (including nested avatar elements) still point at the image.
      // Keep this separate from data-canvas-surface, which also enables panning.
      if (
        event.pointerType === "touch" ||
        !event.isPrimary ||
        !(event.target instanceof Element) ||
        (!event.target.hasAttribute("data-canvas-surface") &&
          !event.target.closest("[data-cursor-surface]"))
      ) {
        clear();
        return;
      }
      const point = { x: event.clientX, y: event.clientY };
      if (!imagePoint(point)) {
        clear();
        return;
      }
      pending = point;
      // Read the latest geometry when flushing, after a local pan has rendered.
      // Camera-only changes never schedule a presence update.
      timer ??= setTimeout(flush, CURSOR_UPDATE_INTERVAL);
    }

    function visibilityChanged() {
      if (document.visibilityState === "hidden") clear();
    }

    viewport.addEventListener("pointermove", move, {
      passive: true,
      capture: true,
    });
    viewport.addEventListener("pointerleave", clear);
    viewport.addEventListener("pointercancel", clear, true);
    viewport.addEventListener("lostpointercapture", clear, true);
    window.addEventListener("blur", clear);
    window.addEventListener("pagehide", clear);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      clear();
      viewport.removeEventListener("pointermove", move, true);
      viewport.removeEventListener("pointerleave", clear);
      viewport.removeEventListener("pointercancel", clear, true);
      viewport.removeEventListener("lostpointercapture", clear, true);
      window.removeEventListener("blur", clear);
      window.removeEventListener("pagehide", clear);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [viewportRef, updateMyPresence, connected, ready]);
}
