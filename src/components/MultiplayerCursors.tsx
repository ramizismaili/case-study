"use client";

import { memo } from "react";
import {
  shallow,
  useOther,
  useOthersConnectionIds,
  useStatus,
} from "@liveblocks/react";
import { useImageCanvas } from "./ImageCanvasContext";
import { useCursorPresence } from "../hooks/useCursorPresence";
import { imageToViewport } from "../lib/coordinates";
import {
  collaboratorColor,
  collaboratorName,
  isImageCursor,
} from "../lib/collaborators";

const RemoteCursor = memo(function RemoteCursor({
  connectionId,
}: {
  connectionId: number;
}) {
  const other = useOther(
    connectionId,
    (user) => ({
      cursor: user.presence?.cursor,
      name: user.info?.name,
    }),
    shallow
  );
  const { imageSize, transform, viewportSize } = useImageCanvas();
  if (!transform || !isImageCursor(other?.cursor)) return null;
  const point = imageToViewport(other.cursor, imageSize, transform);
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x > viewportSize.width ||
    point.y > viewportSize.height
  )
    return null;

  return (
    <div
      className="remote-cursor"
      data-connection-id={connectionId}
      style={{
        transform: `translate(${point.x}px, ${point.y}px)`,
        color: collaboratorColor(connectionId),
      }}
    >
      <svg width="20" height="24" viewBox="0 0 20 24" fill="currentColor">
        <path
          d="M1 1 18 15 10 16 6 23Z"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="remote-cursor-name"
        style={{ backgroundColor: collaboratorColor(connectionId) }}
      >
        {collaboratorName(other.name)}
      </span>
    </div>
  );
});

export const MultiplayerCursors = memo(function MultiplayerCursors() {
  useCursorPresence();
  const connectionIds = useOthersConnectionIds();
  const connected = useStatus() === "connected";
  return (
    <div
      className="multiplayer-cursors"
      aria-hidden="true"
      style={{ pointerEvents: "none" }}
    >
      {connected &&
        connectionIds.map((connectionId) => (
          <RemoteCursor key={connectionId} connectionId={connectionId} />
        ))}
    </div>
  );
});
