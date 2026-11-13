/** @jest-environment node */
import { POST } from "./route";

const mockPrepareSession = jest.fn(() => ({
  allow: jest.fn(),
  authorize: jest.fn(async () => ({
    status: 200,
    body: '{"token":"test-token"}',
  })),
}));
jest.mock("@liveblocks/node", () => ({
  Liveblocks: jest.fn(() => ({ prepareSession: mockPrepareSession })),
}));

const originalSecret = process.env.LIVEBLOCKS_SECRET_KEY;
beforeEach(() => {
  process.env.LIVEBLOCKS_SECRET_KEY = "test-only-placeholder";
});
afterEach(() => {
  if (originalSecret === undefined) delete process.env.LIVEBLOCKS_SECRET_KEY;
  else process.env.LIVEBLOCKS_SECRET_KEY = originalSecret;
});

function request(body: string) {
  return new Request("http://localhost/api/liveblocks-auth", {
    method: "POST",
    body,
  });
}

describe("demo authentication route", () => {
  it("authenticates presence and comments as the same selected author", async () => {
    const body = JSON.stringify({ userId: "user-3" });

    const presence = await POST(request(body));
    const comments = await POST(request(body));

    expect(presence.status).toBe(200);
    expect(comments.status).toBe(200);
    expect(mockPrepareSession).toHaveBeenCalledTimes(2);
    for (const [id, options] of mockPrepareSession.mock.calls as unknown as [
      string,
      { userInfo: { avatar: string } },
    ][]) {
      expect(id).toBe("user-3");
      expect(options.userInfo.avatar).toContain("avatar-3.png");
    }
  });

  it.each(["{}", '{"userId":"user-999"}', "invalid json"])(
    "rejects invalid input %s",
    async (body) => {
      const response = await POST(request(body));

      expect(response.status).toBe(400);
      expect(mockPrepareSession).not.toHaveBeenCalled();
    }
  );

  it("rejects requests when the server key is missing", async () => {
    delete process.env.LIVEBLOCKS_SECRET_KEY;

    const response = await POST(request('{"userId":"user-0"}'));

    expect(response.status).toBe(403);
    expect(mockPrepareSession).not.toHaveBeenCalled();
  });
});
