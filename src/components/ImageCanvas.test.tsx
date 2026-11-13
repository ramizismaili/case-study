import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageCanvas } from "./ImageCanvas";
import type { Size } from "../lib/coordinates";
import { mockCanvasPointerEvents } from "../test/canvas-dom";

// jsdom does not perform layout. Deliver explicit, deterministic viewport sizes.
let resizeViewport: (size: Size) => void;
const originalResizeObserver = globalThis.ResizeObserver;
let restorePointerEvents: () => void;

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
  restorePointerEvents = mockCanvasPointerEvents();
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  restorePointerEvents();
  jest.restoreAllMocks();
});

function renderReadyCanvas() {
  const view = render(<ImageCanvas />);
  act(() => resizeViewport({ width: 1000, height: 700 }));
  const image = loadImage();
  const viewport = screen.getByRole("region", { name: "Image review canvas" });
  return { ...view, image, viewport };
}

describe("canvas navigation", () => {
  it("disables navigation until image geometry is available", () => {
    render(<ImageCanvas />);

    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset view" })).toBeDisabled();
  });

  it("zooms in and out through the accessible controls", async () => {
    const user = userEvent.setup();
    const { image } = renderReadyCanvas();

    await user.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("125%");
    expect(image).toHaveStyle({
      width: "1170px",
      height: "731.25px",
      transform: "translate(-85px, -15.625px)",
    });

    await user.click(screen.getByRole("button", { name: "Zoom out" }));

    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("100%");
    expect(image).toHaveStyle({
      width: "936px",
      transform: "translate(32px, 57.5px)",
    });
  });

  it("stops at the zoom limits and disables the corresponding controls", () => {
    renderReadyCanvas();
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });

    for (let i = 0; i < 20; i++) fireEvent.click(zoomIn);

    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("400%");
    expect(zoomIn).toBeDisabled();
    expect(zoomOut).toBeEnabled();

    for (let i = 0; i < 20; i++) fireEvent.click(zoomOut);

    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("25%");
    expect(zoomOut).toBeDisabled();
    expect(zoomIn).toBeEnabled();
  });

  it("pans by the pointer delta, captures the pointer, and releases it on completion", () => {
    const { image, viewport } = renderReadyCanvas();

    fireEvent.pointerDown(image, { clientX: 200, clientY: 200 });
    expect(image.hasPointerCapture(1)).toBe(true);
    fireEvent.pointerMove(image, { clientX: 250, clientY: 175 });

    expect(image).toHaveStyle({ transform: "translate(82px, 32.5px)" });
    expect(viewport).toHaveAttribute("data-panning", "true");
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();

    fireEvent.pointerUp(image, { clientX: 250, clientY: 175 });

    expect(image.hasPointerCapture(1)).toBe(false);
    expect(viewport).not.toHaveAttribute("data-panning");
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeEnabled();
  });

  it("pans by the same CSS-pixel distance when zoomed", () => {
    const { image } = renderReadyCanvas();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    fireEvent.pointerDown(image, { clientX: 200, clientY: 200 });
    fireEvent.pointerMove(image, { clientX: 250, clientY: 175 });
    fireEvent.pointerUp(image, { clientX: 250, clientY: 175 });

    expect(image).toHaveStyle({ transform: "translate(-35px, -40.625px)" });
    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("125%");
  });

  it("resets pan and zoom to the current fitted view", async () => {
    const user = userEvent.setup();
    const { image } = renderReadyCanvas();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.pointerDown(image, { clientX: 200, clientY: 200 });
    fireEvent.pointerMove(image, { clientX: 250, clientY: 175 });
    fireEvent.pointerUp(image, { clientX: 250, clientY: 175 });
    act(() => resizeViewport({ width: 800, height: 600 }));

    await user.click(screen.getByRole("button", { name: "Reset view" }));

    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("100%");
    expect(image).toHaveStyle({
      width: "736px",
      height: "460px",
      transform: "translate(32px, 70px)",
    });
  });

  it.each([
    { button: 2, isPrimary: true },
    { button: 0, isPrimary: false },
  ])("ignores unsupported pointer gestures: %j", (options) => {
    const { image } = renderReadyCanvas();

    fireEvent.pointerDown(image, { clientX: 200, clientY: 200, ...options });
    fireEvent.pointerMove(image, { clientX: 250, clientY: 175, ...options });
    fireEvent.pointerUp(image, { clientX: 250, clientY: 175, ...options });

    expect(image.hasPointerCapture(1)).toBe(false);
    expect(image).toHaveStyle({ transform: "translate(32px, 57.5px)" });
  });

  it("includes the final pointer-up coordinates even without a move event", () => {
    const { image } = renderReadyCanvas();

    fireEvent.pointerDown(image, { clientX: 200, clientY: 200 });
    fireEvent.pointerUp(image, { clientX: 250, clientY: 175 });

    expect(image).toHaveStyle({ transform: "translate(82px, 32.5px)" });
  });

  it.each(["pointerCancel", "lostPointerCapture"] as const)(
    "ends the gesture on %s and ignores further movement",
    (event) => {
      const { image, viewport } = renderReadyCanvas();
      fireEvent.pointerDown(image, { clientX: 200, clientY: 200 });
      fireEvent.pointerMove(image, { clientX: 250, clientY: 175 });

      fireEvent[event](image, { pointerId: 1 });
      fireEvent.pointerMove(image, { clientX: 500, clientY: 500 });

      expect(image.hasPointerCapture(1)).toBe(false);
      expect(viewport).not.toHaveAttribute("data-panning");
      expect(image).toHaveStyle({ transform: "translate(82px, 32.5px)" });
    }
  );

  it("releases capture when the window loses focus", () => {
    const { image, viewport } = renderReadyCanvas();
    fireEvent.pointerDown(image, { clientX: 200, clientY: 200 });
    fireEvent.pointerMove(image, { clientX: 250, clientY: 175 });

    fireEvent(window, new Event("blur"));

    expect(image.hasPointerCapture(1)).toBe(false);
    expect(viewport).not.toHaveAttribute("data-panning");
  });

  it("releases capture if the canvas unmounts during a gesture", () => {
    const { image, unmount } = renderReadyCanvas();
    fireEvent.pointerDown(image, { clientX: 200, clientY: 200 });

    unmount();

    expect(image.hasPointerCapture(1)).toBe(false);
  });
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
  it("announces image loading until usable dimensions arrive", () => {
    render(<ImageCanvas />);
    const viewport = screen.getByRole("region", {
      name: "Image review canvas",
    });

    expect(screen.getByText("Loading image…")).toBeVisible();
    expect(viewport).toHaveAttribute("aria-busy", "true");

    act(() => resizeViewport({ width: 1000, height: 700 }));
    loadImage();

    expect(screen.queryByText("Loading image…")).not.toBeInTheDocument();
    expect(viewport).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeEnabled();
  });

  it("handles a failed load and retries the image successfully", async () => {
    const user = userEvent.setup();
    render(<ImageCanvas />);
    act(() => resizeViewport({ width: 1000, height: 700 }));
    const image = screen.getByAltText(
      "Alpine escape travel design with an illustrated mountain landscape"
    );

    fireEvent.error(image);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The image could not be loaded"
    );
    expect(image).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Retry image" }));

    expect(screen.getByText("Loading image…")).toBeVisible();
    expect(
      screen.getByAltText(
        "Alpine escape travel design with an illustrated mountain landscape"
      )
    ).toHaveAttribute("src", "/review-board.svg?retry=1");
    loadImage();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("img")).toBeVisible();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeEnabled();
  });

  it("detects an image failure that happened before hydration", () => {
    jest
      .spyOn(HTMLImageElement.prototype, "complete", "get")
      .mockReturnValue(true);
    jest
      .spyOn(HTMLImageElement.prototype, "naturalWidth", "get")
      .mockReturnValue(0);
    render(<ImageCanvas />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The image could not be loaded"
    );
    expect(screen.getByRole("button", { name: "Retry image" })).toBeEnabled();
  });

  it("treats a load event without valid image dimensions as a failure", () => {
    render(<ImageCanvas />);
    const image = screen.getByAltText(
      "Alpine escape travel design with an illustrated mountain landscape"
    );

    fireEvent.load(image);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The image could not be loaded"
    );
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
  });

  it("disables navigation when a previously loaded image fails", () => {
    const { image, viewport } = renderReadyCanvas();
    fireEvent.pointerDown(image, { clientX: 200, clientY: 200 });

    fireEvent.error(image);
    fireEvent.pointerMove(image, { clientX: 500, clientY: 500 });

    expect(image.hasPointerCapture(1)).toBe(false);
    expect(viewport).not.toHaveAttribute("data-panning");
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
    expect(image).not.toBeVisible();
  });

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
