import { getDemoUserId, isDemoUserId } from "./demo-user";

describe("demo identity", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  it("keeps the same author across separate authentication requests and reload reads", () => {
    const random = jest
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.1)
      .mockReturnValue(0.9);
    const first = getDemoUserId(sessionStorage);

    const subsequent = getDemoUserId(sessionStorage);

    expect(subsequent).toBe(first);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it("replaces a corrupt stored identity with a valid demo user", () => {
    getDemoUserId(sessionStorage);
    sessionStorage.setItem(sessionStorage.key(0)!, "user-999");

    expect(isDemoUserId(getDemoUserId(sessionStorage))).toBe(true);
  });

  it.each([
    null,
    undefined,
    1,
    "user-8",
    "user--1",
    "user-01",
    "admin",
    "user-1x",
  ])("rejects invalid identity %j", (id) => {
    expect(isDemoUserId(id)).toBe(false);
  });

  it.each(["user-0", "user-7"])("accepts known identity %s", (id) => {
    expect(isDemoUserId(id)).toBe(true);
  });
});
