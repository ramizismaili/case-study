import { Liveblocks } from "@liveblocks/node";
import { NAMES } from "../../../database";
import { isDemoUserId } from "../../../lib/demo-user";
import { NextResponse } from "next/server";

/**
 * Authenticating your Liveblocks application
 * https://liveblocks.io/docs/api-reference/authentication
 */

export async function POST(request: Request) {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) {
    return new NextResponse("Missing LIVEBLOCKS_SECRET_KEY", { status: 403 });
  }

  // Initialize only after checking configuration, so builds work without a key.
  const liveblocks = new Liveblocks({ secret });

  // Client-selected demo identity; this is not production authentication.
  const input = await request.json().catch(() => null);
  if (!isDemoUserId(input?.userId)) {
    return new NextResponse("Invalid demo identity", { status: 400 });
  }
  const userIndex = Number(input.userId.slice(5));

  // Create a session for the current user (access token auth)
  const session = liveblocks.prepareSession(`user-${userIndex}`, {
    userInfo: {
      name: NAMES[userIndex],
      avatar: `https://liveblocks.io/avatars/avatar-${userIndex}.png`,
    },
  });

  // Use a naming pattern to allow access to rooms with a wildcard
  session.allow(`liveblocks:examples:*`, ["*:write"]);

  // Authorize the user and return the result
  const { status, body } = await session.authorize();
  return new NextResponse(body, { status });
}
