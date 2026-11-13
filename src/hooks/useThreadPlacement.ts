"use client";

import { useLayoutEffect, useState, type CSSProperties } from "react";
import { useImageCanvas } from "../components/ImageCanvasContext";
import type { Point, Size } from "../lib/coordinates";
import { getThreadPlacement, THREAD_WIDTH } from "../lib/thread-placement";

export function useThreadPlacement(anchor: Point) {
  const { imageSize, transform, viewportSize } = useImageCanvas();
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [measured, setMeasured] = useState<Size>({
    width: THREAD_WIDTH,
    height: 0,
  });

  // Re-measure after a viewport resize before paint: the width constraint may
  // have changed, which can also change the height through text wrapping.
  useLayoutEffect(() => {
    if (!element) return;
    function measure() {
      if (!element) return;
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      setMeasured((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height }
      );
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, viewportSize.width, viewportSize.height]);

  const placement = getThreadPlacement(
    anchor,
    {
      left: transform?.origin.x ?? 0,
      top: transform?.origin.y ?? 0,
      width: imageSize.width * (transform?.scale ?? 0),
      height: imageSize.height * (transform?.scale ?? 0),
    },
    viewportSize,
    measured
  );

  const style: CSSProperties = {
    inlineSize: Math.min(THREAD_WIDTH, placement.maxWidth),
    maxInlineSize: placement.maxWidth,
    maxBlockSize: placement.maxHeight,
    overflow: "auto",
    overscrollBehavior: "contain",
    // Keep the mounted draft intact when its pin is panned out of view.
    visibility:
      anchor.x < 0 ||
      anchor.x > viewportSize.width ||
      anchor.y < 0 ||
      anchor.y > viewportSize.height
        ? "hidden"
        : undefined,
  };

  return {
    ref: setElement,
    side: placement.side,
    align: "start" as const,
    sideOffset: placement.sideOffset,
    alignOffset: placement.alignOffset,
    style,
  };
}
