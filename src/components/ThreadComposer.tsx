import { CommentPin, FloatingComposer } from "@liveblocks/react-ui";
import { useSelf } from "@liveblocks/react";
import { useCreateThread, useStatus } from "@liveblocks/react/suspense";
import { useState } from "react";
import type { ComposerSubmitComment } from "@liveblocks/react-ui";
import { hasCommentContent } from "../lib/comment-body";
import { useActionNotifications } from "./ActionNotifications";
import { useMaxZIndex } from "../hooks";
import { useThreadPlacement } from "../hooks/useThreadPlacement";
import { COMMENT_PIN_SIZE } from "../lib/thread-placement";
import {
  imageToViewport,
  type ImagePoint,
  type Size,
  type ViewportTransform,
} from "../lib/coordinates";

type ThreadComposerProps = {
  anchor: ImagePoint;
  imageSize: Size;
  transform: ViewportTransform;
  onCancel: () => void;
  onCreate: (threadId: string) => void;
};

export function ThreadComposer({
  anchor,
  imageSize,
  transform,
  onCancel,
  onCreate,
}: ThreadComposerProps) {
  // Author identity can arrive after threads. An optional avatar must not
  // suspend the whole comments canvas when the first draft is opened.
  const creatorId = useSelf((me) => me.id) ?? undefined;
  const createThread = useCreateThread();
  const notify = useActionNotifications();
  const status = useStatus();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{
    revision: number;
    comment?: ComposerSubmitComment;
  }>({ revision: 0 });
  const maxZIndex = useMaxZIndex();
  const position = imageToViewport(anchor, imageSize, transform);
  const placement = useThreadPlacement(position);
  const metadata = {
    x: anchor.x,
    y: anchor.y,
    coordinateSpace: "image" as const,
    zIndex: maxZIndex + 1,
  };

  return (
    <>
      {submitError && (
        <div className="canvas-notice" role="alert">
          {submitError}
        </div>
      )}
      <FloatingComposer
        key={recovery.revision}
        {...placement}
        disabled={status !== "connected"}
        defaultValue={recovery.comment?.body}
        defaultAttachments={recovery.comment?.attachments}
        onInputCapture={() => setSubmitError(null)}
        onSubmitCapture={(event) => {
          if (status !== "connected") event.preventDefault();
        }}
        open
        onOpenChange={(open) => {
          if (!open) onCancel();
        }}
        metadata={metadata}
        onComposerSubmit={(comment, event) => {
          // Capture the optimistic ID so the new thread opens immediately.
          event.preventDefault();
          if (status !== "connected") {
            setSubmitError("Reconnect before sending your comment.");
            return;
          }
          if (!hasCommentContent(comment.body)) {
            setSubmitError("Write a comment before sending.");
            return;
          }
          try {
            const thread = createThread({
              body: comment.body,
              attachments: comment.attachments,
              metadata,
            });
            notify({ action: "comment-added", threadId: thread.id });
            onCreate(thread.id);
          } catch {
            // Liveblocks clears its editor after the callback, even if default
            // creation was prevented. Remount with the draft on a local failure.
            setRecovery((previous) => ({
              revision: previous.revision + 1,
              comment,
            }));
            setSubmitError(
              "Your comment could not be sent. Your draft is ready to try again."
            );
          }
        }}
      >
        <CommentPin
          data-cursor-surface
          userId={creatorId}
          corner="top-left"
          aria-label="Cancel new comment"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: COMMENT_PIN_SIZE,
            height: COMMENT_PIN_SIZE,
            transform: `translate(${position.x}px, ${position.y}px)`,
            zIndex: maxZIndex + 1,
          }}
        />
      </FloatingComposer>
    </>
  );
}
