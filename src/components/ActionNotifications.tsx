"use client";

import { createContext, useContext, useEffect, useState } from "react";

export const ACTION_FEEDBACK = {
  "comment-added": {
    success: "Comment added",
    error: "CREATE_THREAD_ERROR",
  },
  "reply-added": {
    success: "Reply added",
    error: "CREATE_COMMENT_ERROR",
  },
  "comment-edited": {
    success: "Comment updated",
    error: "EDIT_COMMENT_ERROR",
  },
  "comment-deleted": {
    success: "Comment deleted",
    error: "DELETE_COMMENT_ERROR",
  },
  "thread-resolved": {
    success: "Thread resolved",
    error: "MARK_THREAD_AS_RESOLVED_ERROR",
  },
  "thread-reopened": {
    success: "Thread reopened",
    error: "MARK_THREAD_AS_UNRESOLVED_ERROR",
  },
  "thread-subscribed": {
    success: "Subscribed to thread",
    error: "SUBSCRIBE_TO_THREAD_ERROR",
  },
  "thread-unsubscribed": {
    success: "Unsubscribed from thread",
    error: "UNSUBSCRIBE_FROM_THREAD_ERROR",
  },
} as const;

export type CommentAction = {
  action: keyof typeof ACTION_FEEDBACK;
  threadId: string;
  commentId?: string;
};

export type ActionNotification = CommentAction & { id: number; saved: boolean };

export const ActionNotificationsContext = createContext<
  ((action: CommentAction) => void) | null
>(null);

export function useActionNotifications() {
  const notify = useContext(ActionNotificationsContext);
  if (!notify)
    throw new Error("Comment actions must be inside CollaborationStatus");
  return notify;
}

export function ActionToast({
  notification,
  onDismiss,
}: {
  notification: ActionNotification;
  onDismiss: (id: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!notification.saved || hovered || focused) return;
    const timer = window.setTimeout(() => onDismiss(notification.id), 5000);
    return () => window.clearTimeout(timer);
  }, [notification.id, notification.saved, hovered, focused, onDismiss]);

  const feedback = ACTION_FEEDBACK[notification.action];
  return (
    <div
      className="action-toast"
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <span className="toast-icon" aria-hidden="true">
        {notification.saved ? "✓" : "…"}
      </span>
      <div className="toast-message">
        <span>{feedback.success}</span>
        {!notification.saved && <span className="toast-saving">Saving…</span>}
      </div>
      <button
        type="button"
        className="toast-dismiss"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(notification.id)}
      >
        ×
      </button>
    </div>
  );
}
