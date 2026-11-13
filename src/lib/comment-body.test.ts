import type { CommentBody } from "@liveblocks/client";
import { commentBodyText, hasCommentContent } from "./comment-body";

describe("comment content validation", () => {
  it.each(["", " ", "\n\t\r", "\u00a0"])("rejects blank text %j", (text) => {
    const body: CommentBody = {
      version: 1,
      content: [{ type: "paragraph", children: [{ text }] }],
    };

    expect(hasCommentContent(body)).toBe(false);
  });

  it("rejects empty paragraphs and whitespace split across formatting marks", () => {
    const body: CommentBody = {
      version: 1,
      content: [
        { type: "paragraph", children: [] },
        {
          type: "paragraph",
          children: [
            { text: "  ", bold: true },
            { text: "\t", italic: true },
          ],
        },
      ],
    };

    expect(hasCommentContent(body)).toBe(false);
    expect(hasCommentContent({ version: 1, content: [] })).toBe(false);
  });

  it.each([
    { text: " A useful comment ", bold: true },
    {
      type: "link" as const,
      url: "https://example.com",
      text: "Design reference",
    },
    { type: "link" as const, url: "https://example.com" },
    { type: "mention" as const, kind: "user" as const, id: "user-0" },
  ])("accepts meaningful rich content %j", (child) => {
    const body: CommentBody = {
      version: 1,
      content: [{ type: "paragraph", children: [child] }],
    };

    expect(hasCommentContent(body)).toBe(true);
  });

  it("retains paragraph breaks, links, and mentions in recoverable text", () => {
    const body: CommentBody = {
      version: 1,
      content: [
        {
          type: "paragraph",
          children: [
            { text: "Hello " },
            { type: "mention", kind: "user", id: "user-0" },
          ],
        },
        {
          type: "paragraph",
          children: [{ type: "link", url: "https://example.com" }],
        },
      ],
    };

    expect(commentBodyText(body)).toBe("Hello @user-0\nhttps://example.com");
  });
});
