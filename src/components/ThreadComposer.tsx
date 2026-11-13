import { CommentPin, FloatingComposer } from "@liveblocks/react-ui";
import { useSelf, useCreateThread } from "@liveblocks/react/suspense";
import { useMaxZIndex } from "../hooks";
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
  const creatorId = useSelf((me) => me.id);
  const createThread = useCreateThread();
  const maxZIndex = useMaxZIndex();
  const position = imageToViewport(anchor, imageSize, transform);
  const metadata = {
    x: anchor.x,
    y: anchor.y,
    coordinateSpace: "image" as const,
    zIndex: maxZIndex + 1,
  };

  return (
    <FloatingComposer
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      metadata={metadata}
      onComposerSubmit={(comment, event) => {
        // Capture the optimistic ID so the new thread opens immediately.
        event.preventDefault();
        const thread = createThread({
          body: comment.body,
          attachments: comment.attachments,
          metadata,
        });
        onCreate(thread.id);
      }}
    >
      <CommentPin
        userId={creatorId}
        corner="top-left"
        aria-label="Cancel new comment"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: `translate(${position.x}px, ${position.y}px)`,
          zIndex: maxZIndex + 1,
        }}
      />
    </FloatingComposer>
  );
}
