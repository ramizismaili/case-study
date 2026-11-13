import {
  clientToViewport,
  getImageTransform,
  imageToViewport,
  isWithinImage,
  viewportToImage,
  type Size,
  type ViewportTransform,
} from "./coordinates";

describe("image fitting", () => {
  it("fits and centers a landscape image without cropping", () => {
    const image = { width: 1600, height: 1000 };
    const viewport = { width: 1000, height: 700 };

    const transform = getImageTransform(image, viewport);

    expect(transform).toEqual({
      origin: { x: 32, y: 57.5 },
      scale: 0.585,
    });
  });

  it("fits a portrait image using the available height", () => {
    const transform = getImageTransform(
      { width: 400, height: 800 },
      { width: 800, height: 600 },
      { x: 0, y: 0 },
      1,
      0
    );

    expect(transform).toEqual({ origin: { x: 250, y: 0 }, scale: 0.75 });
  });

  it("centers a small image at its natural resolution", () => {
    const transform = getImageTransform(
      { width: 100, height: 100 },
      { width: 800, height: 600 }
    );

    expect(transform).toEqual({ origin: { x: 350, y: 250 }, scale: 1 });
  });

  it("applies pan in viewport pixels after zooming around the center", () => {
    const transform = getImageTransform(
      { width: 1000, height: 500 },
      { width: 800, height: 600 },
      { x: 75, y: -25 },
      2,
      0
    );

    expect(transform).toEqual({ origin: { x: -325, y: -125 }, scale: 1.6 });
  });

  it.each([
    { width: 0, height: 100 },
    { width: 100, height: 0 },
    { width: -1, height: 100 },
    { width: Number.NaN, height: 100 },
    { width: 100, height: Number.POSITIVE_INFINITY },
  ])("does not transform an invalid image size: %j", (image) => {
    expect(getImageTransform(image, { width: 800, height: 600 })).toBeNull();
  });

  it("waits for a viewport with space for the image and padding", () => {
    const image = { width: 1000, height: 500 };

    expect(getImageTransform(image, { width: 0, height: 0 })).toBeNull();
    expect(getImageTransform(image, { width: 64, height: 600 })).toBeNull();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid scale multiplier: %s",
    (zoom) => {
      expect(
        getImageTransform(
          { width: 1000, height: 500 },
          { width: 800, height: 600 },
          { x: 0, y: 0 },
          zoom
        )
      ).toBeNull();
    }
  );
});

describe("coordinate conversion", () => {
  const image: Size = { width: 1000, height: 500 };
  const transform: ViewportTransform = {
    origin: { x: 100, y: 80 },
    scale: 0.5,
  };

  it.each([
    [
      { x: 0, y: 0 },
      { x: 100, y: 80 },
    ],
    [
      { x: 0.5, y: 0.5 },
      { x: 350, y: 205 },
    ],
    [
      { x: 1, y: 1 },
      { x: 600, y: 330 },
    ],
  ])("maps image anchor %j to viewport pixels %j", (anchor, expected) => {
    const point = imageToViewport(anchor, image, transform);

    expect(point).toEqual(expected);
  });

  it("maps browser client pixels back to a normalized image anchor", () => {
    const clientPoint = { x: 450, y: 325 };
    const viewportBounds = { left: 100, top: 120 };

    const point = viewportToImage(
      clientToViewport(clientPoint, viewportBounds),
      image,
      transform
    );

    expect(point).toEqual({ x: 0.5, y: 0.5 });
  });

  it("uses current DOM bounds even when the viewport is partially offscreen", () => {
    const point = clientToViewport({ x: 20, y: 30 }, { left: -40, top: -100 });

    expect(point).toEqual({ x: 60, y: 130 });
  });

  it.each([0.25, 0.5, 1, 2, 4])(
    "places an off-center anchor at the expected pixels at zoom %s",
    (zoom) => {
      const fitted = getImageTransform(
        image,
        { width: 800, height: 600 },
        { x: 0, y: 0 },
        zoom,
        0
      );
      if (!fitted) throw new Error("Expected a valid transform");

      const point = imageToViewport({ x: 0.25, y: 0.75 }, image, fitted);

      expect(point.x).toBeCloseTo(400 - 200 * zoom);
      expect(point.y).toBeCloseTo(300 + 100 * zoom);
    }
  );

  it.each([0.25, 0.5, 1, 2, 4])(
    "preserves fractional anchors at zoom %s through pan and resize",
    (zoom) => {
      const anchor = { x: 0.123456789, y: 0.87654321 };
      const viewports = [
        { width: 375, height: 600 },
        { width: 1440, height: 900 },
      ];

      for (const viewport of viewports) {
        const fitted = getImageTransform(
          image,
          viewport,
          { x: -175.25, y: 92.75 },
          zoom
        );
        if (!fitted) throw new Error("Expected a valid transform");

        const screenPoint = imageToViewport(anchor, image, fitted);
        const restored = viewportToImage(screenPoint, image, fitted);

        expect(restored.x).toBeCloseTo(anchor.x, 12);
        expect(restored.y).toBeCloseTo(anchor.y, 12);
      }
    }
  );

  it("keeps the image center at the viewport center after resizing", () => {
    for (const viewport of [
      { width: 400, height: 700 },
      { width: 1400, height: 900 },
    ]) {
      const fitted = getImageTransform(image, viewport);
      if (!fitted) throw new Error("Expected a valid transform");

      const center = imageToViewport({ x: 0.5, y: 0.5 }, image, fitted);

      expect(center.x).toBeCloseTo(viewport.width / 2);
      expect(center.y).toBeCloseTo(viewport.height / 2);
    }
  });

  it("does not clamp an outside point onto the image edge", () => {
    const point = viewportToImage({ x: 99, y: 80 }, image, transform);

    expect(point.x).toBeLessThan(0);
    expect(isWithinImage(point)).toBe(false);
  });
});

describe("image boundary detection", () => {
  it.each([
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: 0.5, y: 0.5 },
  ])("accepts an anchor on or within the boundary: %j", (point) => {
    expect(isWithinImage(point)).toBe(true);
  });

  it.each([
    { x: -0.0001, y: 0.5 },
    { x: 1.0001, y: 0.5 },
    { x: 0.5, y: -0.0001 },
    { x: 0.5, y: 1.0001 },
    { x: Number.NaN, y: 0.5 },
    { x: 0.5, y: Number.POSITIVE_INFINITY },
  ])("rejects an anchor outside the image: %j", (point) => {
    expect(isWithinImage(point)).toBe(false);
  });
});
