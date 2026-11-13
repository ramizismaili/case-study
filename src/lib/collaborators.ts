import { isWithinImage, type ImagePoint } from "./coordinates";

/** Old clients may omit presence; never position a cursor from untrusted data. */
export function isImageCursor(cursor: unknown): cursor is ImagePoint {
  if (!cursor || typeof cursor !== "object") return false;
  const point = cursor as Partial<ImagePoint>;
  return (
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    isWithinImage(point as ImagePoint)
  );
}

const COLORS = [
  "#7352b6",
  "#b64d38",
  "#247c62",
  "#2e70b5",
  "#a33d7d",
  "#926516",
];

// Connection IDs distinguish tabs even when the demo selects the same identity.
export function collaboratorColor(connectionId: number): string {
  return COLORS[Math.abs(connectionId) % COLORS.length];
}

export function collaboratorName(name: unknown): string {
  return typeof name === "string" && name.trim() ? name.trim() : "Guest";
}

export function collaboratorInitials(name: string): string {
  const words = name.split(/\s+/);
  return (
    words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")
  ).toUpperCase();
}
