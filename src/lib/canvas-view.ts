import {
  getImageTransform,
  imageToViewport,
  type ImagePoint,
  type Point,
  type Size,
} from "./coordinates";

export type CanvasView = { pan: Point; zoom: number };

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 0.25;
export const DRAG_THRESHOLD = 4;

/** Pan an image anchor to the center of the currently measured canvas. */
export function focusImagePoint(
  view: CanvasView,
  anchor: ImagePoint,
  image: Size,
  viewport: Size
): CanvasView {
  const transform = getImageTransform(image, viewport, view.pan, view.zoom);
  if (!transform || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y))
    return view;
  const point = imageToViewport(anchor, image, transform);
  return {
    ...view,
    pan: {
      x: view.pan.x + viewport.width / 2 - point.x,
      y: view.pan.y + viewport.height / 2 - point.y,
    },
  };
}

export function hasDragged(start: Point, current: Point): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= DRAG_THRESHOLD;
}

export function panFromPointer(
  startPan: Point,
  start: Point,
  current: Point
): Point {
  return {
    x: startPan.x + current.x - start.x,
    y: startPan.y + current.y - start.y,
  };
}

/** Preserve the image point under the viewport center, including after a pan. */
export function zoomAtCenter(
  view: CanvasView,
  requestedZoom: number
): CanvasView {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, requestedZoom));
  if (!Number.isFinite(zoom) || zoom === view.zoom) return view;

  const ratio = zoom / view.zoom;
  return { zoom, pan: { x: view.pan.x * ratio, y: view.pan.y * ratio } };
}
