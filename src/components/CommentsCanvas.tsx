import { useThreads, useEditThreadMetadata } from "@liveblocks/react/suspense";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useCallback, useRef, useState, type MouseEvent } from "react";
import { ThreadComposer } from "./ThreadComposer";
import { DraggableThread } from "./DraggableThread";
import { useImageCanvas } from "./ImageCanvasContext";
import { useMaxZIndex } from "../hooks";
import {
  clientToViewport,
  isWithinImage,
  viewportToImage,
  type ImagePoint,
} from "../lib/coordinates";
import {
  getDraggedImageAnchor,
  getThreadPosition,
} from "../lib/thread-anchors";

export function CommentsCanvas() {
  const { threads } = useThreads();
  const editThreadMetadata = useEditThreadMetadata();
  const maxZIndex = useMaxZIndex();
  const { imageSize, transform } = useImageCanvas();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draftAnchor, setDraftAnchor] = useState<ImagePoint | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 3 } })
  );

  const handleDragEnd = useCallback(
    ({ active, delta }: DragEndEvent) => {
      const thread = threads.find((thread) => thread.id === active.id);
      if (!thread || !transform) return;

      const anchor = getDraggedImageAnchor(
        getThreadPosition(thread.metadata, imageSize, transform),
        delta,
        imageSize,
        transform
      );
      editThreadMetadata({
        threadId: thread.id,
        metadata: {
          ...anchor,
          coordinateSpace: "image",
          zIndex: maxZIndex + 1,
        },
      });
    },
    [editThreadMetadata, maxZIndex, threads, imageSize, transform]
  );

  function handleImageClick(event: MouseEvent<HTMLButtonElement>) {
    if (!canvasRef.current || !transform) return;
    // Keyboard activation places a comment at the center of the image.
    const anchor =
      event.detail === 0
        ? { x: 0.5, y: 0.5 }
        : viewportToImage(
            clientToViewport(
              { x: event.clientX, y: event.clientY },
              canvasRef.current.getBoundingClientRect()
            ),
            imageSize,
            transform
          );
    if (!isWithinImage(anchor)) return;

    setOpenThreadId(null);
    setDraftAnchor(anchor);
  }

  if (!transform) return null;

  return (
    <div
      ref={canvasRef}
      className="comments-canvas"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          setDraftAnchor(null);
          setOpenThreadId(null);
        }
      }}
    >
      <button
        type="button"
        className="image-comment-target"
        aria-label="Add a comment on the image"
        onClick={handleImageClick}
        style={{
          left: transform.origin.x,
          top: transform.origin.y,
          width: imageSize.width * transform.scale,
          height: imageSize.height * transform.scale,
        }}
      />
      <div className="comment-pins">
        <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
          {threads.map((thread) => (
            <DraggableThread
              key={thread.id}
              thread={thread}
              position={getThreadPosition(
                thread.metadata,
                imageSize,
                transform
              )}
              open={openThreadId === thread.id}
              onOpenChange={(open) => {
                setOpenThreadId(open ? thread.id : null);
                if (open) setDraftAnchor(null);
              }}
            />
          ))}
        </DndContext>
      </div>
      {draftAnchor && (
        <ThreadComposer
          anchor={draftAnchor}
          imageSize={imageSize}
          transform={transform}
          onCancel={() => setDraftAnchor(null)}
          onCreate={(threadId) => {
            setDraftAnchor(null);
            setOpenThreadId(threadId);
          }}
        />
      )}
    </div>
  );
}
