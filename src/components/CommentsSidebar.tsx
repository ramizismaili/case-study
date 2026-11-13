"use client";

import { useEffect, useId, useState, type PropsWithChildren } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@liveblocks/react";
import type { ThreadData } from "@liveblocks/client";
import { commentBodyText } from "../lib/comment-body";
import { collaboratorName, collaboratorInitials } from "../lib/collaborators";

export function CommentsSidebarShell({ children }: PropsWithChildren) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  useEffect(() => {
    setTarget(document.getElementById("comments-sidebar"));
    setExpanded(window.innerWidth >= 760);
  }, []);
  if (!target) return null;
  return createPortal(
    // Liveblocks floating editors ignore outside interactions within lb-portal.
    // This keeps sidebar clicks from dismissing a draft before it is suspended.
    <aside
      className="comments-sidebar lb-portal"
      aria-label="Comments sidebar"
      data-expanded={expanded}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="sidebar-heading">
        {expanded && <h2>Comments</h2>}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-label={
            expanded ? "Collapse comments sidebar" : "Expand comments sidebar"
          }
          title={expanded ? "Collapse comments" : "Expand comments"}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "›" : "‹"}
        </button>
      </div>
      <div id={contentId} className="sidebar-content" hidden={!expanded}>
        {children}
      </div>
    </aside>,
    target
  );
}

function ThreadSummary({
  thread,
  selected,
  disabled,
  onSelect,
}: {
  thread: ThreadData;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const comment = thread.comments.find((item) => item.body);
  const { user } = useUser(comment?.userId ?? "");
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const name = collaboratorName(user?.name);
  const preview = comment?.body
    ? commentBodyText(comment.body).trim() || "Attachment"
    : "No comments available";
  const count = thread.comments.filter((item) => item.body).length;
  return (
    <li>
      <button
        type="button"
        className="sidebar-thread"
        data-resolved={thread.resolved}
        aria-current={selected ? "true" : undefined}
        disabled={disabled}
        onClick={onSelect}
      >
        <span className="sidebar-thread-heading">
          <span className="sidebar-author-avatar" aria-hidden="true">
            {collaboratorInitials(name)}
            {user?.avatar && user.avatar !== failedAvatar && (
              <img
                src={user.avatar}
                alt=""
                onError={() => setFailedAvatar(user.avatar)}
              />
            )}
          </span>
          <strong>{name}</strong>
          <span className="thread-status" data-resolved={thread.resolved}>
            {thread.resolved ? "Resolved" : "Open"}
          </span>
        </span>
        <span className="thread-preview">{preview}</span>
        <span className="thread-count">
          {count} {count === 1 ? "comment" : "comments"}
        </span>
      </button>
    </li>
  );
}

export function CommentsSidebar({
  threads,
  selectedId,
  disabled,
  onSelect,
  hasDraft,
  onResumeDraft,
}: {
  threads: ThreadData[];
  selectedId: string | null;
  disabled: boolean;
  onSelect: (thread: ThreadData) => void;
  hasDraft: boolean;
  onResumeDraft: () => void;
}) {
  return (
    <CommentsSidebarShell>
      {hasDraft && (
        <button
          type="button"
          className="resume-draft"
          disabled={disabled}
          onClick={onResumeDraft}
        >
          Resume new comment
        </button>
      )}
      {threads.length === 0 ? (
        <p className="sidebar-empty">
          No comments yet. Click the image to start a conversation.
        </p>
      ) : (
        <ul className="sidebar-threads">
          {threads.map((thread) => (
            <ThreadSummary
              key={thread.id}
              thread={thread}
              selected={selectedId === thread.id}
              disabled={disabled}
              onSelect={() => onSelect(thread)}
            />
          ))}
        </ul>
      )}
    </CommentsSidebarShell>
  );
}
