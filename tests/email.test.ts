import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { email } from "../lib/email";
import { escapeHtml, paragraph, renderEmail } from "../lib/email/layout";
import { SAMPLES } from "../lib/email/samples";

// No network: fetch is replaced in every test that sends.

describe("email layout", () => {
  it("escapes everything passed in", () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
    const block = paragraph(["Hi ", { strong: "<b>Ann</b>" }, { href: "https://x.test/?a=1&b=2", label: "go" }]);
    expect(block.html).toContain("&lt;b&gt;Ann&lt;/b&gt;");
    expect(block.html).toContain('href="https://x.test/?a=1&amp;b=2"');
    expect(block.text).toBe("Hi <b>Ann</b>go (https://x.test/?a=1&b=2)");
  });

  it("wraps every template in the shared header and footer, with a text version", () => {
    const rendered = email.render("invite", SAMPLES.invite, "ann@example.com");
    expect(rendered.subject).toBe("You're invited to Poxeet");
    expect(rendered.html.match(/poxeet<span/g)).toHaveLength(2);
    expect(rendered.html).toContain("Poxeet sent this email to ann@example.com.");
    expect(rendered.html).toContain("/signup?code=CODE01");
    expect(rendered.text).toContain("Your access code: CODE01");
    expect(rendered.text).not.toContain("<");
  });

  it("keeps Supabase placeholders intact", () => {
    const rendered = renderEmail({ subject: "s", preheader: "p", body: [paragraph("{{ .Token }}")] }, "{{ .Email }}");
    expect(rendered.html).toContain("{{ .Token }}");
    expect(rendered.html).toContain("{{ .Email }}");
  });
});

describe("email sending", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("ZOHO_API_KEY", "Zoho-enczapikey test-key");
    vi.stubEnv("EMAIL_FROM", "poxeet@klosapoint.com");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const ok = () => new Response(JSON.stringify({ request_id: "req-1", data: [{ code: "EM_104" }] }), { status: 201 });

  it("posts one email in Zoho's shape", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    const result = await email.sendSingle({ to: { email: "ann@example.com", name: "Ann" }, template: "invite", data: SAMPLES.invite });
    expect(result).toEqual({ ok: true, id: "req-1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://cpaas.zoho.com/v1.1/email");
    expect(init.headers.Authorization).toBe("Zoho-enczapikey test-key");
    const body = JSON.parse(init.body);
    expect(body.from).toEqual({ address: "poxeet@klosapoint.com", name: "Poxeet" });
    expect(body.to).toEqual([{ email_address: { address: "ann@example.com", name: "Ann" } }]);
    expect(body.subject).toBe("You're invited to Poxeet");
    expect(body.htmlbody).toContain("CODE01");
    expect(body.textbody).toContain("CODE01");
  });

  it("retries once when Zoho is busy, and reports a hard failure without throwing", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValueOnce(ok());
    expect((await email.sendSingle({ to: "a@example.com", subject: "s", html: "<p>h</p>" })).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "TM_3201", message: "Invalid sender" } }), { status: 400 }));
    const failed = await email.sendSingle({ to: "a@example.com", subject: "s", html: "<p>h</p>" });
    expect(failed).toMatchObject({ ok: false, status: 400, retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends bulk emails one per recipient and counts failures", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const to = JSON.parse(init.body).to[0].email_address.address as string;
      return to.startsWith("bad") ? new Response("{}", { status: 422 }) : ok();
    });
    const result = await email.sendBulk({
      template: "emptyNextWeek",
      recipients: ["a@example.com", "bad@example.com", "c@example.com"].map((to) => ({ to, data: SAMPLES.emptyNextWeek })),
    });
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results.map((item) => item.to)).toEqual(["a@example.com", "bad@example.com", "c@example.com"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("logs instead of sending when no key is set", async () => {
    vi.stubEnv("ZOHO_API_KEY", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await email.sendSingle({ to: "a@example.com", subject: "s", html: "<p>h</p>", text: "h" })).toEqual({ ok: true, id: null, logged: true });
    expect(fetchMock).not.toHaveBeenCalled();
    info.mockRestore();
  });
});

describe("LinkedIn account notices", () => {
  it("names the profile, escapes it, and says connected or reconnected", () => {
    const connected = email.render("linkedinConnected", { firstName: "Ann", linkedinName: "Ann <Lee>", expiresAt: "2026-12-14T10:00:00Z" }, "ann@example.com");
    expect(connected.subject).toBe("LinkedIn connected to Poxeet");
    expect(connected.html).toContain("Ann &lt;Lee&gt;");
    expect(connected.html).not.toContain("Ann <Lee>");
    expect(connected.text).toContain("14 December 2026");

    const again = email.render("linkedinConnected", { linkedinName: null, expiresAt: "2026-12-14T10:00:00Z", reconnected: true }, "ann@example.com");
    expect(again.subject).toBe("LinkedIn reconnected to Poxeet");
    expect(again.text).toContain("to your profile");

    const gone = email.render("linkedinDisconnected", { firstName: "Ann", linkedinName: "Ann Lee" }, "ann@example.com");
    expect(gone.subject).toBe("LinkedIn disconnected from Poxeet");
    expect(gone.text).toContain("Nothing will be posted until you connect again.");
  });
});
