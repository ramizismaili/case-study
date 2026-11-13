import { FloatingThread, CommentPin } from "@liveblocks/react-ui";
import type { ThreadData } from "@liveblocks/client";
import { useDraggable } from "@dnd-kit/core";
import { useMaxZIndex } from "../hooks";
import type { Point } from "../lib/coordinates";

type DraggableThreadProps = {
  thread: ThreadData;
  position: Point;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DraggableThread({
  thread,
  position,
  open,
  onOpenChange,
}: DraggableThreadProps) {
  const { isDragging, attributes, listeners, setNodeRef, transform } =
    useDraggable({ id: thread.id });
  const maxZIndex = useMaxZIndex();
  const x = position.x + (transform?.x ?? 0);
  const y = position.y + (transform?.y ?? 0);

  return (
    <FloatingThread
      thread={thread}
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      style={{ pointerEvents: isDragging ? "none" : "auto" }}
    >
      <CommentPin
        ref={setNodeRef}
        userId={thread.comments[0]?.userId}
        corner="top-left"
        {...listeners}
        {...attributes}
        aria-label={open ? "Close comment thread" : "Open comment thread"}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: `translate3d(${x}px, ${y}px, 0)`,
          zIndex: open || isDragging ? maxZIndex + 1 : thread.metadata.zIndex,
          touchAction: "none",
        }}
      />
    </FloatingThread>
  );
}
