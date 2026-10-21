import { describe, expect, it } from "vitest";
import { parseCsv } from "../lib/import/csv";
import { checkPost, cleanText, parsePasted, parseSharesCsv, textHash, wordCount } from "../lib/import/posts";

const LONG = "Most people never post because the blank box wins. I stopped writing posts and started writing notes to one person, and it changed everything.";
const LONG_2 = "Scope is the product decision nobody puts on the roadmap, yet it shapes every single release we ship to customers each quarter.";

// Shaped like LinkedIn's export: BOM, CRLF, quoted multi-line text with commas and doubled quotes.
const SHARES = "﻿Date,ShareLink,ShareCommentary,SharedUrl,MediaUrl,Visibility\r\n"
  + `2024-03-15 10:23:45,https://www.linkedin.com/feed/update/urn:li:share:1,"${LONG}\r\n\r\nSecond paragraph, with a ""quote"".",,,MEMBER_NETWORK\r\n`
  + "2024-05-01 08:00:00,https://www.linkedin.com/feed/update/urn:li:share:2,,https://example.com/someone-elses-post,,MEMBER_NETWORK\r\n"
  + "2024-06-01 08:00:00,https://www.linkedin.com/feed/update/urn:li:share:3,https://example.com/just-a-link,,,MEMBER_NETWORK\r\n"
  + "2024-07-01 08:00:00,https://www.linkedin.com/feed/update/urn:li:share:4,Short thought.,,,MEMBER_NETWORK\r\n"
  + `2024-08-01 08:00:00,https://www.linkedin.com/feed/update/urn:li:share:5,"${LONG_2}",,,MEMBER_NETWORK\r\n`
  + `2024-09-01 08:00:00,https://www.linkedin.com/feed/update/urn:li:share:6,"${LONG_2.toUpperCase()}",,,MEMBER_NETWORK\r\n`;

describe("parseCsv", () => {
  it("handles quotes, commas and line breaks inside fields", () => {
    expect(parseCsv('a,b\r\n"x, y","line 1\nline ""2"""\n')).toEqual([["a", "b"], ["x, y", 'line 1\nline "2"']]);
  });
});

describe("parseSharesCsv", () => {
  it("finds every post and says why some are left out", () => {
    const result = parseSharesCsv(SHARES);
    if (!result.ok) throw new Error(result.reason);
    expect(result.source).toBe("linkedin_export");
    expect(result.candidates).toHaveLength(6);
    // Newest first.
    expect(result.candidates.map((post) => post.postedAt?.slice(0, 10))).toEqual(["2024-09-01", "2024-08-01", "2024-07-01", "2024-06-01", "2024-05-01", "2024-03-15"]);
    const byLink = Object.fromEntries(result.candidates.map((post) => [post.url!.slice(-1), post]));
    expect(byLink["1"].leftOut).toBeNull();
    expect(byLink["1"].text).toBe(`${LONG}\n\nSecond paragraph, with a "quote".`);
    expect(byLink["1"].postedAt).toBe("2024-03-15T10:23:45.000Z");
    expect(byLink["2"].leftOut).toBe("repost");
    expect(byLink["3"].leftOut).toBe("link_only");
    expect(byLink["4"].leftOut).toBe("short");
    // The upper-case copy is the same post; the newer one is kept, the older one is the duplicate.
    expect(byLink["6"].leftOut).toBeNull();
    expect(byLink["5"].leftOut).toBe("duplicate");
  });

  it("explains a file without a post text column", () => {
    expect(parseSharesCsv("Name,Email\nAnn,a@example.com\n")).toEqual({ ok: false, reason: "no_text_column", headers: ["Name", "Email"] });
    expect(parseSharesCsv("")).toEqual({ ok: false, reason: "empty" });
  });
});

describe("parsePasted", () => {
  it("splits on lines of dashes", () => {
    const result = parsePasted(`${LONG}\n\n---\n\n${LONG_2}\n----\nToo short.`);
    if (!result.ok) throw new Error(result.reason);
    expect(result.candidates.map((post) => post.leftOut)).toEqual([null, null, "short"]);
    expect(result.candidates[1].text).toBe(LONG_2);
  });
});

describe("checkPost", () => {
  it("applies the import rules to one post added by hand", () => {
    expect(checkPost(LONG, [])).toBeNull();
    expect(checkPost(`  ${LONG}\r\n`, [LONG_2])).toBeNull();
    expect(checkPost("Too short to learn from.", [])).toBe("short");
    expect(checkPost("https://example.com/a https://example.com/b", [])).toBe("link_only");
    expect(checkPost("word ".repeat(700), [])).toBe("too_long");
    expect(checkPost("", [])).toBe("repost");
  });

  it("finds the same post already in the list, whatever the case or spacing", () => {
    expect(checkPost(LONG.toUpperCase().replace(/ /g, "  "), [LONG_2, LONG])).toBe("duplicate");
  });

  it("counts words", () => {
    expect(wordCount("one  two\nthree ")).toBe(3);
  });
});

describe("cleanText and textHash", () => {
  it("strips control characters and extra blank lines", () => {
    expect(cleanText("Hello\u0007 \r\n\r\n\r\n\r\nWorld  ")).toBe("Hello\n\nWorld");
  });

  it("gives the same hash regardless of case and spacing", async () => {
    expect(await textHash("Hello   World\n")).toBe(await textHash("hello world"));
    expect(await textHash("Hello World")).not.toBe(await textHash("Hello, World"));
    expect(await textHash("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});
