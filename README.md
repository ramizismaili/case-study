## Live Demo

The application is deployed on Vercel and available here:

🔗 [View Image Review App](https://case-study-ruddy-gamma.vercel.app/)

# Image Review

## Project overview

Image Review is a collaborative canvas for discussing specific points on an image. Reviewers create anchored comment threads, move around the image, and manage conversations while Liveblocks synchronizes shared changes.

Built for a Full Stack Developer hiring case study from the official Liveblocks Next.js canvas comments starter. The [original assignment](docs/ASSIGNMENT.md) includes the supplied design references; those images are references, not screenshots of this implementation.

## Features

- Image-anchored threads that retain their positions through pan and zoom.
- Draggable comment pins and adaptive left/right thread placement.
- Replies, editing, deletion, resolution, and thread subscriptions through Liveblocks UI.
- Zoom controls, reset view, and responsive popover sizing.
- Action notifications, connection feedback, image retry, and failed-comment text recovery.
- Live image-relative collaborator cursors and a compact online avatar group.

## Tech stack

| Layer              | Technology                                            |
| ------------------ | ----------------------------------------------------- |
| Application        | Next.js App Router, React, TypeScript                 |
| Collaboration      | Liveblocks Comments and React UI                      |
| Pin dragging       | dnd-kit                                               |
| Layout and styling | CSS, DOM measurements, ResizeObserver                 |
| Automated tests    | Jest via next/jest, React Testing Library, user-event |

## Getting started

Use Node.js 24 and npm (the implementation was verified with Node 24). Install the locked dependencies:

```sh
npm ci
```

Create `.env.local` in the project root with your Liveblocks project's **secret** key:

```dotenv
LIVEBLOCKS_SECRET_KEY=your_liveblocks_secret_key
```

Keep this file private; it is ignored by Git. The key is read only by the server. Restart the development server after changing it.

```sh
npm run dev
```

Open http://localhost:3000. Without a key, the image and navigation still work and the canvas explains how to enable shared comments.

For a production build locally:

```sh
npm run build
npm start
```

## Usage

- Click an image point to start a comment. Keyboard activation of the image button places the draft at the image center. Escape closes the draft or open thread.
- Drag the image or canvas background to pan. Small pointer movements are treated as clicks; a completed pan does not create a comment.
- Zoom from 25% to 400% of the fitted view. Reset restores the centered, fitted image.
- Click a pin to open its thread; drag a pin to change its image anchor.
- Use the thread controls to reply, edit, delete, resolve, or subscribe. Action notifications appear at the top right. Changes appear immediately; a saving hint remains until Liveblocks synchronization settles.
- The header light indicates connection state. Connection failures offer reconnect; image failures offer retry. Failed comment text remains available to copy, but attachments must be reattached.

To check collaboration, open the same URL in two tabs and add or move a comment. For a separate test room, use the same `?exampleId=your-test-name` query in both tabs. Reload to check persistence. Pan and zoom are independent in each tab.

Move the pointer over the image or its comment pins to share its position. Other reviewers see a named, colored cursor at the corresponding image point in their own view. Moving outside the image or onto popovers or navigation controls, leaving the canvas, or hiding the tab clears the shared cursor. The header shows online connections, including your own once; separate tabs may use the same demo identity and remain separate collaborators.

## Architecture and technical decisions

`ImageCanvas` owns image loading, viewport measurement, and local view state. `Room` owns the Liveblocks room and loading/error boundaries. `CommentsCanvas` connects persisted threads to canvas interactions; `ThreadComposer` and `DraggableThread` retain Liveblocks' editor, thread UI, and mutation APIs.

### Stable image anchors

**Challenge:** Keep comments attached to the same image point through zoom, pan, and viewport changes.

**Solution:** Store normalized image coordinates and derive CSS-pixel positions from the current view transform.

**Rationale:** Shared anchors stay independent of each reviewer's screen size and navigation state.

New threads store `{ x, y, coordinateSpace: "image", zIndex }` in Liveblocks metadata. `x` and `y` are fractions of the natural image dimensions: `(0, 0)` is the top-left and `(1, 1)` the bottom-right. The image is initially fitted without cropping or upscaling. User zoom multiplies that fitted scale; pan is measured in CSS pixels.

For the horizontal axis (and equivalently for the vertical axis):

```text
viewportX = imageOriginX + anchorX * naturalImageWidth * scale
anchorX = (viewportX - imageOriginX) / (naturalImageWidth * scale)
```

Browser pointer coordinates first subtract the canvas element's current bounding rectangle. Image coordinates are not clamped during click detection, so clicks outside the image can be rejected. Pin drags convert their CSS-pixel displacement back to image fractions. Legacy starter threads without a coordinate-space marker retain their original viewport-pixel positions until moved.

Pure helpers in `src/lib` implement conversion, image boundaries, pan calculations, zoom limits, and placement. `useCanvasView` handles pointer capture, cancellation, and click suppression. Zoom preserves the image point under the viewport center. `ImageCanvasContext` shares the current transform without persisting view state to Liveblocks.

### Adaptive thread placement

**Challenge:** Keep threads readable near image edges and in small viewports.

**Solution:** Measure the popover and choose its side and offsets from the available space. **Rationale:** Actual content dimensions account for long threads and text wrapping without moving the persisted anchor.

`useThreadPlacement` measures the actual popover with `ResizeObserver`. Placement prefers opening inward near the image's right edge, then prioritizes available canvas space. It clamps the popover within the visible canvas, limits its dimensions, and allows scrolling or pin overlap on small screens. Offscreen anchors hide the popover without discarding its mounted draft.

### Collaboration and recovery

Liveblocks owns persisted comments and optimistic mutations; React owns local navigation, drafts, and feedback. This retains the SDK editor and synchronization behavior while keeping canvas geometry independently testable.

`CollaborationStatus` scopes SDK errors to the active room, preserves failed text, and provides action notifications through React context. Portals place notifications above the canvas and the connection indicator in the header. Success notices dismiss automatically after saving, pause while hovered or focused, and can be dismissed manually. Error notices persist. Author identity uses the non-suspending hook so opening the first draft does not replace existing comments with a loading screen.

`MultiplayerCursors` uses ephemeral Liveblocks Presence (`cursor: { x, y } | null`), with the same normalized image coordinates as comment anchors. `useCursorPresence` coalesces pointer movement to at most 20 updates per second, skips identical positions, and clears pending work on leave, cancellation, blur, disconnect, and unmount. Local view changes alone do not publish presence. Each remote cursor subscribes to its own connection; the avatar group selects identity fields only. Missing names use “Guest”, missing or failed avatars use initials, and the header caps the visible group at three avatars plus an overflow count. Cursor overlays ignore pointer events and hide image points outside the local viewport.

## Testing and verification

```sh
npm test -- --runInBand
npm run typecheck
npm run build
```

`npm test` runs Jest through `next/jest`; component tests use React Testing Library and user-event. `npm run test:watch` is available during development.

| Area         | Test files                                      | Behaviors covered                                                                                                 |
| ------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Coordinates  | `coordinates.test.ts`, `thread-anchors.test.ts` | Conversion, zoom accuracy, client offsets, boundaries, legacy anchors, pin movement                               |
| Navigation   | `canvas-view.test.ts`                           | Pan offsets, drag threshold, zoom limits, center preservation                                                     |
| Placement    | `thread-placement.test.ts`                      | Side selection, overflow, growing content, small viewports                                                        |
| Image canvas | `ImageCanvas.test.tsx`                          | Controls, reset, cancellation, loading/retry, cached images, resize                                               |
| Comments     | `CommentsCanvas.test.tsx`                       | Creation, metadata, drag/click separation, offline/empty guards, placement, notifications, first-draft regression |
| Recovery     | `Room.test.tsx`, `comment-body.test.ts`         | Connection errors, notification timing, failed text, rich-text validation                                         |
| Presence     | `CollaborationPresence.test.tsx`               | Remote-only cursors, pan/zoom/resize mapping, throttling and cleanup, malformed presence, avatar counts and fallbacks |

Tests mock Liveblocks network hooks and editor/popover components where needed; application coordinate logic and dnd-kit interactions remain real. DOM measurements and pointer capture are controlled for deterministic jsdom tests. These tests do not replace a real-browser collaboration check or prove behavior against a failing live service. Browser checks during implementation covered loaded/cached images, zoom/reset, opening threads and drafts, and the notification/header UI; two-client persistence and synchronization were checked during the anchored-comments milestone.

Manual checks for multiplayer presence: use two tabs in the same configured room, choose different viewport sizes and zoom/pan settings, and verify that a remote cursor tracks the same image detail. Check pointer leave, tab switching, reconnect, and closing one tab; confirm the avatar count follows connections. At narrow widths, check the avatar overflow and header layout. With cursors visible, create a comment, drag a pin, and open an edge thread to verify that overlays do not intercept interactions. These real-service checks remain separate from the mocked Jest coverage.

## Known limitations

- Authentication uses a client-selected demo identity stored in sessionStorage, retained across authentication requests and reloads in that tab. It retains the starter's broad demo-room write permission. This is not production authentication: users can select another demo identity, and a real deployment needs authenticated identities and explicit room authorization. Clearing session storage creates a new selection; different tabs may select the same demo person.
- The app reviews one bundled image (`public/review-board.svg`); uploading or switching images is outside this assignment.
- Panning has no bounds, and wheel/pinch zoom is not implemented. Reset recovers the fitted view.
- Notification saving state uses the client's aggregate synchronization status, so another outstanding mutation can keep the saving hint visible.
- Async failure recovery preserves plain text rather than rich formatting or uploaded attachments. Offline commenting is disabled while image navigation remains usable.
- Next.js currently emits a React 18 deprecation warning during the successful build. A React major-version migration was kept outside this assignment's implementation scope.

## AI usage

OpenAI Codex assisted with starter inspection, incremental implementation, Jest/React Testing Library tests, debugging, code review, and documentation. Implementation milestones were reviewed and committed manually by the developer; Codex did not stage files or create commits.

Specific mistakes and corrections:

- **Cached image loading:** The initial implementation relied on `onLoad`. An image loaded before hydration could leave the canvas hidden. Browser inspection exposed this; the fix checks `complete` and natural dimensions on mount, with a regression test.
- **First-draft loading:** A Suspense identity hook could replace existing comments with the loader when opening the first draft. A failing regression test reproduced it; the optional identity lookup now uses the non-suspending hook.
- **Notification wording:** After developer feedback, “Adding comment…” became “Comment added” to match the optimistic UI, with a separate saving hint until synchronization completes.

- **Author identity mismatch:** The draft avatar could change to another person after submitting. The starter auth endpoint selected a random user on every request, and this was initially left unchanged. The fix selects one demo identity per tab, reuses it for every authentication request, and validates it against the demo user list on the server. Regression tests cover identity reuse and invalid identities.
