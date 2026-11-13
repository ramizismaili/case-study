import type { Bounds, Point, Size } from "./coordinates";

export const THREAD_WIDTH = 350;
export const COMMENT_PIN_SIZE = 32;
export const THREAD_GAP = 12;
export const VIEWPORT_PADDING = 12;

/** All inputs and offsets are CSS pixels relative to the canvas viewport. */
export function getThreadPlacement(
  anchor: Point,
  image: Bounds,
  viewport: Size,
  measured: Size
) {
  const maxWidth = Math.max(0, viewport.width - 2 * VIEWPORT_PADDING);
  const maxHeight = Math.max(0, viewport.height - 2 * VIEWPORT_PADDING);
  const width = Math.min(measured.width, maxWidth);
  const height = Math.min(measured.height, maxHeight);
  const rightStart = anchor.x + COMMENT_PIN_SIZE + THREAD_GAP;
  const rightSpace = viewport.width - VIEWPORT_PADDING - rightStart;
  const leftSpace = anchor.x - THREAD_GAP - VIEWPORT_PADDING;
  const imageRightSpace = image.left + image.width - rightStart;
  const imageLeftSpace = anchor.x - image.left - THREAD_GAP;
  const preferLeft =
    imageRightSpace < width && imageLeftSpace > imageRightSpace;

  // Prefer the image's interior, but visible viewport space takes priority.
  const side: "left" | "right" =
    rightSpace >= width && (!preferLeft || leftSpace < width)
      ? "right"
      : leftSpace >= width || leftSpace > rightSpace
        ? "left"
        : "right";
  const desiredLeft =
    side === "right" ? rightStart : anchor.x - THREAD_GAP - width;
  const left = Math.max(
    VIEWPORT_PADDING,
    Math.min(desiredLeft, viewport.width - VIEWPORT_PADDING - width)
  );
  const top = Math.max(
    VIEWPORT_PADDING,
    Math.min(anchor.y, viewport.height - VIEWPORT_PADDING - height)
  );

  return {
    side,
    // On narrow screens these offsets allow overlap with the pin instead of
    // squeezing the editor into an unusably narrow column or moving the anchor.
    sideOffset:
      side === "right"
        ? left - anchor.x - COMMENT_PIN_SIZE
        : anchor.x - left - width,
    alignOffset: top - anchor.y,
    maxWidth,
    maxHeight,
  };
}
