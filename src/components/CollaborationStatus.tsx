"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { createPortal } from "react-dom";
import {
  useErrorListener,
  useRoom,
  useStatus,
  useSyncStatus,
} from "@liveblocks/react";
import { commentBodyText } from "../lib/comment-body";
import {
  ACTION_FEEDBACK,
  ActionNotificationsContext,
  ActionToast,
  type ActionNotification,
  type CommentAction,
} from "./ActionNotifications";

type Failure = {
  id: string;
  message: string;
  text?: string;
  connection: boolean;
};

export function CollaborationStatus({ children }: PropsWithChildren) {
  const room = useRoom();
  const status = useStatus();
  const syncStatus = useSyncStatus();
  const [failures, setFailures] = useState<Failure[]>([]);
  const [notifications, setNotifications] = useState<ActionNotification[]>([]);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const [toastTarget, setToastTarget] = useState<HTMLElement | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    setHeaderTarget(document.getElementById("collaboration-indicator"));
    setToastTarget(document.body);
  }, []);

  const notify = useCallback((action: CommentAction) => {
    const notification = { ...action, id: ++nextId.current, saved: false };
    setNotifications((current) => [...current.slice(-3), notification]);
  }, []);
  const dismissNotification = useCallback((id: number) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    // Actions appear optimistically. Keep the saving hint until writes settle.
    if (
      syncStatus === "synchronized" &&
      notifications.some((item) => !item.saved)
    ) {
      setNotifications((current) =>
        current.map((item) => (item.saved ? item : { ...item, saved: true }))
      );
    }
  }, [syncStatus, notifications]);

  useEffect(() => {
    if (status === "connected")
      setFailures((current) =>
        current.some((failure) => failure.connection)
          ? current.filter((failure) => !failure.connection)
          : current
      );
  }, [status]);

  useErrorListener(({ context }) => {
    // The SDK's error listener receives errors from every room in this client.
    if (context.roomId !== room.id) return;
    setNotifications((current) =>
      current.filter(
        (item) =>
          !(
            ACTION_FEEDBACK[item.action].error === context.type &&
            item.threadId === context.threadId &&
            (!item.commentId || item.commentId === context.commentId)
          )
      )
    );
    const id = `${context.type}:${context.threadId ?? ""}:${context.commentId ?? ""}`;
    let failure: Failure;
    if (context.type === "ROOM_CONNECTION_ERROR") {
      failure = {
        id,
        connection: true,
        message:
          "Shared comments could not connect. Check your connection and room access, then reconnect.",
      };
    } else {
      const body =
        context.type === "CREATE_THREAD_ERROR" ||
        context.type === "CREATE_COMMENT_ERROR" ||
        context.type === "EDIT_COMMENT_ERROR"
          ? context.body
          : undefined;
      failure = {
        id,
        connection: false,
        message: body
          ? "Your comment could not be saved. Copy the text below and try again. Reattach any files before sending."
          : "The comment action could not be saved. Please try again.",
        text: body ? commentBodyText(body) : undefined,
      };
    }
    // Keep independent failed submissions available until explicitly dismissed.
    setFailures((current) => [
      ...current.filter((item) => item.id !== id),
      failure,
    ]);
  });

  const connected = status === "connected";
  const label = connected
    ? syncStatus === "synchronizing"
      ? "Saving comments…"
      : "Comments connected"
    : status === "reconnecting"
      ? "Connection lost. Reconnecting…"
      : status === "disconnected"
        ? "Comments disconnected"
        : "Connecting comments…";

  return (
    <ActionNotificationsContext.Provider value={notify}>
      {children}
      {headerTarget &&
        createPortal(
          <span
            className="connection-indicator"
            role="status"
            aria-label={label}
            title={label}
            tabIndex={0}
          >
            <span
              className="connection-dot"
              data-state={
                connected && syncStatus === "synchronizing" ? "saving" : status
              }
              aria-hidden="true"
            />
            <span className="sr-only">{label}</span>
          </span>,
          headerTarget
        )}
      {toastTarget &&
        createPortal(
          <div className="notification-stack" aria-label="Notifications">
            {(status === "disconnected" ||
              status === "reconnecting" ||
              failures.some((failure) => failure.connection)) && (
              <div className="connection-notice" role="status">
                <span>{connected ? "Connection needs attention" : label}</span>
                <button type="button" onClick={() => room.reconnect()}>
                  Reconnect
                </button>
              </div>
            )}
            {notifications.map((notification) => (
              <ActionToast
                key={notification.id}
                notification={notification}
                onDismiss={dismissNotification}
              />
            ))}
            {failures.length > 0 && (
              <div className="collaboration-errors">
                {failures.map((failure) => (
                  <div
                    key={failure.id}
                    className="collaboration-error"
                    role="alert"
                  >
                    <p>{failure.message}</p>
                    {failure.text !== undefined && (
                      <textarea
                        aria-label="Unsaved comment text"
                        readOnly
                        value={failure.text}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setFailures((current) =>
                          current.filter((item) => item.id !== failure.id)
                        )
                      }
                    >
                      Dismiss error
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>,
          toastTarget
        )}
    </ActionNotificationsContext.Provider>
  );
}
