"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { getImageTransform, type Point, type Size } from "../lib/coordinates";
import {
  hasDragged,
  panFromPointer,
  zoomAtCenter,
  ZOOM_STEP,
  type CanvasView,
} from "../lib/canvas-view";

type Gesture =
  | { type: "idle" }
  | {
      type: "pending" | "panning";
      pointerId: number;
      start: Point;
      startPan: Point;
      target: HTMLElement;
    };

function releaseCapture(gesture: Gesture) {
  if (
    gesture.type !== "idle" &&
    gesture.target.hasPointerCapture(gesture.pointerId)
  ) {
    gesture.target.releasePointerCapture(gesture.pointerId);
  }
}

export function useCanvasView(imageSize: Size, viewportSize: Size) {
  const [view, setView] = useState<CanvasView>({
    pan: { x: 0, y: 0 },
    zoom: 1,
  });
  const [isPanning, setIsPanning] = useState(false);
  const gestureRef = useRef<Gesture>({ type: "idle" });
  const suppressClickRef = useRef(false);
  const transform = getImageTransform(
    imageSize,
    viewportSize,
    view.pan,
    view.zoom
  );
  const ready = transform !== null;

  const finishGesture = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = { type: "idle" };
    releaseCapture(gesture);
    setIsPanning(false);
  }, []);

  const cancelGesture = useCallback(() => {
    if (gestureRef.current.type !== "idle") suppressClickRef.current = true;
    finishGesture();
  }, [finishGesture]);

  useEffect(() => {
    window.addEventListener("blur", cancelGesture);
    return () => {
      window.removeEventListener("blur", cancelGesture);
      releaseCapture(gestureRef.current);
      gestureRef.current = { type: "idle" };
    };
  }, [cancelGesture]);

  useEffect(() => {
    if (!ready) cancelGesture();
  }, [ready, cancelGesture]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (gestureRef.current.type !== "idle") return;
    // A new pointer gesture must not inherit suppression from a cancelled one.
    suppressClickRef.current = false;
    const target = event.target;
    if (
      !ready ||
      !event.isPrimary ||
      event.button !== 0 ||
      !(target instanceof HTMLElement) ||
      !target.hasAttribute("data-canvas-surface")
    )
      return;

    gestureRef.current = {
      type: "pending",
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      startPan: view.pan,
      target,
    };
    // Capture on the original surface so a normal click still reaches the image.
    target.setPointerCapture(event.pointerId);
  }

  function updatePan(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (gesture.type === "idle" || gesture.pointerId !== event.pointerId)
      return false;
    const current = { x: event.clientX, y: event.clientY };
    if (gesture.type === "pending" && !hasDragged(gesture.start, current))
      return false;

    gestureRef.current = { ...gesture, type: "panning" };
    setIsPanning(true);
    setView((previous) => ({
      ...previous,
      pan: panFromPointer(gesture.startPan, gesture.start, current),
    }));
    return true;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (updatePan(event)) event.preventDefault();
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (gesture.type === "idle" || gesture.pointerId !== event.pointerId)
      return;
    // Include the release position even if the last move event was coalesced.
    suppressClickRef.current = updatePan(event);
    finishGesture();
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (gesture.type !== "idle" && gesture.pointerId === event.pointerId)
      cancelGesture();
  }

  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    // Keyboard activation (detail 0) remains available after a drag.
    if (
      suppressClickRef.current &&
      event.detail !== 0 &&
      event.target instanceof HTMLElement &&
      event.target.hasAttribute("data-canvas-surface")
    ) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function changeZoom(delta: number) {
    cancelGesture();
    setView((previous) => zoomAtCenter(previous, previous.zoom + delta));
  }

  function resetView() {
    cancelGesture();
    setView({ pan: { x: 0, y: 0 }, zoom: 1 });
  }

  return {
    transform,
    zoom: view.zoom,
    isPanning,
    zoomIn: () => changeZoom(ZOOM_STEP),
    zoomOut: () => changeZoom(-ZOOM_STEP),
    resetView,
    viewportHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture: onPointerCancel,
      onClickCapture,
    },
  };
}
