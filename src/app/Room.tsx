"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { RoomProvider } from "@liveblocks/react/suspense";
import { ClientSideSuspense } from "@liveblocks/react";
import { ErrorBoundary } from "react-error-boundary";
import { CommentsCanvas } from "../components/CommentsCanvas";
import { Loading } from "../components/Loading";
import { CollaborationStatus } from "../components/CollaborationStatus";
import { MultiplayerCursors } from "../components/MultiplayerCursors";
import { OnlineCollaborators } from "../components/OnlineCollaborators";

export function Room({ isConfigured }: { isConfigured: boolean }) {
  const params = useSearchParams();
  const exampleId = params?.get("exampleId");
  const roomId = useMemo(() => {
    const baseId = "liveblocks:examples:nextjs-comments-canvas";
    return exampleId ? `${baseId}-${exampleId}` : baseId;
  }, [exampleId]);

  if (!isConfigured) {
    return (
      <div className="canvas-notice" role="status">
        <strong>Connect comments</strong>
        <span>
          Add LIVEBLOCKS_SECRET_KEY to .env.local and restart the server to
          enable shared comments.
        </span>
      </div>
    );
  }

  return (
    <RoomProvider key={roomId} id={roomId} initialPresence={{ cursor: null }}>
      <CollaborationStatus>
        <MultiplayerCursors />
        <OnlineCollaborators />
        <ErrorBoundary
          resetKeys={[roomId]}
          fallback={
            <div className="canvas-notice" role="alert">
              <strong>Comments could not be loaded</strong>
              <span>You can still explore the image. Reload to try again.</span>
              <button type="button" onClick={() => window.location.reload()}>
                Reload comments
              </button>
            </div>
          }
        >
          <ClientSideSuspense fallback={<Loading />}>
            <CommentsCanvas />
          </ClientSideSuspense>
        </ErrorBoundary>
      </CollaborationStatus>
    </RoomProvider>
  );
}
