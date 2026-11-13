import type { ThreadData } from "@liveblocks/client";
import {
  imageToViewport,
  viewportToImage,
  type ImagePoint,
  type Point,
  type Size,
  type ViewportTransform,
} from "./coordinates";

/** Legacy pins remain readable without guessing their original image layout. */
export function getThreadPosition(
  metadata: ThreadData["metadata"],
  image: Size,
  transform: ViewportTransform
): Point {
  return metadata.coordinateSpace === "image"
    ? imageToViewport(metadata, image, transform)
    : { x: metadata.x, y: metadata.y };
}

/** Pin drag deltas are CSS pixels; persisted anchors are image fractions. */
export function getDraggedImageAnchor(
  start: Point,
  delta: Point,
  image: Size,
  transform: ViewportTransform
): ImagePoint {
  const anchor = viewportToImage(
    { x: start.x + delta.x, y: start.y + delta.y },
    image,
    transform
  );
  return {
    x: Math.max(0, Math.min(1, anchor.x)),
    y: Math.max(0, Math.min(1, anchor.y)),
  };
}
