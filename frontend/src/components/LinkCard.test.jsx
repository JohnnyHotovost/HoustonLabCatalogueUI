import { renderToStaticMarkup } from "react-dom/server";
import { LinkCard } from "./LinkCard";
import { isSafeLogoSource } from "./SafeLogoImage";

const link = { id: "test", title: "Katalog", url: "https://example.org" };

test("cards use native anchors so browser navigation does not wait for telemetry", () => {
  const html = renderToStaticMarkup(<LinkCard link={link} openInNewTab onClick={() => new Promise(() => {})} />);
  expect(html).toContain('href="https://example.org"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).not.toContain("<button");
});

test("logo images reject active or unsupported data sources", () => {
  expect(isSafeLogoSource("javascript:alert(1)")).toBe(false);
  expect(isSafeLogoSource("data:image/svg+xml;base64,AAA")).toBe(false);
  expect(isSafeLogoSource("data:text/html;base64,AAA")).toBe(false);
  expect(isSafeLogoSource("https://example.org/logo.png")).toBe(true);
  expect(isSafeLogoSource("data:image/png;base64,AAA")).toBe(true);
});
