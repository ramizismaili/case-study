import type { CommentBody } from "@liveblocks/client";

/** Plain text for validation and for recovering text from a failed SDK mutation. */
export function commentBodyText(body: CommentBody): string {
  return body.content
    .map((paragraph) =>
      paragraph.children
        .map((child) => {
          if (child.type === "mention")
            return child.id.trim() ? `@${child.id}` : "";
          if (child.type === "link")
            return child.text?.trim() ? child.text : child.url;
          return child.text;
        })
        .join("")
    )
    .join("\n");
}

export function hasCommentContent(body: CommentBody): boolean {
  return commentBodyText(body).trim().length > 0;
}
