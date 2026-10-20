import { ADMIN_TOKEN_KEY, clearStoredToken, getApiErrorMessage, getStoredToken, setStoredToken, trackLinkClick } from "./api";

afterEach(() => jest.restoreAllMocks());

test("falls back to keepalive fetch when beacon queue rejects statistics", () => {
  navigator.sendBeacon = jest.fn(() => false);
  global.fetch = jest.fn(() => new Promise(() => {}));
  expect(trackLinkClick("a/b")).toBeUndefined();
  expect(fetch).toHaveBeenCalledWith("/api/links/a%2Fb/click", { method: "POST", keepalive: true });
});

test("statistics failures never throw into the link navigation handler", () => {
  navigator.sendBeacon = jest.fn(() => { throw new Error("Rejected"); });
  global.fetch = jest.fn(() => { throw new Error("Offline"); });
  expect(() => trackLinkClick("x")).not.toThrow();
});

test("translates network errors and extracts useful server validation messages", () => {
  expect(getApiErrorMessage({ isAxiosError: true })).toMatch(/Server není dostupný/);
  expect(getApiErrorMessage({ response: { data: { detail: [{ msg: "Vyplň název" }] } } })).toBe("Vyplň název");
});

test("another tab removing a token does not resurrect it from memory", () => {
  setStoredToken("test-token");
  expect(getStoredToken()).toBe("test-token");
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  expect(getStoredToken()).toBe("");
  clearStoredToken();
});
