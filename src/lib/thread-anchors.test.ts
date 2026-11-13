import { getDraggedImageAnchor, getThreadPosition } from "./thread-anchors";

describe("thread anchor positioning", () => {
  const image = { width: 1000, height: 500 };
  const transform = { origin: { x: 100, y: 80 }, scale: 0.5 };

  it("renders a normalized anchor at the corresponding image point", () => {
    const metadata = {
      x: 0.2,
      y: 0.4,
      coordinateSpace: "image" as const,
      zIndex: 1,
    };

    const point = getThreadPosition(metadata, image, transform);

    expect(point).toEqual({ x: 200, y: 180 });
  });

  it("preserves legacy viewport pixels, even when they are between zero and one", () => {
    const metadata = { x: 0.2, y: 0.4, zIndex: 1 };

    const point = getThreadPosition(metadata, image, transform);

    expect(point).toEqual({ x: 0.2, y: 0.4 });
    expect(metadata).toEqual({ x: 0.2, y: 0.4, zIndex: 1 });
  });

  it("converts a CSS-pixel drag into image fractions at the fitted scale", () => {
    const anchor = getDraggedImageAnchor(
      { x: 350, y: 205 },
      { x: 50, y: -25 },
      image,
      transform
    );

    expect(anchor).toEqual({ x: 0.6, y: 0.4 });
  });

  it("accounts for zoom when converting the same drag distance", () => {
    const anchor = getDraggedImageAnchor(
      { x: 1100, y: 580 },
      { x: 50, y: -25 },
      image,
      { ...transform, scale: 2 }
    );

    expect(anchor).toEqual({ x: 0.525, y: 0.475 });
  });

  it.each([
    [
      { x: -1000, y: -1000 },
      { x: 0, y: 0 },
    ],
    [
      { x: 1000, y: 1000 },
      { x: 1, y: 1 },
    ],
  ])("keeps a dragged pin on the image at the edge", (delta, expected) => {
    const anchor = getDraggedImageAnchor(
      { x: 350, y: 205 },
      delta,
      image,
      transform
    );

    expect(anchor).toEqual(expected);
  });
});
