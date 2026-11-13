"use client";

import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  shallow,
  useOthersMapped,
  useSelf,
  useStatus,
} from "@liveblocks/react";
import {
  collaboratorColor,
  collaboratorInitials,
  collaboratorName,
} from "../lib/collaborators";

type Collaborator = { connectionId: number; name?: string; avatar?: string };

const Avatar = memo(function Avatar({
  user,
  local,
}: {
  user: Collaborator;
  local: boolean;
}) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const name = collaboratorName(user.name);
  const label = `${name}${local ? " (you)" : ""} — online`;
  return (
    <li
      className="collaborator-avatar"
      aria-label={label}
      title={label}
      style={{ backgroundColor: collaboratorColor(user.connectionId) }}
    >
      <span aria-hidden="true">{collaboratorInitials(name)}</span>
      {user.avatar && user.avatar !== failedAvatar && (
        <img
          src={user.avatar}
          alt=""
          onError={() => setFailedAvatar(user.avatar!)}
        />
      )}
    </li>
  );
});

export const OnlineCollaborators = memo(function OnlineCollaborators() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const connected = useStatus() === "connected";
  // Select identity only: cursor movement must not rerender the header.
  const others = useOthersMapped(
    (user) => ({ name: user.info?.name, avatar: user.info?.avatar }),
    shallow
  );
  const self = useSelf(
    (user) => ({
      connectionId: user.connectionId,
      name: user.info?.name,
      avatar: user.info?.avatar,
    }),
    shallow
  );
  useEffect(
    () => setTarget(document.getElementById("online-collaborators")),
    []
  );
  if (!target || !connected) return null;

  const users: Collaborator[] = [
    ...(self ? [self] : []),
    ...others
      .filter(([id]) => id !== self?.connectionId)
      .map(([connectionId, info]) => ({ connectionId, ...info })),
  ];
  if (!users.length) return null;
  const visible = users.slice(0, 3);
  const overflow = users.slice(3);
  const overflowLabel = overflow
    .map((user) => collaboratorName(user.name))
    .join(", ");
  return createPortal(
    <div
      className="online-collaborators"
      role="group"
      aria-label={`${users.length} online ${users.length === 1 ? "collaborator" : "collaborators"}`}
    >
      <ul className="collaborator-avatars" aria-label="Online collaborators">
        {visible.map((user) => (
          <Avatar
            key={user.connectionId}
            user={user}
            local={user.connectionId === self?.connectionId}
          />
        ))}
        {overflow.length > 0 && (
          <li
            className="collaborator-avatar collaborator-overflow"
            aria-label={`${overflow.length} more online: ${overflowLabel}`}
            title={overflowLabel}
          >
            +{overflow.length}
          </li>
        )}
      </ul>
      <span className="online-count" aria-hidden="true">
        {users.length} online
      </span>
    </div>,
    target
  );
});
