# MDGalley

A frontend-only reviewer for long-form Markdown. Read in a typeset column,
leave anchored notes in the live margin, export one structured Markdown file
that an AI agent — or a human editor — can act on directly.

> **For:** writers and editors working through long-form, multi-file Markdown
> drafts who want a real reading rig, not a SaaS dashboard, and who hand the
> output to LLM agents that need a stable contract.

No backend. No accounts. No telemetry. Files never leave your machine.

---

## Why it exists

Reviewing a long-form draft via the standard "open VS Code → click preview →
ask the AI to change one passage → wait → repeat" loop is a bad fit for actual
reading. You lose the thread of the prose between every round-trip.

MDGalley collapses the loop:

1. Read the whole document end to end.
2. Accumulate notes in the margin as you go.
3. Export one Markdown file with every change request anchored to source lines.
4. Hand that file to a drafter agent. The agent applies what it can and writes
   back which notes it addressed; MDGalley flips them to *resolved* on the next
   open.

The reviewer reads. The agent edits. The contract between them is a versioned,
prompt-injection-defanged Markdown file.

---

## What sets it apart

- **Marginalia, not a side panel.** Notes live in the right gutter of the
  document itself, vertically aligned with the line they comment on, set in
  mono. The reviewer's eye never has to leave the prose to find a note.
- **Multi-pass review is first-class.** Notes carry a status (`open` /
  `resolved`), can be edited in place, and can be orphan-anchored to the
  document or a section heading rather than to a passage. Declare a named
  *pass* (e.g. `citations`, `voice`) and the gutter filters to only that pass.
- **A versioned contract for agents.** Every export declares
  `schema: mdgalley-review/MAJOR.MINOR` in its front matter. Downstream agents
  read it once and key off the version string — see [`SCHEMA.md`](SCHEMA.md).
- **Roundtrip, not one-shot.** A drafter agent writes
  `reviews/YYYY-MM-DD-applied.md` listing the note IDs it addressed. MDGalley
  imports that file on the next open and flips matching notes to *resolved*.
- **Continuous-document mode.** Render every `.md` in the workspace as one
  continuous document. Read the whole workspace in a single column.
- **Block-level re-anchoring.** Notes capture a paragraph reference (heading
  chain + ordinal) at creation time, so they survive prose edits even when the
  verbatim quote no longer matches.
- **A typesetter's reading rig, not a dashboard.** A single editorial serif
  sets the document end to end. Cards, shadows, pills, and accent blue are
  gone; the only spot colour is an ink red used for the reviewer's own marks.

---

## Quick start

A Chromium-family browser — Chrome, Edge, Brave, Arc, Opera. Safari and
Firefox lack the File System Access API and will see a typeset notice instead
of the app.

```bash
cd tools/reviewer
python3 -m http.server 8765
```

Open `http://localhost:8765`, click `open workspace` on the gate, pick the
folder that holds your `.md` files. That folder is the workspace. Notes
persist in IndexedDB; review files are written to `reviews/` inside it.

To share with a teammate: push `tools/reviewer/` to GitHub Pages, Netlify,
Cloudflare Pages, or any static host. The hosted page is read-only as far as
the host is concerned: each visitor picks their own folder and the File System
Access API runs locally — no upload, no server.

---

## Workflow at a glance

| Action | Keystroke |
|---|---|
| Open command palette | `⌘K` |
| Pin palette as a left rail | `⌘\` |
| Open workspace | `⌘O` |
| Toggle theme | click `◐` in the chrome |
| Toggle outline rail | click `‹` |
| Select a passage | drag, or use shift-arrow |
| Anchor a document-level note | `n` (no selection needed) |
| Anchor a section-level note | `s` |
| Pick a category in the composer | `1`–`7` (with empty textarea) |
| Save the composer | `⌘↵` |
| Cancel the composer | `esc` |
| Edit / resolve / delete a note | hover the note in the margin |
| Filter notes by status | `open` / `resolved` / `all` in the strip |
| Filter to the active pass | click `+ pass` in the strip |
| Start / resume / end a pass | settings menu → `passes` |
| Render the workspace as one document | settings menu → `single document across files` |
| Reset MDGalley (notes, theme, `.mdgalley/`) | settings menu → `reset` |
| Export the review file | click `export N` in the chrome |

There is no "save review" button. Notes persist on every change. Export is the
explicit action: it writes `reviews/YYYY-MM-DD-review.md` directly into the
workspace folder.

---

## Categories

Seven categories, each with a distinct hue plus a meta tag (so colour-blind
readers can tell them apart by label, not tint alone):

- `prose` — phrasing, sentence rhythm, word choice
- `accuracy` — facts, claims, internal consistency
- `citation` — missing or wrong reference to an external source
- `structure` — order, sectioning, hierarchy
- `length` — cut or expand
- `voice` — voice and register
- `keep` — positive note, "preserve this exact phrasing"

---

## Output format

Every note in the exported review file is structured for both human and agent
consumption:

```markdown
### Note 1 · accuracy · anchored · open

- **anchor**: lines 42 to 47
- **heading**: `Recognising the obligations`
- **quote**:
\`\`\`text
The rule applies to every operator without exception.
\`\`\`
- **comment**:
\`\`\`text
Wrong scope. The rule is limited to public-sector operators.
\`\`\`
- **block**: section "Recognising the obligations" / paragraph 3
```

Notes are grouped by file, then ordered open-first, then by source line. Quoted
text and free-form bodies are wrapped in fenced blocks; any backtick-fences in
user content are defanged so a downstream LLM cannot be prompt-injected by a
hostile note. Resolved notes are included by default, marked as such, so
revision history survives.

### Schema and sibling contracts

Every export declares its contract in the front matter via
`schema: mdgalley-review/MAJOR.MINOR`. The current version is
`mdgalley-review/2.0`. Three sibling contracts live alongside it:

| Contract | File | Purpose |
|---|---|---|
| `mdgalley-review/2.0` | `reviews/YYYY-MM-DD-review.md` | The export file; what you hand to a drafter agent. |
| `mdgalley-applied/1.0` | `reviews/YYYY-MM-DD-applied.md` | Drafter's reply: which note IDs were addressed. Imported on next open. |
| `mdgalley-taste/1.0` | `.mdgalley/taste.md` | Append-only log of every note lifecycle event — the reviewer's taste artefact. |
| `mdgalley-passes/1.0` | `.mdgalley/passes.json` | Named-pass registry and active-pass pointer. |

Full per-version contracts (front matter keys, per-note fields, vocabulary,
prompt-injection rules) live in [`SCHEMA.md`](SCHEMA.md). Downstream agents
should read it once and key off the version string.

---

## Architecture

```
tools/reviewer/
  index.html
  vendor/
    marked.esm.js          self-hosted, no CDN trust required
    purify.esm.js          DOMPurify, sanitises rendered Markdown
  styles/
    tokens.css             OKLCH palette, type system, baseline rhythm
    reset.css
    document.css           reading column, headings, code wells, highlights
    chrome.css             top app bar
    marginalia.css         notes + composer in the gutter
    palette.css            command palette + pinned-rail mode
    toc.css                left outline rail
    gate.css               browser gate, permission gate, toast
  js/
    main.js                composition root
    lib/
      eventBus.js          pub/sub
      component.js         lifecycle base class
      idb.js               IndexedDB key-value wrapper
      sanitizer.js         DOMPurify facade
      notesPersistence.js  workspace-side notes mirror
      tasteLog.js          append-only lifecycle log writer
      toolDir.js           .mdgalley/ directory facade
      reset.js             one-shot wipe action
    workspace/
      workspaceService.js  FileSystemDirectoryHandle persistence
      fileService.js       repository over the handle
    markdown/
      frontmatter.js       YAML front matter parser
      renderer.js          line-tagged renderer + sanitiser pass
    annotations/
      annotation.js        domain model: scope, status, priority, pass
      anchor.js            three resolvers: anchored, section, document
      blockAnchor.js       paragraph-level fallback reference
      annotationStore.js   repository over IndexedDB
      highlightLayer.js    re-applies <mark.hl> underlines into the DOM
      exporter.js          review file builder, prompt-injection safe
      appliedRoundtrip.js  imports reviews/*-applied.md, flips notes to resolved
    passes/
      pass.js              pass domain model and id format
      passStore.js         passes.json reader/writer + active pointer
    ui/
      gate.js              full-viewport typeset notice
      chrome.js            top bar
      documentView.js      reading surface + selection resolution
      marginalia.js        gutter rendering + composer + edit-in-place
      palette.js           command palette + rail
      filterStrip.js       open / resolved / all + pass chip
      passDialog.js        start / resume / end a pass
      toc.js               collapsible left outline rail
      toast.js             transient mono toast
```

Patterns in play:

- **Pub/sub event bus** for component decoupling.
- **Repository pattern** over IndexedDB (`annotationStore`, `passStore`) and
  over the directory handle (`fileService`, `notesPersistence`, `tasteLog`).
- **Facade** for the workspace lifecycle, the sanitiser, and the marked vendor.
- **Composition over inheritance**: `Component` is a thin lifecycle base, not
  a class hierarchy.
- **Strategy by anchor scope**: three resolvers (`anchored / section /
  document`) produce structurally identical anchor objects so the composer and
  the store treat them uniformly. `blockAnchor` adds a fallback locator so
  edits to the source don't orphan the note.

---

## Security posture

- **HTML sanitisation.** Every Markdown block goes through DOMPurify before
  reaching the DOM. Inline event handlers, `style` attributes, `javascript:`
  URLs, `<script>`, `<iframe>`, `<form>` and friends are stripped.
- **No CDN trust.** marked and DOMPurify are vendored locally; nothing is
  fetched at runtime from a third-party origin.
- **Prompt-injection defang in the export file.** Every user-controlled value
  (document title, heading, quote, body, rationale) is rendered inside fenced
  code blocks, and any nested triple-backtick or triple-tilde fence in user
  content is replaced with single-quote characters so the surrounding fence
  cannot be broken regardless of fence length.
- **No path traversal in writes.** The review file path is a constant template
  (`reviews/YYYY-MM-DD-review.md`); the export action does not accept
  user-provided paths.
- **No network egress.** The app makes zero outbound requests after the
  initial load; all reads and writes target the browser-granted directory
  handle.

---

## Limitations and known edge cases

- Highlights anchor by line range and verbatim quote. Rewriting the source on
  disk can leave a stale highlight; reload the file and the missing match is
  silently skipped (the gutter still shows the note, and `block` lets a
  drafter agent re-anchor it).
- The marginalia layout settles top-to-bottom; on a document with very many
  notes, late notes can accumulate well below their anchor's vertical
  position. Acceptable; the meta line on each note still names the source
  line.
- Sectra and GT America are commercial faces. The shipped build uses Source
  Serif 4 and Inter Tight as free fallbacks, served from Google Fonts.
  Self-hosting the commercial cuts is a one-line `@font-face` swap in
  `styles/tokens.css`.
- One export per day is destructive: re-exporting on the same date overwrites
  `reviews/YYYY-MM-DD-review.md` in place. The taste log preserves the trail.

---

## Roadmap

- Drag-and-drop fallback for Safari and Firefox (download the review file
  instead of writing in place).
- Richer drafter-roundtrip surfacing: per-note acceptance reasons rendered
  inline in the gutter rather than as plain status flips.
- Pass-aware export: emit a per-pass review file alongside the unified one.

---

## License

See [`LICENSE`](LICENSE).
