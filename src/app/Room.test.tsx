import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense, type PropsWithChildren, type ReactNode } from "react";
import { LiveblocksError, type Status } from "@liveblocks/client";
import { Room } from "./Room";
import {
  useActionNotifications,
  type CommentAction,
} from "../components/ActionNotifications";
import { CollaborationStatus } from "../components/CollaborationStatus";
import { ImageCanvas } from "../components/ImageCanvas";
import { loadCanvasImage, mockCanvasResize } from "../test/canvas-dom";

let mockStatus: Status = "connected";
let mockSyncStatus = "synchronized";
let mockErrorListener: (error: LiveblocksError) => void;
let mockThreadsFailure: Error | Promise<never> | null = null;
let mockExampleId = "";
const mockReconnect = jest.fn();
const roomId = "test-room";

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams({ exampleId: mockExampleId }),
}));
jest.mock("@liveblocks/react", () => ({
  useRoom: () => ({ id: "test-room", reconnect: mockReconnect }),
  useStatus: () => mockStatus,
  useSyncStatus: () => mockSyncStatus,
  useErrorListener: (callback: (error: LiveblocksError) => void) => {
    mockErrorListener = callback;
  },
  ClientSideSuspense: ({
    children,
    fallback,
  }: PropsWithChildren<{ fallback: ReactNode }>) => (
    <Suspense fallback={fallback}>{children}</Suspense>
  ),
}));
jest.mock("@liveblocks/react/suspense", () => ({
  RoomProvider: ({ children }: PropsWithChildren) => children,
  useStatus: () => mockStatus,
  useThreads: () => {
    if (mockThreadsFailure) throw mockThreadsFailure;
    return { threads: [] };
  },
  useEditThreadMetadata: () => jest.fn(),
}));

let dimensions: ReturnType<typeof mockCanvasResize>;
beforeEach(() => {
  mockStatus = "connected";
  mockSyncStatus = "synchronized";
  mockThreadsFailure = null;
  mockExampleId = "";
  dimensions = mockCanvasResize();
});
afterEach(() => {
  cleanup();
  dimensions.restore();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function StatusHarness({ children }: PropsWithChildren) {
  return (
    <>
      <header>
        <span id="collaboration-indicator" />
      </header>
      <CollaborationStatus>{children}</CollaborationStatus>
    </>
  );
}

function ActionButton({
  action = "thread-resolved",
  threadId = "th_test",
  commentId,
}: Partial<CommentAction>) {
  const notify = useActionNotifications();
  return (
    <button onClick={() => notify({ action, threadId, commentId })}>
      Perform action
    </button>
  );
}

function emitError(context: LiveblocksError["context"]) {
  act(() => mockErrorListener(new LiveblocksError("SDK error", context)));
}

describe("collaboration feedback", () => {
  it.each([
    ["initial", "Connecting comments…"],
    ["connecting", "Connecting comments…"],
    ["connected", "Comments connected"],
    ["reconnecting", "Connection lost. Reconnecting…"],
    ["disconnected", "Comments disconnected"],
  ] as const)("announces %s state", (status, label) => {
    mockStatus = status;

    render(<StatusHarness />);

    expect(screen.getByRole("status", { name: label })).toHaveAttribute(
      "title",
      label
    );
    expect(
      within(screen.getByRole("banner")).getByRole("status")
    ).toHaveAccessibleName(label);
  });

  it("shows pending saves and updates when synchronization completes", () => {
    mockSyncStatus = "synchronizing";
    const { rerender } = render(<StatusHarness />);
    expect(
      screen.getByRole("status", { name: "Saving comments…" })
    ).toHaveTextContent("Saving comments…");

    mockSyncStatus = "synchronized";
    rerender(<StatusHarness />);

    expect(
      screen.getByRole("status", { name: "Comments connected" })
    ).toHaveTextContent("Comments connected");
  });

  it("offers an explicit reconnect and clears a connection error after recovery", async () => {
    const user = userEvent.setup();
    mockStatus = "disconnected";
    const { rerender } = render(<StatusHarness />);
    emitError({ type: "ROOM_CONNECTION_ERROR", roomId, code: -1 });

    await user.click(screen.getByRole("button", { name: "Reconnect" }));

    expect(mockReconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Shared comments could not connect"
    );

    mockStatus = "connected";
    rerender(<StatusHarness />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reconnect" })
    ).not.toBeInTheDocument();
  });

  it("ignores errors belonging to another room", () => {
    render(<StatusHarness />);

    emitError({
      type: "ROOM_CONNECTION_ERROR",
      roomId: "another-room",
      code: 4001,
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retains unsaved text after an asynchronous thread creation failure", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<StatusHarness />);

    emitError({
      type: "CREATE_THREAD_ERROR",
      roomId,
      threadId: "th_failed",
      commentId: "cm_failed",
      body: {
        version: 1,
        content: [
          { type: "paragraph", children: [{ text: "Recover this text" }] },
        ],
      },
      metadata: {},
      commentMetadata: {},
      visibility: "public",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your comment could not be saved"
    );
    const recovered = screen.getByRole("textbox", {
      name: "Unsaved comment text",
    });
    expect(recovered).toHaveValue("Recover this text");
    expect(recovered).toHaveAttribute("readonly");

    mockStatus = "reconnecting";
    rerender(<StatusHarness />);
    mockStatus = "connected";
    rerender(<StatusHarness />);

    expect(recovered).toHaveValue("Recover this text");
    await user.click(screen.getByRole("button", { name: "Dismiss error" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["CREATE_COMMENT_ERROR", "EDIT_COMMENT_ERROR"] as const)(
    "preserves text for %s",
    (type) => {
      render(<StatusHarness />);

      emitError({
        type,
        roomId,
        threadId: "th_failed",
        commentId: "cm_failed",
        body: {
          version: 1,
          content: [
            { type: "paragraph", children: [{ text: "Unsaved reply" }] },
          ],
        },
        metadata: {},
      });

      expect(
        screen.getByRole("textbox", { name: "Unsaved comment text" })
      ).toHaveValue("Unsaved reply");
    }
  );

  it("reports failed metadata writes without claiming they were saved", () => {
    render(<StatusHarness />);

    emitError({
      type: "EDIT_THREAD_METADATA_ERROR",
      roomId,
      threadId: "th_failed",
      metadata: { x: 0.5 },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The comment action could not be saved"
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps multiple failed comments through a later connection error", async () => {
    const user = userEvent.setup();
    mockStatus = "disconnected";
    const { rerender } = render(<StatusHarness />);
    for (const text of ["First draft", "Second draft"]) {
      emitError({
        type: "CREATE_COMMENT_ERROR",
        roomId,
        threadId: "th_failed",
        commentId: text,
        body: {
          version: 1,
          content: [{ type: "paragraph", children: [{ text }] }],
        },
        metadata: {},
      });
    }

    emitError({ type: "ROOM_CONNECTION_ERROR", roomId, code: -1 });
    mockStatus = "connected";
    rerender(<StatusHarness />);

    const drafts = screen.getAllByRole("textbox");
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toHaveValue("First draft");
    expect(drafts[1]).toHaveValue("Second draft");
    const [firstFailure] = screen.getAllByRole("alert");
    await user.click(
      within(firstFailure).getByRole("button", { name: "Dismiss error" })
    );

    expect(screen.getByRole("textbox")).toHaveValue("Second draft");
  });
});

describe("action notifications", () => {
  it("does not announce actions on initial load", () => {
    render(<StatusHarness />);

    expect(
      screen.queryByRole("button", { name: "Dismiss notification" })
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("acknowledges the visible comment immediately and clears the saving hint when synchronized", () => {
    mockSyncStatus = "synchronizing";
    const view = (
      <StatusHarness>
        <ActionButton action="comment-added" />
      </StatusHarness>
    );
    const { rerender } = render(view);

    fireEvent.click(screen.getByRole("button", { name: "Perform action" }));

    expect(screen.getByText("Comment added")).toBeVisible();
    expect(screen.getByText("Saving…")).toBeVisible();
    expect(screen.queryByText("Adding comment…")).not.toBeInTheDocument();

    mockSyncStatus = "synchronized";
    rerender(
      <StatusHarness>
        <ActionButton action="comment-added" />
      </StatusHarness>
    );

    expect(screen.getByText("Comment added")).toBeVisible();
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
  });

  it("replaces a failed action with a persistent error without removing another action", () => {
    jest.useFakeTimers();
    mockSyncStatus = "synchronizing";
    const { rerender } = render(
      <StatusHarness>
        <ActionButton />
      </StatusHarness>
    );
    fireEvent.click(screen.getByRole("button", { name: "Perform action" }));
    rerender(
      <StatusHarness>
        <ActionButton action="thread-subscribed" />
      </StatusHarness>
    );
    fireEvent.click(screen.getByRole("button", { name: "Perform action" }));

    emitError({
      type: "MARK_THREAD_AS_RESOLVED_ERROR",
      roomId,
      threadId: "th_test",
    });
    mockSyncStatus = "synchronized";
    rerender(<StatusHarness />);

    expect(screen.queryByText("Thread resolved")).not.toBeInTheDocument();
    expect(screen.getByText("Subscribed to thread")).toBeVisible();
    act(() => jest.advanceTimersByTime(10000));
    expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
  });

  it("keeps pending feedback until saved, then dismisses it after five seconds", () => {
    jest.useFakeTimers();
    mockSyncStatus = "synchronizing";
    const { rerender } = render(
      <StatusHarness>
        <ActionButton />
      </StatusHarness>
    );
    fireEvent.click(screen.getByRole("button", { name: "Perform action" }));

    act(() => jest.advanceTimersByTime(10000));
    expect(screen.getByText("Thread resolved")).toBeVisible();
    mockSyncStatus = "synchronized";
    rerender(
      <StatusHarness>
        <ActionButton />
      </StatusHarness>
    );
    act(() => jest.advanceTimersByTime(4999));
    expect(screen.getByText("Thread resolved")).toBeVisible();
    act(() => jest.advanceTimersByTime(1));

    expect(screen.queryByText("Thread resolved")).not.toBeInTheDocument();
  });

  it("pauses automatic dismissal while hovered or focused and supports manual dismissal", () => {
    jest.useFakeTimers();
    render(
      <StatusHarness>
        <ActionButton />
      </StatusHarness>
    );
    fireEvent.click(screen.getByRole("button", { name: "Perform action" }));
    const toast = screen
      .getByText("Thread resolved")
      .closest('[role="status"]')!;
    const dismiss = within(toast as HTMLElement).getByRole("button", {
      name: "Dismiss notification",
    });

    fireEvent.mouseEnter(toast);
    act(() => jest.advanceTimersByTime(10000));
    expect(toast).toBeInTheDocument();
    act(() => dismiss.focus());
    fireEvent.mouseLeave(toast);
    act(() => jest.advanceTimersByTime(10000));
    expect(toast).toBeInTheDocument();
    fireEvent.click(dismiss);

    expect(toast).not.toBeInTheDocument();
  });
});

describe("room loading and recovery", () => {
  it("clears previous-room feedback when switching rooms", () => {
    const { rerender } = render(
      <ImageCanvas>
        <Room isConfigured />
      </ImageCanvas>
    );
    emitError({
      type: "EDIT_THREAD_METADATA_ERROR",
      roomId,
      threadId: "th_failed",
      metadata: {},
    });
    expect(screen.getByRole("alert")).toBeVisible();

    mockExampleId = "another-room";
    rerender(
      <ImageCanvas>
        <Room isConfigured />
      </ImageCanvas>
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("explains missing configuration without hiding the canvas", () => {
    render(
      <ImageCanvas>
        <Room isConfigured={false} />
      </ImageCanvas>
    );

    expect(screen.getByText("Connect comments")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Image review canvas" })
    ).toBeVisible();
  });

  it("shows a loading state while threads are suspended", () => {
    mockThreadsFailure = new Promise<never>(() => {});

    render(
      <ImageCanvas>
        <Room isConfigured />
      </ImageCanvas>
    );

    expect(screen.getByText("Loading shared comments…")).toBeVisible();
    expect(screen.getByText("Loading image…")).toBeVisible();
  });

  it("provides a reload action after a thread failure while leaving navigation usable", () => {
    mockThreadsFailure = new Error("Expected thread failure");
    jest.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ImageCanvas>
        <Room isConfigured />
      </ImageCanvas>
    );
    const viewport = screen.getByRole("region", {
      name: "Image review canvas",
    });
    dimensions.resize(viewport, { width: 1000, height: 700 });
    loadCanvasImage(
      screen.getByAltText(
        "Alpine escape travel design with an illustrated mountain landscape"
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Comments could not be loaded"
    );
    expect(
      screen.getByRole("button", { name: "Reload comments" })
    ).toBeEnabled();
    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("125%");
    expect(screen.getByRole("img")).toBeVisible();
  });
});
