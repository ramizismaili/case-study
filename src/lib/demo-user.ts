import { NAMES } from "../database";

const STORAGE_KEY = "image-review-demo-user";

export function isDemoUserId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    NAMES.some((_, index) => value === `user-${index}`)
  );
}

/** Demo identity only: sessionStorage keeps each tab stable across auth calls. */
export function getDemoUserId(
  storage: Pick<Storage, "getItem" | "setItem">
): string {
  const existing = storage.getItem(STORAGE_KEY);
  if (isDemoUserId(existing)) return existing;
  const id = `user-${Math.floor(Math.random() * NAMES.length)}`;
  storage.setItem(STORAGE_KEY, id);
  return id;
}
