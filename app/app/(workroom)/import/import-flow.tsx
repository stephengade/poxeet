"use client";

import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Button, Icon } from "../../../../components/ui";
import {
  CAN_INCLUDE, LEFT_OUT_LABEL, MAX_FILE_BYTES, MAX_POSTS, MIN_VOICE_POSTS, parseSharesCsv, textHash,
  type Candidate, type LeftOut, type ParseResult, type Source,
} from "../../../../lib/import/posts";
import { startVoiceAnalysis, type StartResult } from "../voice/actions";
import { findImported, importPosts } from "./actions";
import { AnalysisNext } from "./analysis-next";

type Found = { source: Source; label: string; candidates: Candidate[]; already: Set<string> };
type Done = { added: number; alreadyThere: number; total: number; analysis: StartResult | null };

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function dateRange(candidates: Candidate[]) {
  const dates = candidates.map((post) => post.postedAt).filter((date): date is string => Boolean(date)).sort();
  if (!dates.length) return null;
  const first = MONTH.format(new Date(dates[0]));
  const last = MONTH.format(new Date(dates[dates.length - 1]));
  return first === last ? first : `${first} to ${last}`;
}

const safeUrl = (url: string | null) => {
  if (!url) return null;
  try { return new URL(url).protocol.startsWith("http") ? url : null; } catch { return null; }
};

const PARSE_ERROR: Record<Exclude<ParseResult, { ok: true }>["reason"], string> = {
  empty: "That file has no posts in it.",
  not_csv: "That doesn't look like a CSV file. Choose Shares.csv from your LinkedIn export.",
  no_text_column: "That file has no post text column. Choose Shares.csv from the export, or add your posts one at a time above.",
};

/** The optional second way in: LinkedIn's data export. Choose Shares.csv, check what was found, import. */
export function ExportImport() {
  const [found, setFound] = useState<Found | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function review(result: ParseResult, label: string) {
    if (!result.ok) {
      toast.error(PARSE_ERROR[result.reason], result.headers ? { description: `Columns found: ${result.headers.slice(0, 6).join(", ")}` } : undefined);
      return;
    }
    // Mark posts already imported: compare text hashes with the server.
    const hashes = await Promise.all(result.candidates.map((post) => textHash(post.text)));
    let already = new Set<string>();
    try {
      const existing = new Set(await findImported(hashes.filter((_, index) => result.candidates[index].text)));
      already = new Set(result.candidates.filter((_, index) => existing.has(hashes[index])).map((post) => post.key));
    } catch { /* the preview still works; the server skips repeats on import anyway */ }
    setFound({ source: result.source, label, candidates: result.candidates, already });
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return void toast.error("That file is over 10 MB.", { description: "Shares.csv is usually much smaller. Check you picked the right file." });
    if (/\.zip$/i.test(file.name)) return void toast.error("Unzip the export first.", { description: "Then choose Shares.csv from inside the folder." });
    setReading(true);
    try { await review(parseSharesCsv(await file.text()), file.name); }
    catch { toast.error("We couldn't read that file."); }
    finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void readFile(event.dataTransfer.files[0]);
  }

  if (done) {
    return (
      <section className="wr-card wr-stack" aria-labelledby="done-h">
        <div className="wr-callout" data-tone="success">
          <span className="wr-callout-icon"><Icon name="check" size={18} strokeWidth={2.4} /></span>
          <span><strong id="done-h">{done.added === 1 ? "1 post imported" : `${done.added} posts imported`}</strong>
            <span>{done.alreadyThere ? `${done.alreadyThere} you'd already added ${done.alreadyThere === 1 ? "was" : "were"} skipped. ` : ""}Poxeet now has {done.total} posts to learn from.</span></span>
        </div>
        <AnalysisNext analysis={done.analysis} onMore={() => { setDone(null); setFound(null); }} moreLabel="Import another file" />
      </section>
    );
  }

  if (found) return <Check found={found} onBack={() => setFound(null)} onDone={setDone} />;

  return (
    <section className="wr-card wr-stack" aria-labelledby="export-h">
      <div>
        <h2 id="export-h" className="wr-h2">Have lots of posts? Import your LinkedIn export</h2>
        <p className="wr-sub wr-small">Optional. Brings in every post at once instead of one at a time. You don&apos;t need it to finish setup.</p>
      </div>
      <ol className="wr-voice-how">
        <li><span className="wr-mono">1</span><span>On LinkedIn: <strong>Me → Settings &amp; Privacy → Data privacy → Get a copy of your data</strong>.</span></li>
        <li><span className="wr-mono">2</span><span>Pick <strong>Want something in particular?</strong>, tick only your posts, then request the archive.</span></li>
        <li><span className="wr-mono">3</span><span>LinkedIn emails a download link. The posts-only archive usually arrives within minutes but can take up to a day. Unzip it and choose <strong>Shares.csv</strong> below.</span></li>
      </ol>
      <div
        className="wr-dropzone" data-dragging={dragging || undefined}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="wr-dropzone-icon"><Icon name="upload" size={22} /></span>
        <strong>Drop Shares.csv here</strong>
        <span>or choose it from the unzipped export.</span>
        <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={(event) => void readFile(event.target.files?.[0])} />
        <Button variant="secondary" loading={reading} onClick={() => fileInput.current?.click()}>Choose file</Button>
        <span className="wr-small">You check what was found before anything is saved. The file never leaves your browser until you import.</span>
      </div>
    </section>
  );
}

function Check({ found, onBack, onDone }: { found: Found; onBack: () => void; onDone: (done: Done) => void }) {
  const usable = (post: Candidate) => !found.already.has(post.key) && (post.leftOut === null || CAN_INCLUDE[post.leftOut]);
  // Ticked by default: posts that are new and not left out, newest first, up to the cap.
  const [picked, setPicked] = useState(() => new Set(found.candidates.filter((post) => usable(post) && post.leftOut === null).slice(0, MAX_POSTS).map((post) => post.key)));
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const leftOut = found.candidates.filter((post) => post.leftOut !== null || found.already.has(post.key));
  const reasons = new Map<string, number>();
  for (const post of leftOut) {
    const label = found.already.has(post.key) ? "Already imported" : LEFT_OUT_LABEL[post.leftOut as LeftOut];
    reasons.set(label, (reasons.get(label) ?? 0) + 1);
  }
  const visible = showAll ? found.candidates : found.candidates.filter((post) => picked.has(post.key) || (post.leftOut === null && !found.already.has(post.key)));
  const range = dateRange(found.candidates);

  function toggle(key: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else if (next.size >= MAX_POSTS) toast.info(`Import up to ${MAX_POSTS} posts at a time.`);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    const posts = found.candidates.filter((post) => picked.has(post.key)).map((post) => ({ text: post.text, postedAt: post.postedAt, url: safeUrl(post.url) }));
    setSaving(true);
    try {
      const result = await importPosts({ source: found.source, posts });
      if (!result.ok) return void toast.error(result.message);
      // New posts with enough in total: analyse the voice again with them.
      const analysis = result.added > 0 && result.total >= MIN_VOICE_POSTS
        ? await startVoiceAnalysis().catch((): StartResult => ({ ok: false, reason: "error", message: "We couldn't start the analysis." }))
        : null;
      toast.success(result.added === 1 ? "1 post imported." : `${result.added} posts imported.`);
      onDone({ added: result.added, alreadyThere: result.alreadyThere, total: result.total, analysis });
    } catch {
      toast.error("Something went wrong on our side. Try again in a minute.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="wr-card wr-stack" aria-labelledby="found-h">
      <div>
        <h2 id="found-h" className="wr-h2">Check what was found</h2>
        <p className="wr-sub wr-small">{found.label}{range ? ` · ${range}` : ""}</p>
      </div>
      <div className="wr-found">
        <div data-tone="brand"><strong>{found.candidates.length}</strong>posts found</div>
        <div data-tone="success"><strong>{picked.size}</strong>will be imported</div>
        <div><strong>{leftOut.length}</strong>left out</div>
      </div>
      {reasons.size > 0 && (
        <p className="wr-small wr-muted" style={{ margin: 0 }}>
          Left out: {Array.from(reasons, ([label, count]) => `${label.toLowerCase()} (${count})`).join(", ")}.{" "}
          <button type="button" className="wr-text-btn" onClick={() => setShowAll((value) => !value)}>{showAll ? "Hide them" : "Show them"}</button>
        </p>
      )}

      <ul className="wr-import-list" aria-label="Posts found">
        {visible.map((post) => {
          const already = found.already.has(post.key);
          const canPick = usable(post);
          const reason = already ? "Already imported" : post.leftOut ? LEFT_OUT_LABEL[post.leftOut] : null;
          return (
            <li key={post.key} data-off={!picked.has(post.key) || undefined}>
              <label>
                <input type="checkbox" checked={picked.has(post.key)} disabled={!canPick} onChange={() => toggle(post.key)} />
                <span className="wr-mono">{post.postedAt ? DAY.format(new Date(post.postedAt)) : "No date"}</span>
                <span className="wr-import-text">{post.text ? post.text.split("\n")[0] : <em>No text</em>}</span>
                {reason && <span className="wr-tag" data-status={already ? "posted" : "skipped"}>{reason}</span>}
              </label>
            </li>
          );
        })}
      </ul>

      <div className="wr-savebar" data-dirty>
        <span className="wr-small wr-muted">Untick anything you don&apos;t want Poxeet to learn from.</span>
        <span className="wr-actions">
          <Button variant="ghost" onClick={onBack}>Choose another file</Button>
          <Button onClick={save} loading={saving} disabled={picked.size === 0}>{picked.size === 1 ? "Import 1 post" : `Import ${picked.size} posts`}</Button>
        </span>
      </div>
    </section>
  );
}
