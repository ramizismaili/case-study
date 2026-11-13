import {
  DRAG_THRESHOLD,
  MIN_ZOOM,
  MAX_ZOOM,
  hasDragged,
  panFromPointer,
  zoomAtCenter,
  focusImagePoint,
} from "./canvas-view";
import {
  getImageTransform,
  imageToViewport,
  viewportToImage,
} from "./coordinates";

describe("focusing image anchors", () => {
  it.each([0.25, 1, 2, 4])(
    "centers an anchor without changing zoom %s",
    (zoom) => {
      const image = { width: 1600, height: 1000 };
      for (const viewport of [
        { width: 1000, height: 700 },
        { width: 580, height: 500 },
      ]) {
        const anchor = { x: 0.9, y: 0.1 };
        const next = focusImagePoint(
          { pan: { x: -900, y: 350 }, zoom },
          anchor,
          image,
          viewport
        );
        const point = imageToViewport(
          anchor,
          image,
          getImageTransform(image, viewport, next.pan, next.zoom)!
        );
        expect(point.x).toBeCloseTo(viewport.width / 2);
        expect(point.y).toBeCloseTo(viewport.height / 2);
        expect(next.zoom).toBe(zoom);
        expect(anchor).toEqual({ x: 0.9, y: 0.1 });
      }
    }
  );
  it("ignores unavailable geometry and invalid coordinates", () => {
    const view = { pan: { x: 10, y: 20 }, zoom: 1 };
    expect(
      focusImagePoint(
        view,
        { x: NaN, y: 0.5 },
        { width: 1000, height: 500 },
        { width: 800, height: 600 }
      )
    ).toBe(view);
    expect(
      focusImagePoint(
        view,
        { x: 0.5, y: 0.5 },
        { width: 0, height: 0 },
        { width: 800, height: 600 }
      )
    ).toBe(view);
  });
});

describe("canvas zoom", () => {
  it.each([
    [0.01, MIN_ZOOM],
    [MIN_ZOOM, MIN_ZOOM],
    [1.5, 1.5],
    [MAX_ZOOM, MAX_ZOOM],
    [100, MAX_ZOOM],
  ])("clamps requested zoom %s to %s", (requested, expected) => {
    const result = zoomAtCenter({ pan: { x: 0, y: 0 }, zoom: 1 }, requested);

    expect(result.zoom).toBe(expected);
  });

  it("scales pan by the zoom ratio", () => {
    const result = zoomAtCenter({ pan: { x: 100, y: -50 }, zoom: 2 }, 3);

    expect(result).toEqual({ pan: { x: 150, y: -75 }, zoom: 3 });
  });

  it.each([0.25, 0.5, 1.25, 2, 4])(
    "keeps the same image point beneath the viewport center at zoom %s",
    (requested) => {
      const image = { width: 1600, height: 1000 };
      const viewport = { width: 1000, height: 700 };
      const center = { x: 500, y: 350 };
      const view = { pan: { x: 125.5, y: -70.25 }, zoom: 1.5 };
      const before = getImageTransform(image, viewport, view.pan, view.zoom);
      const next = zoomAtCenter(view, requested);
      const after = getImageTransform(image, viewport, next.pan, next.zoom);
      if (!before || !after) throw new Error("Expected valid transforms");

      const previousAnchor = viewportToImage(center, image, before);
      const nextAnchor = viewportToImage(center, image, after);

      expect(nextAnchor.x).toBeCloseTo(previousAnchor.x, 12);
      expect(nextAnchor.y).toBeCloseTo(previousAnchor.y, 12);
    }
  );

  it("uses the clamped zoom ratio when preserving the center", () => {
    const result = zoomAtCenter({ pan: { x: 90, y: -60 }, zoom: 3 }, 10);

    expect(result).toEqual({ pan: { x: 120, y: -80 }, zoom: MAX_ZOOM });
  });

  it("does not change the view for an invalid zoom", () => {
    const view = { pan: { x: 50, y: 25 }, zoom: 1 };

    expect(zoomAtCenter(view, Number.NaN)).toEqual(view);
  });
});

describe("canvas dragging", () => {
  it("adds pointer movement to the original pan in CSS pixels", () => {
    const pan = panFromPointer(
      { x: 10, y: -5 },
      { x: 100, y: 200 },
      { x: 150, y: 175 }
    );

    expect(pan).toEqual({ x: 60, y: -30 });
  });

  it("does not classify small pointer jitter as a drag", () => {
    expect(hasDragged({ x: 100, y: 200 }, { x: 102, y: 202 })).toBe(false);
  });

  it("recognizes movement at the threshold", () => {
    expect(
      hasDragged({ x: 100, y: 200 }, { x: 100 + DRAG_THRESHOLD, y: 200 })
    ).toBe(true);
  });

  it("recognizes diagonal movement by its distance", () => {
    expect(hasDragged({ x: 100, y: 200 }, { x: 103, y: 203 })).toBe(true);
  });
});
