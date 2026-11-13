import {
  getImageTransform,
  imageToViewport,
  type Point,
  type Size,
} from "./coordinates";
import {
  COMMENT_PIN_SIZE,
  getThreadPlacement,
  THREAD_GAP,
  VIEWPORT_PADDING,
} from "./thread-placement";

const viewport = { width: 1000, height: 700 };
const image = { left: 32, top: 32, width: 936, height: 585 };
const popover = { width: 350, height: 260 };

function getBounds(
  anchor: Point,
  size: Size,
  placement: ReturnType<typeof getThreadPlacement>
) {
  const width = Math.min(size.width, placement.maxWidth);
  const height = Math.min(size.height, placement.maxHeight);
  const left =
    placement.side === "right"
      ? anchor.x + COMMENT_PIN_SIZE + placement.sideOffset
      : anchor.x - placement.sideOffset - width;
  const top = anchor.y + placement.alignOffset;
  return { left, top, right: left + width, bottom: top + height };
}

describe("thread alignment", () => {
  it.each([
    [{ x: 32, y: 100 }, "right"],
    [{ x: 400, y: 100 }, "right"],
    [{ x: 620, y: 100 }, "left"],
    [{ x: 968, y: 100 }, "left"],
  ] as const)("opens at %j on the %s", (anchor, side) => {
    const placement = getThreadPlacement(anchor, image, viewport, popover);

    expect(placement.side).toBe(side);
    expect(placement.sideOffset).toBe(THREAD_GAP);
  });

  it("opens inwards near the image edge even with canvas space on the right", () => {
    const placement = getThreadPlacement(
      { x: 650, y: 100 },
      { ...image, left: 200, width: 500 },
      { width: 1400, height: 700 },
      popover
    );

    expect(placement.side).toBe("left");
  });

  it("prioritizes visible canvas space when the image extends beyond the viewport", () => {
    const placement = getThreadPlacement(
      { x: 900, y: 100 },
      { ...image, left: -1000, width: 3000 },
      viewport,
      popover
    );

    expect(placement.side).toBe("left");
  });

  it("uses the actual popover width to decide whether to flip", () => {
    const anchor = { x: 600, y: 100 };

    const small = getThreadPlacement(anchor, image, viewport, {
      width: 200,
      height: 260,
    });
    const large = getThreadPlacement(anchor, image, viewport, {
      width: 400,
      height: 260,
    });

    expect(small.side).toBe("right");
    expect(large.side).toBe("left");
  });

  it("keeps the same anchor while flipping after pan or zoom", () => {
    const anchor = { x: 0.6, y: 0.5 };
    const naturalSize = { width: 1000, height: 500 };
    const views = [
      { pan: { x: -350, y: 0 }, zoom: 1, side: "right" },
      { pan: { x: 100, y: 0 }, zoom: 1, side: "left" },
      { pan: { x: 0, y: 0 }, zoom: 2, side: "left" },
    ];

    for (const view of views) {
      const transform = getImageTransform(
        naturalSize,
        viewport,
        view.pan,
        view.zoom
      );
      if (!transform) throw new Error("Expected valid geometry");
      const point = imageToViewport(anchor, naturalSize, transform);
      const bounds = {
        left: transform.origin.x,
        top: transform.origin.y,
        width: naturalSize.width * transform.scale,
        height: naturalSize.height * transform.scale,
      };

      const placement = getThreadPlacement(point, bounds, viewport, popover);

      expect(placement.side).toBe(view.side);
    }
    expect(anchor).toEqual({ x: 0.6, y: 0.5 });
  });
});

describe("popover viewport boundaries", () => {
  it.each([
    { x: 0, y: 0 },
    { x: 999, y: 0 },
    { x: 0, y: 699 },
    { x: 999, y: 699 },
    { x: -500, y: -500 },
    { x: 1500, y: 1200 },
    { x: 512.25, y: 610.75 },
  ])("keeps every edge visible for anchor %j", (anchor) => {
    const placement = getThreadPlacement(anchor, image, viewport, popover);

    const bounds = getBounds(anchor, popover, placement);

    expect(bounds.left).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
    expect(bounds.top).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width - VIEWPORT_PADDING);
    expect(bounds.bottom).toBeLessThanOrEqual(
      viewport.height - VIEWPORT_PADDING
    );
  });

  it("shifts upwards as thread content grows", () => {
    const anchor = { x: 800, y: 500 };
    const short = getThreadPlacement(anchor, image, viewport, {
      width: 350,
      height: 100,
    });
    const tall = getThreadPlacement(anchor, image, viewport, {
      width: 350,
      height: 600,
    });

    expect(short.alignOffset).toBe(0);
    expect(tall.alignOffset).toBe(-412);
  });

  it("allows overlap when neither side has room, keeping a usable editor width", () => {
    const narrow = { width: 500, height: 500 };
    const anchor = { x: 250, y: 100 };
    const placement = getThreadPlacement(anchor, image, narrow, popover);

    const bounds = getBounds(anchor, popover, placement);

    expect(placement.sideOffset).toBeLessThan(0);
    expect(bounds.right - bounds.left).toBe(350);
    expect(bounds.left).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
    expect(bounds.right).toBeLessThanOrEqual(narrow.width - VIEWPORT_PADDING);
  });

  it("constrains oversized content after a viewport resize", () => {
    const small = { width: 280, height: 320 };
    const anchor = { x: 250, y: 300 };
    const oversized = { width: 350, height: 1000 };

    const placement = getThreadPlacement(anchor, image, small, oversized);
    const bounds = getBounds(anchor, oversized, placement);

    expect(placement.maxWidth).toBe(256);
    expect(placement.maxHeight).toBe(296);
    expect(bounds).toEqual({ left: 12, top: 12, right: 268, bottom: 308 });
  });
});
