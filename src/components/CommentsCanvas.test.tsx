import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, MouseEvent as ReactMouseEvent } from "react";
import type { ThreadData } from "@liveblocks/client";
import type { useCreateThread } from "@liveblocks/react/suspense";
import type {
  CommentPinProps,
  ComposerSubmitComment,
  FloatingComposerProps,
  FloatingThreadProps,
} from "@liveblocks/react-ui";
import { CommentsCanvas } from "./CommentsCanvas";
import { ImageCanvas } from "./ImageCanvas";
import { ImageCanvasContext } from "./ImageCanvasContext";
import type { Point, ViewportTransform } from "../lib/coordinates";
import {
  loadCanvasImage,
  mockCanvasPointerEvents,
  mockCanvasResize,
} from "../test/canvas-dom";

type CreateThreadOptions = Parameters<ReturnType<typeof useCreateThread>>[0];
let mockThreads: ThreadData[] = [];
const mockEditThreadMetadata = jest.fn();
const mockCreateThread = jest.fn((options: CreateThreadOptions) => {
  const thread = makeThread("th_new", options.metadata);
  mockThreads = [...mockThreads, thread];
  return thread;
});

jest.mock("@liveblocks/react/suspense", () => ({
  useThreads: () => ({ threads: mockThreads }),
  useEditThreadMetadata: () => mockEditThreadMetadata,
  useCreateThread: () => mockCreateThread,
  useSelf: () => "user-0",
}));

// Isolate Liveblocks' network-backed editor/popovers. Keep our canvas, composer,
// pin components, coordinate logic, and dnd-kit sensors real.
jest.mock("@liveblocks/react-ui", () => {
  const { cloneElement, forwardRef, isValidElement } =
    jest.requireActual<typeof import("react")>("react");

  function trigger(children: React.ReactNode, onClick: () => void) {
    if (!isValidElement<ComponentProps<"button">>(children)) {
      throw new Error("Expected a pin trigger");
    }
    return cloneElement(children, {
      onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
        children.props.onClick?.(event);
        if (!event.defaultPrevented) onClick();
      },
    });
  }

  return {
    CommentPin: forwardRef<HTMLButtonElement, CommentPinProps>(
      function MockCommentPin({ corner, userId, ...props }, ref) {
        return <button ref={ref} {...props} />;
      }
    ),
    FloatingComposer: ({
      children,
      metadata,
      onComposerSubmit,
      onOpenChange,
    }: FloatingComposerProps) => (
      <>
        {trigger(children, () => onOpenChange?.(false))}
        <form
          aria-label="New comment"
          onSubmit={(event) => {
            const editor = event.currentTarget.elements.namedItem("body");
            if (!(editor instanceof HTMLTextAreaElement))
              throw new Error("Missing editor");
            const comment: ComposerSubmitComment = {
              body: {
                version: 1,
                content: [
                  { type: "paragraph", children: [{ text: editor.value }] },
                ],
              },
              attachments: [],
            };
            onComposerSubmit?.(comment, event);
            // Like Liveblocks, default creation runs unless the handler opts out.
            if (!event.defaultPrevented && metadata) {
              mockCreateThread({ ...comment, metadata });
            }
            event.preventDefault();
          }}
        >
          <textarea aria-label="Comment" name="body" />
          <button type="submit">Send comment</button>
          <button type="button" onClick={() => onOpenChange?.(false)}>
            Cancel
          </button>
        </form>
      </>
    ),
    FloatingThread: ({
      children,
      thread,
      open,
      onOpenChange,
    }: FloatingThreadProps) => (
      <>
        {trigger(children, () => onOpenChange?.(!open))}
        {open && (
          <div role="dialog" aria-label="Comment thread">
            Thread {thread.id}
          </div>
        )}
      </>
    ),
  };
});

function makeThread(id: string, metadata: ThreadData["metadata"]): ThreadData {
  return {
    type: "thread",
    id,
    roomId: "test-room",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    comments: [],
    metadata,
    resolved: false,
    visibility: "public",
  };
}

const imageSize = { width: 1000, height: 500 };
const initialTransform = { origin: { x: 100, y: 80 }, scale: 0.5 };

function canvas(transform: ViewportTransform | null = initialTransform) {
  return (
    <ImageCanvasContext.Provider value={{ imageSize, transform }}>
      <CommentsCanvas />
    </ImageCanvasContext.Provider>
  );
}

function renderCanvas() {
  const view = render(canvas());
  const imageTarget = screen.getByRole("button", {
    name: "Add a comment on the image",
  });
  const viewport = imageTarget.parentElement;
  if (!viewport) throw new Error("Missing viewport");
  jest
    .spyOn(viewport, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(30, 60, 800, 600));
  return { ...view, imageTarget, viewport };
}

let restorePointers: () => void;

beforeEach(() => {
  mockThreads = [];
  restorePointers = mockCanvasPointerEvents();
});

afterEach(() => {
  cleanup();
  restorePointers();
  jest.restoreAllMocks();
});

function dragCommentPin(pin: HTMLElement, start: Point, end: Point) {
  jest.useFakeTimers();
  try {
    fireEvent.pointerDown(pin, {
      clientX: start.x,
      clientY: start.y,
      button: 0,
    });
    fireEvent.pointerMove(document, {
      clientX: start.x + 10,
      clientY: start.y,
    });
    fireEvent.pointerMove(document, { clientX: end.x, clientY: end.y });
    fireEvent.pointerUp(document, { clientX: end.x, clientY: end.y });
  } finally {
    // dnd-kit delays removal of its document click listener after a drag.
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  }
}

describe("image-anchored comments", () => {
  it("opens a composer at the clicked image point and persists normalized metadata once", async () => {
    const user = userEvent.setup();
    const { imageTarget } = renderCanvas();
    // Client (280, 240) -> viewport (250, 180) -> image (0.3, 0.4).
    fireEvent.click(imageTarget, { clientX: 280, clientY: 240, detail: 1 });
    expect(mockCreateThread).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Cancel new comment" })
    ).toHaveStyle({
      transform: "translate(250px, 180px)",
    });

    await user.type(
      screen.getByRole("textbox", { name: "Comment" }),
      "Please review this point"
    );
    await user.click(screen.getByRole("button", { name: "Send comment" }));

    expect(mockCreateThread).toHaveBeenCalledTimes(1);
    expect(mockCreateThread).toHaveBeenCalledWith({
      body: {
        version: 1,
        content: [
          {
            type: "paragraph",
            children: [{ text: "Please review this point" }],
          },
        ],
      },
      attachments: [],
      metadata: { x: 0.3, y: 0.4, coordinateSpace: "image", zIndex: 1 },
    });
    expect(
      screen.queryByRole("form", { name: "New comment" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Comment thread" })
    ).toHaveTextContent("Thread th_new");
  });

  it("does not create a draft from the canvas margin or an out-of-image pointer", () => {
    const { imageTarget, viewport } = renderCanvas();

    fireEvent.click(viewport, { clientX: 40, clientY: 70, detail: 1 });
    fireEvent.click(imageTarget, { clientX: 40, clientY: 70, detail: 1 });

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it("waits for image geometry before allowing comment creation", () => {
    render(canvas(null));

    expect(
      screen.queryByRole("button", { name: "Add a comment on the image" })
    ).not.toBeInTheDocument();
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it("lets keyboard users start a comment at the image center", async () => {
    const user = userEvent.setup();
    const { imageTarget } = renderCanvas();
    imageTarget.focus();

    await user.keyboard("{Enter}");

    expect(screen.getByRole("form", { name: "New comment" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Cancel new comment" })
    ).toHaveStyle({
      transform: "translate(350px, 205px)",
    });
  });

  it("cancels a draft without writing to Liveblocks", async () => {
    const user = userEvent.setup();
    const { imageTarget } = renderCanvas();
    fireEvent.click(imageTarget, { clientX: 280, clientY: 240, detail: 1 });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it("keeps an unsubmitted anchor attached after geometry changes", () => {
    const { imageTarget, rerender } = renderCanvas();
    fireEvent.click(imageTarget, { clientX: 280, clientY: 240, detail: 1 });

    rerender(canvas({ origin: { x: 20, y: 30 }, scale: 1 }));

    expect(
      screen.getByRole("button", { name: "Cancel new comment" })
    ).toHaveStyle({
      transform: "translate(320px, 230px)",
    });
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it("repositions existing pins without writing metadata on resize", () => {
    mockThreads = [
      makeThread("th_existing", {
        x: 0.3,
        y: 0.4,
        coordinateSpace: "image",
        zIndex: 1,
      }),
    ];
    const { rerender } = renderCanvas();
    expect(
      screen.getByRole("button", { name: "Open comment thread" })
    ).toHaveStyle({
      transform: "translate3d(250px, 180px, 0)",
    });

    rerender(canvas({ origin: { x: 20, y: 30 }, scale: 1 }));

    expect(
      screen.getByRole("button", { name: "Open comment thread" })
    ).toHaveStyle({
      transform: "translate3d(320px, 230px, 0)",
    });
    expect(mockEditThreadMetadata).not.toHaveBeenCalled();
  });

  it("opens and closes a thread without placing a new comment", async () => {
    const user = userEvent.setup();
    mockThreads = [
      makeThread("th_existing", {
        x: 0.3,
        y: 0.4,
        coordinateSpace: "image",
        zIndex: 1,
      }),
    ];
    renderCanvas();

    await user.click(
      screen.getByRole("button", { name: "Open comment thread" })
    );
    expect(
      screen.getByRole("dialog", { name: "Comment thread" })
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Close comment thread" })
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(mockCreateThread).not.toHaveBeenCalled();
    expect(mockEditThreadMetadata).not.toHaveBeenCalled();
  });

  it("reanchors a legacy pin with the same thread ID when dragged", async () => {
    mockThreads = [makeThread("th_legacy", { x: 350, y: 205, zIndex: 1 })];
    renderCanvas();
    const pin = screen.getByRole("button", { name: "Open comment thread" });

    dragCommentPin(pin, { x: 380, y: 265 }, { x: 430, y: 240 });

    await waitFor(() =>
      expect(mockEditThreadMetadata).toHaveBeenCalledWith({
        threadId: "th_legacy",
        metadata: { x: 0.6, y: 0.4, coordinateSpace: "image", zIndex: 2 },
      })
    );
    expect(mockEditThreadMetadata).toHaveBeenCalledTimes(1);
    expect(mockCreateThread).not.toHaveBeenCalled();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});

describe("comments with canvas navigation", () => {
  let dimensions: ReturnType<typeof mockCanvasResize>;

  beforeEach(() => {
    dimensions = mockCanvasResize();
  });

  afterEach(() => {
    cleanup();
    dimensions.restore();
  });

  function renderInteractiveCanvas() {
    render(
      <ImageCanvas>
        <CommentsCanvas />
      </ImageCanvas>
    );
    const viewport = screen.getByRole("region", {
      name: "Image review canvas",
    });
    dimensions.resize(viewport, { width: 1064, height: 564 });
    const image = screen.getByAltText(
      "Alpine escape travel design with an illustrated mountain landscape"
    );
    loadCanvasImage(image, { width: 1000, height: 500 });
    const imageTarget = screen.getByRole("button", {
      name: "Add a comment on the image",
    });
    const commentLayer = imageTarget.parentElement;
    if (!commentLayer) throw new Error("Missing comment layer");
    jest
      .spyOn(commentLayer, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(30, 60, 1064, 564));
    return { viewport, image, imageTarget };
  }

  function pan(target: HTMLElement) {
    fireEvent.pointerDown(target, { clientX: 400, clientY: 300 });
    fireEvent.pointerMove(target, { clientX: 480, clientY: 260 });
    fireEvent.pointerUp(target, { clientX: 480, clientY: 260 });
  }

  it("keeps the pin on its image point through zoom, pan, and reset without metadata writes", () => {
    mockThreads = [
      makeThread("th_existing", {
        x: 0.25,
        y: 0.5,
        coordinateSpace: "image",
        zIndex: 1,
      }),
    ];
    const { imageTarget, image } = renderInteractiveCanvas();
    const pin = screen.getByRole("button", { name: "Open comment thread" });
    expect(pin).toHaveStyle({ transform: "translate3d(282px, 282px, 0)" });

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    pan(imageTarget);

    expect(image).toHaveStyle({
      transform: "translate(-13px, -70.5px)",
      width: "1250px",
    });
    expect(pin).toHaveStyle({ transform: "translate3d(299.5px, 242px, 0)" });
    expect(mockEditThreadMetadata).not.toHaveBeenCalled();
    expect(mockCreateThread).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));

    expect(pin).toHaveStyle({ transform: "translate3d(282px, 282px, 0)" });
    expect(mockEditThreadMetadata).not.toHaveBeenCalled();
  });

  it("suppresses the click after a drag but allows the next intentional click", () => {
    const { imageTarget } = renderInteractiveCanvas();

    pan(imageTarget);
    fireEvent.click(imageTarget, { clientX: 480, clientY: 260, detail: 1 });

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(mockCreateThread).not.toHaveBeenCalled();

    fireEvent.pointerDown(imageTarget, { clientX: 500, clientY: 300 });
    fireEvent.pointerUp(imageTarget, { clientX: 500, clientY: 300 });
    fireEvent.click(imageTarget, { clientX: 500, clientY: 300, detail: 1 });

    expect(screen.getByRole("form", { name: "New comment" })).toBeVisible();
  });

  it("does not create a comment when a drag returns to its starting point", () => {
    const { imageTarget, image } = renderInteractiveCanvas();

    fireEvent.pointerDown(imageTarget, { clientX: 400, clientY: 300 });
    fireEvent.pointerMove(imageTarget, { clientX: 480, clientY: 260 });
    fireEvent.pointerMove(imageTarget, { clientX: 400, clientY: 300 });
    fireEvent.pointerUp(imageTarget, { clientX: 400, clientY: 300 });
    fireEvent.click(imageTarget, { clientX: 400, clientY: 300, detail: 1 });

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(image).toHaveStyle({ transform: "translate(32px, 32px)" });
  });

  it("allows a comment click with minor pointer jitter", () => {
    const { imageTarget, image } = renderInteractiveCanvas();

    fireEvent.pointerDown(imageTarget, { clientX: 400, clientY: 300 });
    fireEvent.pointerMove(imageTarget, { clientX: 402, clientY: 302 });
    fireEvent.pointerUp(imageTarget, { clientX: 402, clientY: 302 });
    fireEvent.click(imageTarget, { clientX: 402, clientY: 302, detail: 1 });

    expect(screen.getByRole("form", { name: "New comment" })).toBeVisible();
    expect(image).toHaveStyle({ transform: "translate(32px, 32px)" });
  });

  it("persists the correct anchor for a click after pan and zoom", async () => {
    const user = userEvent.setup();
    const { imageTarget } = renderInteractiveCanvas();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    pan(imageTarget);
    fireEvent.click(imageTarget, { clientX: 480, clientY: 260, detail: 1 });

    fireEvent.pointerDown(imageTarget, { clientX: 329.5, clientY: 302 });
    fireEvent.pointerUp(imageTarget, { clientX: 329.5, clientY: 302 });
    fireEvent.click(imageTarget, { clientX: 329.5, clientY: 302, detail: 1 });
    await user.type(
      screen.getByRole("textbox", { name: "Comment" }),
      "Anchored after navigation"
    );
    await user.click(screen.getByRole("button", { name: "Send comment" }));

    expect(mockCreateThread).toHaveBeenCalledTimes(1);
    expect(mockCreateThread).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { x: 0.25, y: 0.5, coordinateSpace: "image", zIndex: 1 },
      })
    );
  });

  it("lets users drag a pin at the current scale without panning the canvas", async () => {
    mockThreads = [
      makeThread("th_existing", {
        x: 0.25,
        y: 0.5,
        coordinateSpace: "image",
        zIndex: 1,
      }),
    ];
    const { image, viewport } = renderInteractiveCanvas();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const pin = screen.getByRole("button", { name: "Open comment thread" });

    dragCommentPin(pin, { x: 300, y: 300 }, { x: 425, y: 300 });

    await waitFor(() =>
      expect(mockEditThreadMetadata).toHaveBeenCalledWith({
        threadId: "th_existing",
        metadata: { x: 0.35, y: 0.5, coordinateSpace: "image", zIndex: 2 },
      })
    );
    expect(image).toHaveStyle({ transform: "translate(-93px, -30.5px)" });
    expect(viewport).not.toHaveAttribute("data-panning");
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("does not pan when interacting with the comment editor", async () => {
    const user = userEvent.setup();
    const { imageTarget, image } = renderInteractiveCanvas();
    fireEvent.click(imageTarget, { clientX: 312, clientY: 342, detail: 1 });
    const editor = screen.getByRole("textbox", { name: "Comment" });

    pan(editor);
    await user.type(editor, "Typing stays in the editor");

    expect(editor).toHaveValue("Typing stays in the editor");
    expect(image).toHaveStyle({ transform: "translate(32px, 32px)" });
    expect(mockEditThreadMetadata).not.toHaveBeenCalled();
  });

  it("does not create a comment after pointer cancellation", () => {
    const { imageTarget } = renderInteractiveCanvas();

    fireEvent.pointerDown(imageTarget, { clientX: 400, clientY: 300 });
    fireEvent.pointerCancel(imageTarget);
    fireEvent.click(imageTarget, { clientX: 400, clientY: 300, detail: 1 });

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(mockCreateThread).not.toHaveBeenCalled();
  });
});
