import {
  useThreads,
  useEditThreadMetadata,
  useStatus,
} from "@liveblocks/react/suspense";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useCallback, useRef, useState, type MouseEvent } from "react";
import type { ThreadData } from "@liveblocks/client";
import { CommentsSidebar } from "./CommentsSidebar";
import { ThreadComposer } from "./ThreadComposer";
import { DraggableThread } from "./DraggableThread";
import { useImageCanvas } from "./ImageCanvasContext";
import { useMaxZIndex } from "../hooks";
import {
  clientToViewport,
  imageToViewport,
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
  const canEdit = useStatus() === "connected";
  const editThreadMetadata = useEditThreadMetadata();
  const maxZIndex = useMaxZIndex();
  const { imageSize, transform, focusAnchor } = useImageCanvas();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draftAnchor, setDraftAnchor] = useState<ImagePoint | null>(null);
  const [draftSuspended, setDraftSuspended] = useState(false);
  const [legacyAnchors, setLegacyAnchors] = useState<
    Record<string, { x: number; y: number; anchor: ImagePoint }>
  >({});
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 3 } })
  );

  const threadPosition = useCallback(
    (thread: ThreadData) => {
      const legacy = legacyAnchors[thread.id];
      return legacy &&
        !thread.metadata.coordinateSpace &&
        legacy.x === thread.metadata.x &&
        legacy.y === thread.metadata.y
        ? imageToViewport(legacy.anchor, imageSize, transform!)
        : getThreadPosition(thread.metadata, imageSize, transform!);
    },
    [legacyAnchors, imageSize, transform]
  );

  function selectThread(thread: ThreadData) {
    if (!transform) return;
    const anchor = viewportToImage(
      threadPosition(thread),
      imageSize,
      transform
    );
    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;
    if (!thread.metadata.coordinateSpace) {
      setLegacyAnchors((previous) => ({
        ...previous,
        [thread.id]: { x: thread.metadata.x, y: thread.metadata.y, anchor },
      }));
    }
    focusAnchor(anchor);
    setDraftSuspended(true);
    setOpenThreadId(thread.id);
  }

  const handleDragEnd = useCallback(
    ({ active, delta }: DragEndEvent) => {
      const thread = threads.find((thread) => thread.id === active.id);
      if (!thread || !transform || !canEdit) return;

      const anchor = getDraggedImageAnchor(
        threadPosition(thread),
        delta,
        imageSize,
        transform
      );
      try {
        editThreadMetadata({
          threadId: thread.id,
          metadata: {
            ...anchor,
            coordinateSpace: "image",
            zIndex: maxZIndex + 1,
          },
        });
        setInteractionError(null);
      } catch {
        setInteractionError(
          "The comment could not be moved. Please try again."
        );
      }
    },
    [
      editThreadMetadata,
      maxZIndex,
      threads,
      imageSize,
      transform,
      canEdit,
      threadPosition,
    ]
  );

  function handleImageClick(event: MouseEvent<HTMLButtonElement>) {
    if (!canvasRef.current || !transform || !canEdit) return;
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
    setDraftSuspended(false);
    setDraftAnchor(anchor);
  }

  return (
    <>
      <CommentsSidebar
        threads={threads}
        selectedId={openThreadId}
        disabled={!transform}
        onSelect={selectThread}
        hasDraft={Boolean(draftAnchor)}
        onResumeDraft={() => {
          if (!draftAnchor) return;
          setOpenThreadId(null);
          setDraftSuspended(false);
          focusAnchor(draftAnchor);
        }}
      />
      {transform && (
        <div
          ref={canvasRef}
          className="comments-canvas"
          data-canvas-surface
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
              setDraftAnchor(null);
              setOpenThreadId(null);
            }
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setDraftAnchor(null);
              setOpenThreadId(null);
            }
          }}
        >
          {interactionError && (
            <div className="canvas-notice" role="alert">
              {interactionError}
              <button type="button" onClick={() => setInteractionError(null)}>
                Dismiss error
              </button>
            </div>
          )}
          <button
            type="button"
            className="image-comment-target"
            data-canvas-surface
            aria-label="Add a comment on the image"
            aria-disabled={!canEdit}
            title={
              canEdit
                ? "Click to comment; drag to pan"
                : "Reconnect to add comments; drag to pan"
            }
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
                  position={threadPosition(thread)}
                  open={openThreadId === thread.id}
                  onOpenChange={(open) => {
                    setOpenThreadId((current) =>
                      open ? thread.id : current === thread.id ? null : current
                    );
                    if (open) setDraftSuspended(true);
                  }}
                />
              ))}
            </DndContext>
          </div>
          {draftAnchor && (
            <ThreadComposer
              suspended={draftSuspended}
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
      )}
    </>
  );
}
