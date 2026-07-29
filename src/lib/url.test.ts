import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("adds https to a bare host, which is what people actually type", () => {
    // The reported bug: no scheme means a RELATIVE link, so it 404s on our own domain.
    expect(normalizeUrl("www.example.com")).toBe("https://www.example.com");
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("example.com/pricing?ref=1")).toBe("https://example.com/pricing?ref=1");
  });

  it("leaves an explicit scheme alone", () => {
    expect(normalizeUrl("https://www.example.com")).toBe("https://www.example.com");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeUrl("mailto:someone@example.com")).toBe("mailto:someone@example.com");
    expect(normalizeUrl("tel:+15551234567")).toBe("tel:+15551234567");
  });

  it("keeps app schemes, because those are real places things live", () => {
    expect(normalizeUrl("obsidian://open?vault=notes")).toBe("obsidian://open?vault=notes");
    expect(normalizeUrl("notion://page/abc")).toBe("notion://page/abc");
    expect(normalizeUrl("message://<id@mail>")).toBe("message://<id@mail>");
  });

  it("makes a scheme-relative link explicit", () => {
    expect(normalizeUrl("//example.com/x")).toBe("https://example.com/x");
  });

  it("trims, and treats blank as no link", () => {
    expect(normalizeUrl("  example.com  ")).toBe("https://example.com");
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
  });

  it("refuses schemes that would execute in the page", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("JavaScript:alert(1)")).toBeNull();
    expect(normalizeUrl("  javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(normalizeUrl("vbscript:msgbox(1)")).toBeNull();
  });
});
