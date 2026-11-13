import {
  FloatingThread,
  CommentPin,
  Comment,
  Composer,
  type ComposerSubmitComment,
} from "@liveblocks/react-ui";
import { useCallback, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { usePersistentComposer } from "../hooks/usePersistentComposer";
import type { ThreadData } from "@liveblocks/client";
import { useDraggable } from "@dnd-kit/core";
import { useMaxZIndex } from "../hooks";
import type { Point } from "../lib/coordinates";
import { useThreadPlacement } from "../hooks/useThreadPlacement";
import { COMMENT_PIN_SIZE } from "../lib/thread-placement";
import { useStatus, useThreadSubscription } from "@liveblocks/react/suspense";
import { hasCommentContent } from "../lib/comment-body";
import { useActionNotifications } from "./ActionNotifications";

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
  const canEdit = useStatus() === "connected";
  const notify = useActionNotifications();
  const subscription = useThreadSubscription(thread.id);
  const { isDragging, attributes, listeners, setNodeRef, transform } =
    useDraggable({ id: thread.id, disabled: !canEdit });
  const maxZIndex = useMaxZIndex();
  const x = position.x + (transform?.x ?? 0);
  const y = position.y + (transform?.y ?? 0);
  const placement = useThreadPlacement({ x, y });
  const [threadElement, setThreadElement] = useState<HTMLElement | null>(null);
  const replyHost = usePersistentComposer(threadElement, open);
  const setThreadRef = useCallback(
    (element: HTMLDivElement | null) => {
      placement.ref(element);
      setThreadElement(element);
    },
    [placement.ref]
  );
  function submitReply(
    comment: ComposerSubmitComment,
    event: FormEvent<HTMLFormElement>
  ) {
    if (!canEdit || !hasCommentContent(comment.body)) {
      event.preventDefault();
      return;
    }
    notify({ action: "reply-added", threadId: thread.id });
  }

  return (
    <>
      <FloatingThread
        className="review-thread"
        thread={thread}
        open={open}
        onOpenChange={onOpenChange}
        showActions={canEdit ? "hover" : false}
        showResolveAction={canEdit}
        showSubscription={false}
        showComposer={false}
        onResolvedChange={(resolved) =>
          notify({
            action: resolved ? "thread-resolved" : "thread-reopened",
            threadId: thread.id,
          })
        }
        onCommentEdit={(comment) =>
          notify({
            action: "comment-edited",
            threadId: thread.id,
            commentId: comment.id,
          })
        }
        onCommentDelete={(comment) =>
          notify({
            action: "comment-deleted",
            threadId: thread.id,
            commentId: comment.id,
          })
        }
        commentDropdownItems={({ comment, children }) => {
          // Returning an empty fragment still makes Liveblocks render More.
          if (
            !canEdit ||
            comment.id !== thread.comments.find((item) => item.body)?.id
          ) {
            return children;
          }
          return (
            <>
              <Comment.DropdownItem
                onSelect={() => {
                  const subscribed = subscription.status === "subscribed";
                  if (subscribed) subscription.unsubscribe();
                  else subscription.subscribe();
                  notify({
                    action: subscribed
                      ? "thread-unsubscribed"
                      : "thread-subscribed",
                    threadId: thread.id,
                  });
                }}
              >
                {subscription.status === "subscribed"
                  ? "Unsubscribe from thread"
                  : "Subscribe to thread"}
              </Comment.DropdownItem>
              {children}
            </>
          );
        }}
        onSubmitCapture={(event) => {
          if (!canEdit) event.preventDefault();
        }}
        {...placement}
        ref={setThreadRef}
        style={{
          ...placement.style,
          // The comment list scrolls independently; keep the reply box visible.
          overflow: "hidden",
          pointerEvents: isDragging ? "none" : "auto",
        }}
      >
        <CommentPin
          className="lb-portal"
          data-focused={open || undefined}
          data-cursor-surface
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
            width: COMMENT_PIN_SIZE,
            height: COMMENT_PIN_SIZE,
            transform: `translate3d(${x}px, ${y}px, 0)`,
            zIndex: open || isDragging ? maxZIndex + 1 : thread.metadata.zIndex,
            touchAction: "none",
          }}
        />
      </FloatingThread>
      {replyHost &&
        createPortal(
          <Composer
            threadId={thread.id}
            defaultCollapsed
            disabled={!canEdit}
            onComposerSubmit={submitReply}
            onSubmitCapture={(event) => {
              if (!canEdit) event.preventDefault();
            }}
            overrides={{ COMPOSER_PLACEHOLDER: "Write a reply…" }}
          />,
          replyHost
        )}
    </>
  );
}
