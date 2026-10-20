import { applyLocalOrder, LOCAL_CUSTOM_ORDER_KEY, readLocalOrder, sortLinks } from "./launchpad";

const links = [
  { id: "a", title: "Auto", custom_order: 0, clicks: 1, is_favorite: false },
  { id: "b", title: "Brzdy", custom_order: 1, clicks: 4, is_favorite: true },
  { id: "c", title: "Čerpadla", custom_order: 2, clicks: 2, is_favorite: false },
];

afterEach(() => localStorage.clear());

test("ignores malformed local orders and removes invalid or duplicate IDs", () => {
  for (const value of ["null", "{}", '"a"', "invalid"]) {
    localStorage.setItem(LOCAL_CUSTOM_ORDER_KEY, value);
    expect(readLocalOrder()).toEqual([]);
  }
  localStorage.setItem(LOCAL_CUSTOM_ORDER_KEY, JSON.stringify(["b", null, "b", 1, "a"]));
  expect(readLocalOrder()).toEqual(["b", "a"]);
});

test("personal order ignores removed and duplicate IDs and preserves newly added links", () => {
  expect(applyLocalOrder(links, ["b", "missing", "b", "a"]).map((link) => link.id)).toEqual(["b", "a", "c"]);
  expect(links.map((link) => link.id)).toEqual(["a", "b", "c"]);
});

test("favorites precede normal links except in explicit custom order", () => {
  expect(sortLinks(links, "alphabetical").map((link) => link.id)).toEqual(["b", "a", "c"]);
  expect(sortLinks(links, "custom").map((link) => link.id)).toEqual(["a", "b", "c"]);
  expect(sortLinks(links, "clicks").map((link) => link.id)).toEqual(["b", "c", "a"]);
});
