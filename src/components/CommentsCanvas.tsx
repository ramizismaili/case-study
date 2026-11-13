import { useThreads, useEditThreadMetadata } from "@liveblocks/react/suspense";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useCallback } from "react";
import { PlaceThreadButton } from "./PlaceThreadButton";
import { DraggableThread } from "./DraggableThread";
import { useMaxZIndex } from "../hooks";

export function CommentsCanvas() {
  const { threads } = useThreads();
  const editThreadMetadata = useEditThreadMetadata();
  const maxZIndex = useMaxZIndex();

  // Allow click event on avatar if thread moved less than 3px
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        distance: 3,
      },
    })
  );

  // On drag end, update thread metadata with new coords and highest z-index
  const handleDragEnd = useCallback(
    ({ active, delta }: DragEndEvent) => {
      const thread = threads.find((thread) => thread.id === active.id);
      if (!thread) {
        return;
      }
      editThreadMetadata({
        threadId: thread.id,
        metadata: {
          x: thread.metadata.x + delta.x,
          y: thread.metadata.y + delta.y,
          zIndex: maxZIndex + 1,
        },
      });
    },
    [editThreadMetadata, maxZIndex, threads]
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ isolation: "isolate" }}>
        <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
          {threads.map((thread) => (
            <DraggableThread key={thread.id} thread={thread} />
          ))}
        </DndContext>
      </div>
      <PlaceThreadButton />
    </div>
  );
}
