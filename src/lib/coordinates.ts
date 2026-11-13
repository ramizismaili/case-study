/** A point in the coordinate space specified by its caller. */
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Bounds = Size & { left: number; top: number };

/** Image-local fractions: (0, 0) is top-left, (1, 1) is bottom-right. */
export type ImagePoint = Point;

export type ViewportTransform = {
  /** Image top-left, in CSS pixels relative to the canvas viewport. */
  origin: Point;
  /** CSS pixels per natural image pixel, including fit and user zoom. */
  scale: number;
};

/** Fit an image without cropping or upscaling; pan is measured in CSS pixels. */
export function getImageTransform(
  image: Size,
  viewport: Size,
  pan: Point = { x: 0, y: 0 },
  zoom = 1,
  padding = 32
): ViewportTransform | null {
  const availableWidth = viewport.width - padding * 2;
  const availableHeight = viewport.height - padding * 2;
  if (
    ![image.width, image.height, availableWidth, availableHeight, zoom].every(
      (value) => Number.isFinite(value) && value > 0
    ) ||
    ![pan.x, pan.y, padding].every(Number.isFinite) ||
    padding < 0
  ) {
    return null;
  }

  const fit = Math.min(
    availableWidth / image.width,
    availableHeight / image.height,
    1
  );
  const scale = fit * zoom;

  return {
    origin: {
      x: (viewport.width - image.width * scale) / 2 + pan.x,
      y: (viewport.height - image.height * scale) / 2 + pan.y,
    },
    scale,
  };
}

/** Pointer client coordinates and DOM bounds both use the browser viewport. */
export function clientToViewport(
  point: Point,
  bounds: Pick<Bounds, "left" | "top">
): Point {
  return { x: point.x - bounds.left, y: point.y - bounds.top };
}

export function imageToViewport(
  point: ImagePoint,
  image: Size,
  transform: ViewportTransform
): Point {
  return {
    x: transform.origin.x + point.x * image.width * transform.scale,
    y: transform.origin.y + point.y * image.height * transform.scale,
  };
}

/** Do not clamp: callers must distinguish clicks outside the image. */
export function viewportToImage(
  point: Point,
  image: Size,
  transform: ViewportTransform
): ImagePoint {
  return {
    x: (point.x - transform.origin.x) / (image.width * transform.scale),
    y: (point.y - transform.origin.y) / (image.height * transform.scale),
  };
}

export function isWithinImage(point: ImagePoint): boolean {
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}
