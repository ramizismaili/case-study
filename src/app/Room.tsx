"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { RoomProvider } from "@liveblocks/react/suspense";
import { ClientSideSuspense } from "@liveblocks/react";
import { ErrorBoundary } from "react-error-boundary";
import { CommentsCanvas } from "../components/CommentsCanvas";
import { Loading } from "../components/Loading";

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
    <RoomProvider id={roomId}>
      <ErrorBoundary
        fallback={
          <div className="canvas-notice" role="alert">
            There was an error while getting threads.
          </div>
        }
      >
        <ClientSideSuspense fallback={<Loading />}>
          <CommentsCanvas />
        </ClientSideSuspense>
      </ErrorBoundary>
    </RoomProvider>
  );
}
