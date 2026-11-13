import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createContext } from "react";
import type { Status } from "@liveblocks/client";
import { ImageCanvas } from "./ImageCanvas";
import { MultiplayerCursors } from "./MultiplayerCursors";
import { OnlineCollaborators } from "./OnlineCollaborators";
import { CURSOR_UPDATE_INTERVAL } from "../hooks/useCursorPresence";
import {
  getImageTransform,
  imageToViewport,
  type Point,
} from "../lib/coordinates";
import {
  loadCanvasImage,
  mockCanvasPointerEvents,
  mockCanvasResize,
} from "../test/canvas-dom";

type Person = {
  connectionId: number;
  info?: { name?: string; avatar?: string };
  presence?: { cursor?: unknown } | null;
};
type RoomState = { status: Status; self: Person | null; others: Person[] };
const MockRoomContext = createContext<RoomState>({
  status: "initial",
  self: null,
  others: [],
});
const mockUpdateMyPresence = jest.fn();

jest.mock("@liveblocks/react", () => {
  const actual =
    jest.requireActual<typeof import("@liveblocks/react")>("@liveblocks/react");
  const { useContext } = jest.requireActual<typeof import("react")>("react");
  // Context supplies hook updates without replacing the application's memoized components.
  return {
    shallow: actual.shallow,
    useStatus: () => useContext(MockRoomContext).status,
    useUpdateMyPresence: () => mockUpdateMyPresence,
    useOthersConnectionIds: () =>
      useContext(MockRoomContext).others.map((user) => user.connectionId),
    useOther: (id: number, selector: (user: Person) => unknown) => {
      const user = useContext(MockRoomContext).others.find(
        (user) => user.connectionId === id
      );
      return user ? selector(user) : null;
    },
    useOthersMapped: (selector: (user: Person) => unknown) =>
      useContext(MockRoomContext).others.map((user) => [
        user.connectionId,
        selector(user),
      ]),
    useSelf: (selector: (user: Person) => unknown) => {
      const user = useContext(MockRoomContext).self;
      return user ? selector(user) : null;
    },
  };
});

const imageSize = { width: 1600, height: 1000 };
const viewportSize = { width: 1000, height: 700 };
const bounds = new DOMRect(24, 80, viewportSize.width, viewportSize.height);
let room: RoomState;
let dimensions: ReturnType<typeof mockCanvasResize>;
let restorePointerEvents: () => void;

beforeEach(() => {
  jest.useFakeTimers();
  dimensions = mockCanvasResize();
  restorePointerEvents = mockCanvasPointerEvents();
  room = {
    status: "connected",
    self: {
      connectionId: 1,
      info: { name: "Local Reviewer" },
      presence: { cursor: { x: 0.5, y: 0.5 } },
    },
    others: [
      {
        connectionId: 2,
        info: { name: "Ada Lovelace" },
        presence: { cursor: { x: 0.25, y: 0.4 } },
      },
    ],
  };
});

afterEach(() => {
  cleanup();
  dimensions.restore();
  restorePointerEvents();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function canvas() {
  return (
    <MockRoomContext.Provider value={room}>
      <ImageCanvas>
        <MultiplayerCursors />
        <OnlineCollaborators />
      </ImageCanvas>
    </MockRoomContext.Provider>
  );
}

function setup() {
  const view = render(canvas());
  const viewport = screen.getByRole("region", { name: "Image review canvas" });
  dimensions.resize(viewport, viewportSize);
  jest.spyOn(viewport, "getBoundingClientRect").mockReturnValue(bounds);
  const image = screen.getByAltText(
    "Alpine escape travel design with an illustrated mountain landscape"
  );
  loadCanvasImage(image, imageSize);
  return {
    ...view,
    image,
    viewport,
    updateRoom(update: Partial<RoomState>) {
      room = { ...room, ...update };
      view.rerender(canvas());
    },
  };
}

function flush() {
  act(() => jest.advanceTimersByTime(CURSOR_UPDATE_INTERVAL));
}

function move(target: Element, point: Point = { x: 500, y: 350 }) {
  fireEvent.pointerMove(target, {
    clientX: point.x + bounds.left,
    clientY: point.y + bounds.top,
  });
}

function remoteCursor(container: HTMLElement, id = 2) {
  return container.querySelector(`[data-connection-id="${id}"]`);
}

describe("remote image cursors", () => {
  it("renders only other connections, with names, distinct colors, and no pointer interception", () => {
    room.others.push({
      connectionId: 3,
      info: { name: "Grace Hopper" },
      presence: { cursor: { x: 0.6, y: 0.5 } },
    });
    const { container } = setup();

    const layer = container.querySelector(".multiplayer-cursors")!;
    expect(layer).toHaveStyle({ pointerEvents: "none" });
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer.querySelectorAll(".remote-cursor")).toHaveLength(2);
    expect(layer).toHaveTextContent("Ada Lovelace");
    expect(layer).toHaveTextContent("Grace Hopper");
    expect(layer).not.toHaveTextContent("Local Reviewer");
    expect(remoteCursor(container, 1)).toBeNull();
    expect((remoteCursor(container, 2) as HTMLElement).style.color).not.toBe(
      (remoteCursor(container, 3) as HTMLElement).style.color
    );
    expect(remoteCursor(container, 2)).toHaveStyle({ pointerEvents: "none" });
  });

  it("maps the same image point through zoom, pan, and a different viewport size", () => {
    const { container, image, viewport } = setup();
    const anchor = { x: 0.25, y: 0.4 };
    function expectPosition(
      size = viewportSize,
      zoom = 1,
      pan = { x: 0, y: 0 }
    ) {
      const transform = getImageTransform(imageSize, size, pan, zoom)!;
      const point = imageToViewport(anchor, imageSize, transform);
      expect(remoteCursor(container)).toHaveStyle({
        transform: `translate(${point.x}px, ${point.y}px)`,
      });
    }
    expectPosition();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expectPosition(viewportSize, 1.25);
    fireEvent.pointerDown(image, { clientX: 200, clientY: 200 });
    fireEvent.pointerMove(image, { clientX: 250, clientY: 225 });
    fireEvent.pointerUp(image, { clientX: 250, clientY: 225 });
    expectPosition(viewportSize, 1.25, { x: 50, y: 25 });
    const smaller = { width: 650, height: 500 };
    dimensions.resize(viewport, smaller);
    expectPosition(smaller, 1.25, { x: 50, y: 25 });
  });

  it("removes cursors when presence clears, peers leave, or the connection is lost", () => {
    const { container, updateRoom } = setup();
    const peer = room.others[0];
    updateRoom({ others: [{ ...peer, presence: { cursor: null } }] });
    expect(remoteCursor(container)).toBeNull();
    updateRoom({ others: [peer] });
    expect(remoteCursor(container)).toBeInTheDocument();
    updateRoom({ status: "reconnecting" });
    expect(remoteCursor(container)).toBeNull();
    updateRoom({ status: "connected" });
    expect(remoteCursor(container)).toBeInTheDocument();
    updateRoom({ others: [] });
    expect(remoteCursor(container)).toBeNull();
  });

  it.each([
    undefined,
    null,
    {},
    "invalid",
    [],
    { x: "0.2", y: 0.3 },
    { x: 0.2 },
    { x: NaN, y: 0.4 },
    { x: 0.4, y: Infinity },
    { x: -0.1, y: 0 },
    { x: 0.5, y: 1.1 },
  ])("ignores malformed cursor %j", (cursor) => {
    room.others[0].presence = { cursor };
    const { container } = setup();
    expect(remoteCursor(container)).toBeNull();
  });

  it("handles missing presence and user info from older clients", () => {
    room.others = [
      { connectionId: 2 },
      { connectionId: 3, presence: { cursor: { x: 0, y: 1 } } },
    ];
    const { container } = setup();
    expect(remoteCursor(container)).toBeNull();
    expect(remoteCursor(container, 3)).toHaveTextContent("Guest");
  });

  it("hides offscreen anchors and cursors when image geometry is unavailable", () => {
    room.others[0].presence = { cursor: { x: 0, y: 0 } };
    const { container, image } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(remoteCursor(container)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(remoteCursor(container)).toBeInTheDocument();
    fireEvent.error(image);
    expect(remoteCursor(container)).toBeNull();
  });
});

describe("local cursor presence", () => {
  it("coalesces moves at 20 Hz, sends image fractions, and skips unchanged positions", () => {
    const { image } = setup();
    move(image, { x: 400, y: 300 });
    move(image);
    expect(mockUpdateMyPresence).not.toHaveBeenCalled();
    flush();
    expect(mockUpdateMyPresence).toHaveBeenCalledTimes(1);
    expect(mockUpdateMyPresence).toHaveBeenLastCalledWith({
      cursor: { x: 0.5, y: 0.5 },
    });
    move(image);
    flush();
    expect(mockUpdateMyPresence).toHaveBeenCalledTimes(1);
  });

  it("uses real inverse transforms and does not publish camera-only changes", () => {
    const { image, viewport } = setup();
    move(image);
    flush();
    mockUpdateMyPresence.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const smaller = { width: 700, height: 500 };
    dimensions.resize(viewport, smaller);
    flush();
    expect(mockUpdateMyPresence).not.toHaveBeenCalled();
    const anchor = { x: 0.7, y: 0.3 };
    const point = imageToViewport(
      anchor,
      imageSize,
      getImageTransform(imageSize, smaller, { x: 0, y: 0 }, 1.25)!
    );
    move(image, point);
    flush();
    const cursor = mockUpdateMyPresence.mock.lastCall![0].cursor;
    expect(cursor.x).toBeCloseTo(anchor.x);
    expect(cursor.y).toBeCloseTo(anchor.y);
  });

  it.each([
    "image boundary",
    "viewport boundary",
    "leave",
    "cancel",
    "capture lost",
    "blur",
    "pagehide",
    "hidden",
    "controls",
  ])("clears immediately on %s and cancels queued positions", (reason) => {
    const { image, viewport } = setup();
    move(image);
    flush();
    move(image, { x: 510, y: 350 });
    switch (reason) {
      case "image boundary":
        move(viewport, { x: 10, y: 10 });
        break;
      case "viewport boundary":
        move(image, { x: 1100, y: 350 });
        break;
      case "leave":
        fireEvent.pointerLeave(viewport);
        break;
      case "cancel":
        fireEvent.pointerCancel(image);
        break;
      case "capture lost":
        fireEvent.lostPointerCapture(image);
        break;
      case "blur":
        fireEvent(window, new Event("blur"));
        break;
      case "pagehide":
        fireEvent(window, new Event("pagehide"));
        break;
      case "hidden":
        jest
          .spyOn(document, "visibilityState", "get")
          .mockReturnValue("hidden");
        fireEvent(document, new Event("visibilitychange"));
        break;
      case "controls":
        move(screen.getByRole("button", { name: "Zoom in" }));
        break;
    }
    expect(mockUpdateMyPresence).toHaveBeenLastCalledWith({ cursor: null });
    flush();
    expect(mockUpdateMyPresence).toHaveBeenCalledTimes(2);
  });

  it("does not publish a queued first position after leaving", () => {
    const { image, viewport } = setup();
    move(image);
    fireEvent.pointerLeave(viewport);
    flush();
    expect(mockUpdateMyPresence).not.toHaveBeenCalled();
  });

  it("clears on disconnect and starts fresh on reconnect", () => {
    const { image, updateRoom } = setup();
    move(image);
    flush();
    updateRoom({ status: "reconnecting" });
    expect(mockUpdateMyPresence).toHaveBeenLastCalledWith({ cursor: null });
    move(image);
    flush();
    expect(mockUpdateMyPresence).toHaveBeenCalledTimes(2);
    updateRoom({ status: "connected" });
    expect(mockUpdateMyPresence).toHaveBeenCalledTimes(2);
    move(image);
    flush();
    expect(mockUpdateMyPresence).toHaveBeenLastCalledWith({
      cursor: { x: 0.5, y: 0.5 },
    });
  });

  it("removes listeners and pending work on unmount", () => {
    const { image, unmount } = setup();
    move(image);
    flush();
    move(image, { x: 510, y: 350 });
    unmount();
    expect(mockUpdateMyPresence).toHaveBeenLastCalledWith({ cursor: null });
    flush();
    move(image);
    fireEvent(window, new Event("blur"));
    expect(mockUpdateMyPresence).toHaveBeenCalledTimes(2);
  });

  it("does not share touch or secondary-pointer positions", () => {
    const { image } = setup();
    fireEvent.pointerMove(image, {
      clientX: 524,
      clientY: 430,
      pointerType: "touch",
    });
    fireEvent.pointerMove(image, {
      clientX: 524,
      clientY: 430,
      isPrimary: false,
    });
    flush();
    expect(mockUpdateMyPresence).not.toHaveBeenCalled();
  });
});

describe("online collaborators", () => {
  it("counts the local connection once and shows accessible initials in the header", () => {
    setup();
    const header = screen.getByRole("banner");
    expect(
      within(header).getByRole("group", { name: "2 online collaborators" })
    ).toBeVisible();
    expect(
      screen.getByRole("listitem", { name: "Local Reviewer (you) — online" })
    ).toHaveTextContent("LR");
    expect(
      screen.getByRole("listitem", { name: "Ada Lovelace — online" })
    ).toHaveTextContent("AL");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("falls back for absent names, absent avatars, and broken image URLs", () => {
    room.others = [
      { connectionId: 2, info: { name: "   " } },
      {
        connectionId: 3,
        info: { name: "Prince", avatar: "/missing-avatar.png" },
      },
    ];
    setup();
    expect(
      screen.getByRole("listitem", { name: "Guest — online" })
    ).toHaveTextContent("G");
    const avatar = screen.getByRole("listitem", { name: "Prince — online" });
    fireEvent.error(avatar.querySelector("img")!);
    expect(avatar.querySelector("img")).toBeNull();
    expect(avatar).toHaveTextContent("P");
  });

  it("caps the visible avatars and labels the overflow", () => {
    room.others = [2, 3, 4, 5, 6].map((connectionId) => ({
      connectionId,
      info: { name: `Reviewer ${connectionId}` },
    }));
    setup();
    expect(
      screen.getByRole("group", { name: "6 online collaborators" })
    ).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(
      screen.getByRole("listitem", {
        name: "3 more online: Reviewer 4, Reviewer 5, Reviewer 6",
      })
    ).toHaveTextContent("+3");
  });

  it("updates the count on leave and hides the roster while disconnected or empty", () => {
    const { updateRoom } = setup();
    updateRoom({ others: [] });
    expect(
      screen.getByRole("group", { name: "1 online collaborator" })
    ).toBeVisible();
    updateRoom({ status: "disconnected" });
    expect(
      screen.queryByRole("group", { name: /online collaborator/ })
    ).toBeNull();
    updateRoom({ status: "connected", self: null });
    expect(
      screen.queryByRole("group", { name: /online collaborator/ })
    ).toBeNull();
  });
});
