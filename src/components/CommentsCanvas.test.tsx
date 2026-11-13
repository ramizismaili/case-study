import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Suspense,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { ThreadData } from "@liveblocks/client";
import type { useCreateThread } from "@liveblocks/react/suspense";
import type {
  CommentPinProps,
  CommentDropdownItemProps,
  ComposerSubmitComment,
  FloatingComposerProps,
  FloatingThreadProps,
} from "@liveblocks/react-ui";
import { CollaborationStatus } from "./CollaborationStatus";
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
let mockStatus = "connected";
let mockCreatorId: string | null = "user-0";
let mockSubscriptionStatus = "not-subscribed";
const mockCreateReply = jest.fn();
const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();
const mockEditThreadMetadata = jest.fn();
const mockCreateThread = jest.fn((options: CreateThreadOptions) => {
  const thread = makeThread("th_new", options.metadata);
  mockThreads = [...mockThreads, thread];
  return thread;
});

jest.mock("@liveblocks/react", () => ({
  useRoom: () => ({ id: "test-room" }),
  useSelf: () => mockCreatorId,
  useStatus: () => mockStatus,
  useSyncStatus: () => "synchronized",
  useErrorListener: () => {},
}));

jest.mock("@liveblocks/react/suspense", () => ({
  useThreadSubscription: () => ({
    status: mockSubscriptionStatus,
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  }),
  useThreads: () => ({ threads: mockThreads }),
  useEditThreadMetadata: () => mockEditThreadMetadata,
  useCreateThread: () => mockCreateThread,
  useSelf: () => {
    if (mockCreatorId === null) throw new Promise(() => {});
    return mockCreatorId;
  },
  useStatus: () => mockStatus,
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
    Comment: {
      DropdownItem: ({ children, onSelect }: CommentDropdownItemProps) => (
        <button role="menuitem" onClick={() => onSelect?.(new Event("select"))}>
          {children}
        </button>
      ),
    },
    CommentPin: forwardRef<HTMLButtonElement, CommentPinProps>(
      function MockCommentPin({ corner, userId, ...props }, ref) {
        return <button ref={ref} {...props} />;
      }
    ),
    FloatingComposer: forwardRef<HTMLFormElement, FloatingComposerProps>(
      function MockFloatingComposer(
        {
          children,
          metadata,
          onComposerSubmit,
          onOpenChange,
          side,
          sideOffset,
          alignOffset,
          style,
          disabled,
          defaultValue,
          onSubmitCapture,
          onInputCapture,
        },
        ref
      ) {
        return (
          <>
            {trigger(children, () => onOpenChange?.(false))}
            <form
              ref={ref}
              aria-label="New comment"
              data-side={side}
              data-side-offset={sideOffset}
              data-align-offset={alignOffset}
              style={style}
              onSubmitCapture={onSubmitCapture}
              onInputCapture={onInputCapture}
              onSubmit={(event) => {
                if (event.defaultPrevented) return;
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
                // The SDK clears its editor after the callback, including when
                // the callback prevents default thread creation.
                editor.value = "";
              }}
            >
              <textarea
                aria-label="Comment"
                name="body"
                disabled={disabled}
                defaultValue={defaultValue?.content
                  .map((paragraph) =>
                    paragraph.children
                      .map((child) =>
                        "text" in child ? (child.text ?? "") : ""
                      )
                      .join("")
                  )
                  .join("\n")}
              />
              <button type="submit" disabled={disabled}>
                Send comment
              </button>
              <button type="button" onClick={() => onOpenChange?.(false)}>
                Cancel
              </button>
            </form>
          </>
        );
      }
    ),
    FloatingThread: forwardRef<HTMLDivElement, FloatingThreadProps>(
      function MockFloatingThread(
        {
          children,
          thread,
          onResolvedChange,
          commentDropdownItems,
          showResolveAction,
          onCommentEdit,
          onCommentDelete,
          onComposerSubmit,
          onSubmitCapture,
          open,
          onOpenChange,
          side,
          sideOffset,
          alignOffset,
          style,
        },
        ref
      ) {
        return (
          <>
            {trigger(children, () => onOpenChange?.(!open))}
            {open && (
              <div
                ref={ref}
                role="dialog"
                onSubmitCapture={onSubmitCapture}
                aria-label="Comment thread"
                data-side={side}
                data-side-offset={sideOffset}
                data-align-offset={alignOffset}
                style={style}
              >
                Thread {thread.id}
                {thread.comments.length > 0 && (
                  <form
                    aria-label="Reply"
                    onSubmit={(event) => {
                      if (event.defaultPrevented) return;
                      const editor = event.currentTarget.elements.namedItem(
                        "reply"
                      ) as HTMLTextAreaElement;
                      onComposerSubmit?.(
                        {
                          body: {
                            version: 1,
                            content: [
                              {
                                type: "paragraph",
                                children: [{ text: editor.value }],
                              },
                            ],
                          },
                          attachments: [],
                        },
                        event
                      );
                      if (!event.defaultPrevented) mockCreateReply();
                      event.preventDefault();
                    }}
                  >
                    <textarea aria-label="Reply text" name="reply" />
                    <button type="submit">Send reply</button>
                  </form>
                )}
                {showResolveAction && (
                  <button onClick={() => onResolvedChange?.(!thread.resolved)}>
                    {thread.resolved ? "Reopen thread" : "Resolve thread"}
                  </button>
                )}
                {thread.comments
                  .filter((comment) => comment.body)
                  .map((comment) => {
                    const children =
                      comment.userId === mockCreatorId ? (
                        <>
                          <button
                            role="menuitem"
                            onClick={() => onCommentEdit?.(comment)}
                          >
                            Edit comment
                          </button>
                          <button
                            role="menuitem"
                            onClick={() => onCommentDelete?.(comment)}
                          >
                            Delete comment
                          </button>
                        </>
                      ) : null;
                    const content =
                      typeof commentDropdownItems === "function"
                        ? commentDropdownItems({ comment, children })
                        : children;
                    // Match the SDK: any truthy content, including an empty
                    // fragment, creates a More trigger.
                    return (
                      <div key={comment.id}>
                        {content && (
                          <>
                            <button aria-label={`More for ${comment.id}`}>
                              More
                            </button>
                            {content}
                          </>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        );
      }
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
    <ImageCanvasContext.Provider
      value={{
        imageSize,
        transform,
        viewportSize: { width: 800, height: 600 },
      }}
    >
      <CollaborationStatus>
        <Suspense fallback={<div>Loading shared comments…</div>}>
          <CommentsCanvas />
        </Suspense>
      </CollaborationStatus>
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
let dimensions: ReturnType<typeof mockCanvasResize>;

beforeEach(() => {
  mockThreads = [];
  mockStatus = "connected";
  mockCreatorId = "user-0";
  mockSubscriptionStatus = "not-subscribed";
  restorePointers = mockCanvasPointerEvents();
  dimensions = mockCanvasResize();
});

afterEach(() => {
  cleanup();
  restorePointers();
  dimensions.restore();
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

describe("thread action feedback", () => {
  beforeEach(() => {
    const thread = makeThread("th_existing", {
      x: 0.3,
      y: 0.4,
      coordinateSpace: "image",
      zIndex: 1,
    });
    thread.comments = [
      {
        type: "comment",
        id: "cm_existing",
        threadId: thread.id,
        roomId: thread.roomId,
        userId: "user-0",
        createdAt: thread.createdAt,
        reactions: [],
        attachments: [],
        metadata: {},
        body: {
          version: 1,
          content: [
            { type: "paragraph", children: [{ text: "Existing comment" }] },
          ],
        },
      },
    ];
    mockThreads = [thread];
  });

  function openThread() {
    const view = renderCanvas();
    fireEvent.click(
      screen.getByRole("button", { name: "Open comment thread" })
    );
    return view;
  }

  it("omits empty menus on other authors' replies while retaining own actions and subscription", () => {
    const first = mockThreads[0].comments[0];
    mockThreads[0].comments = [
      { ...first, userId: "user-1" },
      { ...first, id: "cm_other", userId: "user-1" },
      { ...first, id: "cm_mine", userId: "user-0" },
    ];

    openThread();

    expect(
      screen.queryByRole("button", { name: "More for cm_other" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "More for cm_mine" })
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Edit comment" })
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Delete comment" })
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Subscribe to thread" })
    ).toBeVisible();
  });

  it.each([
    [false, "Resolve thread", "Thread resolved"],
    [true, "Reopen thread", "Thread reopened"],
  ] as const)(
    "announces changing a thread with resolved=%s",
    (resolved, control, message) => {
      mockThreads[0].resolved = resolved;
      openThread();

      fireEvent.click(screen.getByRole("button", { name: control }));

      expect(screen.getByText(message)).toBeVisible();
    }
  );

  it.each([
    ["not-subscribed", "Subscribe to thread", "Subscribed to thread"],
    ["subscribed", "Unsubscribe from thread", "Unsubscribed from thread"],
  ] as const)(
    "announces a subscription change from %s",
    (status, control, message) => {
      mockSubscriptionStatus = status;
      openThread();

      fireEvent.click(screen.getByRole("menuitem", { name: control }));

      expect(
        status === "subscribed" ? mockUnsubscribe : mockSubscribe
      ).toHaveBeenCalledTimes(1);
      expect(
        status === "subscribed" ? mockSubscribe : mockUnsubscribe
      ).not.toHaveBeenCalled();
      expect(screen.getByText(message)).toBeVisible();
      expect(
        screen.getByRole("menuitem", { name: "Edit comment" })
      ).toBeVisible();
      expect(
        screen.getByRole("menuitem", { name: "Delete comment" })
      ).toBeVisible();
    }
  );

  it.each([
    ["Edit comment", "Comment updated"],
    ["Delete comment", "Comment deleted"],
  ])("announces %s", (control, message) => {
    openThread();

    fireEvent.click(screen.getByRole("menuitem", { name: control }));

    expect(screen.getByText(message)).toBeVisible();
  });

  it.each([
    ["A reply", true],
    ["   ", false],
  ])("only announces nonempty reply %j", (text, submitted) => {
    openThread();
    fireEvent.change(screen.getByRole("textbox", { name: "Reply text" }), {
      target: { value: text },
    });

    fireEvent.submit(screen.getByRole("form", { name: "Reply" }));

    expect(mockCreateReply).toHaveBeenCalledTimes(submitted ? 1 : 0);
    expect(Boolean(screen.queryByText("Reply added"))).toBe(submitted);
  });

  it("does not announce or submit replies while offline", () => {
    mockStatus = "disconnected";
    openThread();
    fireEvent.change(screen.getByRole("textbox", { name: "Reply text" }), {
      target: { value: "Not sent" },
    });

    fireEvent.submit(screen.getByRole("form", { name: "Reply" }));

    expect(mockCreateReply).not.toHaveBeenCalled();
    expect(screen.queryByText("Reply added")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Subscribe to thread" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resolve thread" })
    ).not.toBeInTheDocument();
  });
});

describe("image-anchored comments", () => {
  it("opens the first draft without reloading existing comments while author identity is pending", () => {
    mockCreatorId = null;
    mockThreads = [
      makeThread("th_existing", {
        x: 0.2,
        y: 0.3,
        coordinateSpace: "image",
        zIndex: 1,
      }),
    ];
    const { imageTarget } = renderCanvas();

    fireEvent.click(imageTarget, { clientX: 280, clientY: 240, detail: 1 });

    expect(
      screen.queryByText("Loading shared comments…")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("form", { name: "New comment" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open comment thread" })
    ).toBeVisible();
  });

  it.each(["", "   ", "\n\t"])(
    "rejects an empty comment %j without writing to Liveblocks",
    (text) => {
      const { imageTarget } = renderCanvas();
      fireEvent.click(imageTarget, { clientX: 280, clientY: 240, detail: 1 });
      fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
        target: { value: text },
      });

      fireEvent.submit(screen.getByRole("form", { name: "New comment" }));

      expect(mockCreateThread).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Write a comment before sending"
      );
      expect(screen.getByRole("form", { name: "New comment" })).toBeVisible();
    }
  );

  it("restores a draft after a local submission error and allows a successful retry", async () => {
    const user = userEvent.setup();
    mockCreateThread.mockImplementationOnce(() => {
      throw new Error("Local SDK failure");
    });
    const { imageTarget } = renderCanvas();
    fireEvent.click(imageTarget, { clientX: 280, clientY: 240, detail: 1 });
    await user.type(
      screen.getByRole("textbox", { name: "Comment" }),
      "Keep this comment"
    );

    await user.click(screen.getByRole("button", { name: "Send comment" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your draft is ready to try again"
    );
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue(
      "Keep this comment"
    );

    await user.click(screen.getByRole("button", { name: "Send comment" }));

    expect(mockCreateThread).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Comment added")).toBeVisible();
    expect(
      screen.queryByRole("form", { name: "New comment" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Comment thread" })
    ).toBeVisible();
  });

  it("blocks new comments while disconnected and re-enables them after reconnecting", () => {
    mockStatus = "disconnected";
    const { imageTarget, rerender } = renderCanvas();

    fireEvent.click(imageTarget, { clientX: 280, clientY: 240, detail: 1 });

    expect(imageTarget).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("form")).not.toBeInTheDocument();

    mockStatus = "connected";
    rerender(canvas());
    fireEvent.click(imageTarget, { clientX: 280, clientY: 240, detail: 1 });

    expect(imageTarget).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByRole("form", { name: "New comment" })).toBeVisible();
  });

  it("retains the current draft and prevents submission during a connection loss", async () => {
    const user = userEvent.setup();
    const { imageTarget, rerender } = renderCanvas();
    fireEvent.click(imageTarget, { clientX: 280, clientY: 240, detail: 1 });
    await user.type(
      screen.getByRole("textbox", { name: "Comment" }),
      "Still here"
    );
    mockStatus = "reconnecting";

    rerender(canvas());
    fireEvent.submit(screen.getByRole("form", { name: "New comment" }));

    expect(screen.getByRole("button", { name: "Send comment" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue(
      "Still here"
    );
    expect(mockCreateThread).not.toHaveBeenCalled();

    mockStatus = "connected";
    rerender(canvas());

    expect(screen.getByRole("button", { name: "Send comment" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue(
      "Still here"
    );
  });

  it("closes a draft with Escape without submitting it", () => {
    const { imageTarget } = renderCanvas();
    fireEvent.click(imageTarget, { clientX: 280, clientY: 240, detail: 1 });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Comment" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it("reports a failed pin move and keeps the persisted anchor", () => {
    mockThreads = [
      makeThread("th_existing", {
        x: 0.3,
        y: 0.4,
        coordinateSpace: "image",
        zIndex: 1,
      }),
    ];
    mockEditThreadMetadata.mockImplementationOnce(() => {
      throw new Error("Local SDK failure");
    });
    renderCanvas();
    const pin = screen.getByRole("button", { name: "Open comment thread" });

    dragCommentPin(pin, { x: 280, y: 240 }, { x: 330, y: 260 });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The comment could not be moved"
    );
    expect(pin).toHaveStyle({ transform: "translate3d(250px, 180px, 0)" });
  });

  it("allows reading threads but prevents pin dragging while offline", async () => {
    const user = userEvent.setup();
    mockStatus = "disconnected";
    mockThreads = [
      makeThread("th_existing", {
        x: 0.3,
        y: 0.4,
        coordinateSpace: "image",
        zIndex: 1,
      }),
    ];
    renderCanvas();
    const pin = screen.getByRole("button", { name: "Open comment thread" });

    dragCommentPin(pin, { x: 280, y: 240 }, { x: 330, y: 260 });
    await user.click(pin);

    expect(mockEditThreadMetadata).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Comment thread" })
    ).toBeVisible();
  });
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
  function renderInteractiveCanvas() {
    render(
      <ImageCanvas>
        <CollaborationStatus>
          <Suspense fallback={<div>Loading shared comments…</div>}>
            <CommentsCanvas />
          </Suspense>
        </CollaborationStatus>
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

  it("keeps panning and zooming usable while comments are disconnected", () => {
    mockStatus = "disconnected";
    const { imageTarget, image } = renderInteractiveCanvas();

    pan(imageTarget);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("125%");
    expect(image).toHaveStyle({ transform: "translate(7px, -80.5px)" });
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it("removes comment targets when the image fails without changing shared metadata", () => {
    const { image } = renderInteractiveCanvas();

    fireEvent.error(image);

    expect(
      screen.queryByRole("button", { name: "Add a comment on the image" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry image" })).toBeEnabled();
    expect(mockCreateThread).not.toHaveBeenCalled();
    expect(mockEditThreadMetadata).not.toHaveBeenCalled();
  });

  function measurePopover(
    element: HTMLElement,
    size: { width: number; height: number }
  ) {
    jest
      .spyOn(element, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(0, 0, size.width, size.height));
    dimensions.resize(element, size);
  }

  it("flips an open thread through pan, reset, and zoom without moving its stored anchor", () => {
    mockThreads = [
      makeThread("th_existing", {
        x: 0.6,
        y: 0.5,
        coordinateSpace: "image",
        zIndex: 1,
      }),
    ];
    const { imageTarget } = renderInteractiveCanvas();
    fireEvent.click(
      screen.getByRole("button", { name: "Open comment thread" })
    );
    const thread = screen.getByRole("dialog", { name: "Comment thread" });
    measurePopover(thread, { width: 350, height: 200 });
    expect(thread).toHaveAttribute("data-side", "right");

    pan(imageTarget);

    expect(thread).toHaveAttribute("data-side", "left");
    expect(
      screen.getByRole("button", { name: "Close comment thread" })
    ).toHaveStyle({ transform: "translate3d(712px, 242px, 0)" });

    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));

    expect(thread).toHaveAttribute("data-side", "right");

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(thread).toHaveAttribute("data-side", "left");
    expect(mockEditThreadMetadata).not.toHaveBeenCalled();
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it("recalculates thread alignment when the viewport shrinks and grows", () => {
    mockThreads = [
      makeThread("th_existing", {
        x: 0.6,
        y: 0.5,
        coordinateSpace: "image",
        zIndex: 1,
      }),
    ];
    const { viewport } = renderInteractiveCanvas();
    fireEvent.click(
      screen.getByRole("button", { name: "Open comment thread" })
    );
    const thread = screen.getByRole("dialog", { name: "Comment thread" });
    measurePopover(thread, { width: 350, height: 200 });

    dimensions.resize(viewport, { width: 800, height: 564 });

    expect(thread).toHaveAttribute("data-side", "left");

    dimensions.resize(viewport, { width: 1064, height: 564 });

    expect(thread).toHaveAttribute("data-side", "right");
    expect(mockEditThreadMetadata).not.toHaveBeenCalled();
  });

  it("moves a growing thread upwards and bounds its outer container", () => {
    mockThreads = [
      makeThread("th_existing", {
        x: 0.8,
        y: 0.9,
        coordinateSpace: "image",
        zIndex: 1,
      }),
    ];
    renderInteractiveCanvas();
    fireEvent.click(
      screen.getByRole("button", { name: "Open comment thread" })
    );
    const thread = screen.getByRole("dialog", { name: "Comment thread" });
    measurePopover(thread, { width: 350, height: 50 });
    expect(thread).toHaveAttribute("data-align-offset", "0");

    measurePopover(thread, { width: 350, height: 300 });

    expect(thread).toHaveAttribute("data-align-offset", "-230");

    measurePopover(thread, { width: 350, height: 1000 });

    expect(thread).toHaveAttribute("data-align-offset", "-470");
    expect(thread).toHaveStyle({ maxBlockSize: "540px", overflow: "hidden" });
    expect(mockEditThreadMetadata).not.toHaveBeenCalled();
  });

  it("keeps the editor readable when neither side has enough space", () => {
    mockThreads = [
      makeThread("th_existing", {
        x: 0.5,
        y: 0.5,
        coordinateSpace: "image",
        zIndex: 1,
      }),
    ];
    const { viewport } = renderInteractiveCanvas();
    fireEvent.click(
      screen.getByRole("button", { name: "Open comment thread" })
    );
    const thread = screen.getByRole("dialog", { name: "Comment thread" });
    measurePopover(thread, { width: 350, height: 200 });

    dimensions.resize(viewport, { width: 500, height: 500 });

    expect(thread).toHaveStyle({ inlineSize: "350px" });
    expect(thread).toHaveAttribute("data-side-offset", "-112");

    dimensions.resize(viewport, { width: 280, height: 320 });

    expect(thread).toHaveStyle({
      inlineSize: "256px",
      maxInlineSize: "256px",
      maxBlockSize: "296px",
    });
    expect(mockEditThreadMetadata).not.toHaveBeenCalled();
  });

  it("opens a new-comment composer inwards and keeps its draft through geometry changes", async () => {
    const user = userEvent.setup();
    const { imageTarget, viewport } = renderInteractiveCanvas();
    fireEvent.click(imageTarget, { clientX: 1012, clientY: 542, detail: 1 });
    const composer = screen.getByRole("form", { name: "New comment" });
    measurePopover(composer, { width: 350, height: 180 });
    const editor = screen.getByRole("textbox", { name: "Comment" });
    await user.type(editor, "Keep this draft");

    expect(composer).toHaveAttribute("data-side", "left");
    expect(composer).toHaveAttribute("data-align-offset", "-110");
    expect(
      screen.getByRole("button", { name: "Cancel new comment" })
    ).toHaveStyle({ transform: "translate(982px, 482px)" });

    dimensions.resize(viewport, { width: 280, height: 320 });

    expect(composer).toHaveStyle({
      inlineSize: "256px",
      maxBlockSize: "296px",
    });
    expect(editor).toHaveValue("Keep this draft");
    expect(mockCreateThread).not.toHaveBeenCalled();
    expect(mockEditThreadMetadata).not.toHaveBeenCalled();
  });

  it("hides an off-canvas draft and restores it intact when its anchor returns", async () => {
    const user = userEvent.setup();
    const { imageTarget } = renderInteractiveCanvas();
    fireEvent.click(imageTarget, { clientX: 562, clientY: 342, detail: 1 });
    const composer = screen.getByRole("form", { name: "New comment" });
    const editor = screen.getByRole("textbox", { name: "Comment" });
    await user.type(editor, "Draft stays attached");

    fireEvent.pointerDown(imageTarget, { clientX: 400, clientY: 300 });
    fireEvent.pointerMove(imageTarget, { clientX: -700, clientY: 300 });
    fireEvent.pointerUp(imageTarget, { clientX: -700, clientY: 300 });

    expect(composer).not.toBeVisible();
    expect(editor).toHaveValue("Draft stays attached");

    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));

    expect(composer).toBeVisible();
    expect(editor).toHaveValue("Draft stays attached");
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

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
