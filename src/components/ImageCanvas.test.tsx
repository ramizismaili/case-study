import { act, fireEvent, render, screen } from "@testing-library/react";
import { ImageCanvas } from "./ImageCanvas";
import type { Size } from "../lib/coordinates";

// jsdom does not perform layout. Deliver explicit, deterministic viewport sizes.
let resizeViewport: (size: Size) => void;
const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock implements ResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}

  observe(target: Element) {
    resizeViewport = ({ width, height }) => {
      this.callback(
        [
          {
            target,
            contentRect: new DOMRect(0, 0, width, height),
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: [],
          },
        ],
        this
      );
    };
  }

  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock;
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  jest.restoreAllMocks();
});

function loadImage() {
  // The image is deliberately hidden until its dimensions are available.
  const image = screen.getByAltText(
    "Alpine escape travel design with an illustrated mountain landscape"
  );
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 1600 },
    naturalHeight: { configurable: true, value: 1000 },
  });
  fireEvent.load(image);
  return image;
}

describe("ImageCanvas", () => {
  it("renders an image that finished loading before hydration", () => {
    jest
      .spyOn(HTMLImageElement.prototype, "complete", "get")
      .mockReturnValue(true);
    jest
      .spyOn(HTMLImageElement.prototype, "naturalWidth", "get")
      .mockReturnValue(1600);
    jest
      .spyOn(HTMLImageElement.prototype, "naturalHeight", "get")
      .mockReturnValue(1000);
    render(<ImageCanvas />);

    act(() => resizeViewport({ width: 1000, height: 700 }));

    expect(screen.getByRole("img")).toBeVisible();
    expect(screen.getByRole("img")).toHaveStyle({
      width: "936px",
      height: "585px",
    });
  });

  it("renders the named image review region and its comment layer", () => {
    render(
      <ImageCanvas>
        <button>Comment overlay</button>
      </ImageCanvas>
    );

    expect(screen.getByRole("heading", { name: "Image Review" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Image review canvas" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Comment overlay" })
    ).toBeVisible();
  });

  it("fits the loaded image inside the measured viewport", () => {
    render(<ImageCanvas />);
    act(() => resizeViewport({ width: 1000, height: 700 }));

    const image = loadImage();

    expect(image).toBeVisible();
    expect(image).toHaveStyle({
      width: "936px",
      height: "585px",
      transform: "translate(32px, 57.5px)",
    });
    expect(image).toHaveAttribute("draggable", "false");
  });

  it("refits the same image after a viewport resize", () => {
    render(<ImageCanvas />);
    act(() => resizeViewport({ width: 1000, height: 700 }));
    const image = loadImage();

    act(() => resizeViewport({ width: 800, height: 600 }));

    expect(image).toHaveStyle({
      width: "736px",
      height: "460px",
      transform: "translate(32px, 70px)",
    });
  });

  it("waits for both image dimensions and viewport measurements", () => {
    render(<ImageCanvas />);

    const image = loadImage();
    expect(image).not.toBeVisible();
    act(() => resizeViewport({ width: 1000, height: 700 }));

    expect(image).toBeVisible();
  });
});
