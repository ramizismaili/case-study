import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { ImageCanvasContext } from "./ImageCanvasContext";
import type { ViewportTransform } from "../lib/coordinates";

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

// jsdom lacks PointerEvent. dnd-kit needs these fields for its real pointer sensor.
const pointerEventDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "PointerEvent"
);
class TestPointerEvent extends MouseEvent {
  pointerId = 1;
  isPrimary = true;
  pointerType = "mouse";
}

beforeEach(() => {
  mockThreads = [];
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  if (pointerEventDescriptor) {
    Object.defineProperty(window, "PointerEvent", pointerEventDescriptor);
  } else {
    Reflect.deleteProperty(window, "PointerEvent");
  }
});

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

    fireEvent.pointerDown(pin, { clientX: 380, clientY: 265, button: 0 });
    fireEvent.pointerMove(document, { clientX: 390, clientY: 265 });
    fireEvent.pointerMove(document, { clientX: 430, clientY: 240 });
    fireEvent.pointerUp(document, { clientX: 430, clientY: 240 });

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
