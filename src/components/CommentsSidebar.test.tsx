import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ThreadData } from "@liveblocks/client";
import { CommentsSidebar } from "./CommentsSidebar";

let mockName: string | undefined = "Ada Lovelace";
let mockAvatar: string | undefined;
jest.mock("@liveblocks/react", () => ({
  useUser: () => ({
    user: mockName ? { name: mockName, avatar: mockAvatar } : undefined,
  }),
}));
const select = jest.fn();
const resume = jest.fn();
const thread: ThreadData = {
  id: "th_one",
  roomId: "test",
  type: "thread",
  visibility: "public",
  resolved: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  metadata: { x: 0.8, y: 0.2, coordinateSpace: "image", zIndex: 1 },
  comments: [
    {
      id: "cm_one",
      threadId: "th_one",
      roomId: "test",
      type: "comment",
      userId: "user-1",
      createdAt: new Date(),
      reactions: [],
      attachments: [],
      metadata: {},
      body: {
        version: 1,
        content: [
          {
            type: "paragraph",
            children: [{ text: "Increase the title contrast" }],
          },
        ],
      },
    },
  ],
};
beforeEach(() => {
  mockName = "Ada Lovelace";
  mockAvatar = undefined;
});
function view(
  threads: ThreadData[] = [thread],
  selectedId: string | null = null,
  disabled = false
) {
  return (
    <>
      <div id="comments-sidebar" />
      <CommentsSidebar
        threads={threads}
        selectedId={selectedId}
        disabled={disabled}
        onSelect={select}
        hasDraft={false}
        onResumeDraft={resume}
      />
    </>
  );
}

it("shows author, preview, count and live resolved/selected state", () => {
  const { rerender } = render(view());
  const item = screen.getByRole("button", {
    name: /Ada Lovelace Open Increase the title contrast 1 comment/,
  });
  expect(item).toHaveAttribute("data-resolved", "false");
  fireEvent.click(item);
  expect(select).toHaveBeenCalledWith(thread);
  rerender(view([{ ...thread, resolved: true }], thread.id));
  expect(
    screen.getByRole("button", { name: /Ada Lovelace Resolved/ })
  ).toHaveAttribute("data-resolved", "true");
  expect(
    screen.getByRole("button", { name: /Ada Lovelace Resolved/ })
  ).toHaveAttribute("aria-current", "true");
  rerender(
    view([
      {
        ...thread,
        comments: [
          {
            ...thread.comments[0],
            deletedAt: undefined,
            body: {
              version: 1,
              content: [
                { type: "paragraph", children: [{ text: "Updated remotely" }] },
              ],
            },
          },
        ],
      },
    ])
  );
  expect(screen.getByText("Updated remotely")).toBeVisible();
});

it("shows the author avatar and falls back to initials when it cannot load", () => {
  mockAvatar = "/ada.png";
  render(view());
  const item = screen.getByRole("button", { name: /Ada Lovelace Open/ });
  const avatar = item.querySelector(".sidebar-author-avatar")!;
  const image = avatar.querySelector("img")!;
  expect(image).toHaveAttribute("src", "/ada.png");
  expect(image).toHaveAttribute("alt", "");
  fireEvent.error(image);
  expect(avatar.querySelector("img")).toBeNull();
  expect(avatar).toHaveTextContent("AL");
});

it("uses neutral fallback initials when an avatar or author is missing", () => {
  const { rerender } = render(view());
  const item = screen.getByRole("button", { name: /Ada Lovelace Open/ });
  expect(item.querySelector(".sidebar-author-avatar")).toHaveTextContent("AL");
  expect(item.querySelector("img")).toBeNull();
  mockName = undefined;
  rerender(view());
  expect(
    screen
      .getByRole("button", { name: /Guest Open/ })
      .querySelector(".sidebar-author-avatar")
  ).toHaveTextContent("G");
});

it("handles an empty room, deleted comments, and missing author information", () => {
  const { rerender } = render(view([]));
  expect(screen.getByText(/No comments yet/)).toBeVisible();
  mockName = undefined;
  rerender(view([{ ...thread, comments: [] }]));
  expect(
    screen.getByRole("button", {
      name: /Guest Open No comments available 0 comments/,
    })
  ).toBeVisible();
});

it("supports keyboard selection and collapse/expand without navigating", async () => {
  const user = userEvent.setup();
  render(view());
  const item = screen.getByRole("button", {
    name: /Increase the title contrast/,
  });
  item.focus();
  await user.keyboard("{Enter}");
  expect(select).toHaveBeenCalledTimes(1);
  await user.click(
    screen.getByRole("button", { name: "Collapse comments sidebar" })
  );
  expect(
    screen.queryByRole("button", { name: /Increase the title contrast/ })
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Expand comments sidebar" })
  ).toHaveAttribute("aria-expanded", "false");
  await user.click(
    screen.getByRole("button", { name: "Expand comments sidebar" })
  );
  expect(item).toBeVisible();
  expect(select).toHaveBeenCalledTimes(1);
});

it("disables navigation until image geometry is available", () => {
  render(view([thread], null, true));
  expect(
    screen.getByRole("button", { name: /Increase the title contrast/ })
  ).toBeDisabled();
});

it("offers an explicit action for resuming a saved new-comment draft", () => {
  render(
    <>
      <div id="comments-sidebar" />
      <CommentsSidebar
        threads={[]}
        selectedId={null}
        disabled={false}
        onSelect={select}
        hasDraft
        onResumeDraft={resume}
      />
    </>
  );
  fireEvent.click(screen.getByRole("button", { name: "Resume new comment" }));
  expect(resume).toHaveBeenCalledTimes(1);
  expect(select).not.toHaveBeenCalled();
});
