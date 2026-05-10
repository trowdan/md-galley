# Bookwright

A frontend-only reviewer for the *AI Act for Techies* manuscript. Read your chapters in a typeset reading column, leave anchored or chapter-level notes in the live margin, then export a single Markdown review file you can hand to an AI agent or human editor.

## Why it exists

Reviewing a long-form draft via the standard "open VS Code, click preview, ask the AI to change one passage, wait, repeat" loop is a bad fit for actual reading. Bookwright collapses the loop: read the whole chapter, accumulate notes, export one file with every change request anchored to source lines.

## How v2 differs from a generic reviewer

v2 was rebuilt around three ideas the first version did not handle:

1. **Marginalia, not a side panel.** Notes live in the right gutter of the manuscript itself, vertically aligned with the line they comment on, set in mono. The reviewer's eye never has to leave the prose to find a note.
2. **Multi-pass review is first-class.** Notes have status (`open` / `resolved`), can be edited in place, and can be orphan-anchored to the chapter or to a section heading rather than to a passage.
3. **A typesetter's reading rig, not a SaaS dashboard.** A single editorial serif sets the manuscript end to end. Cards, shadows, pills, and accent blue are gone; the only spot colour is an ink red used for the reviewer's own marks (selection, focused note).

## Workflow at a glance

| Action | Keystroke |
|---|---|
| Open command palette | `⌘K` |
| Pin palette as a left rail | `⌘\` |
| Toggle theme | click `◐` in the chrome |
| Select a passage | drag, or use shift-arrow |
| Anchor a chapter-level note | `n` (no selection needed) |
| Anchor a section-level note | `s` |
| Pick a category in the composer | `1`–`7` (with empty textarea) |
| Save the composer | `⌘↵` |
| Cancel the composer | `esc` |
| Edit / resolve / delete a note | hover the note in the margin |
| Filter notes by status | `open` / `resolved` / `all` in the chrome |
| Export the review file | click `export N` in the chrome |

There is no "save review" button. Notes persist in IndexedDB on every change. Export is the explicit action: it writes `reviews/YYYY-MM-DD-review.md` directly into the workspace folder.

## Categories

Seven categories, each with a distinct hue plus a meta tag (so colour-blind readers can tell them apart by label, not tint alone):

- `prose`: phrasing, sentence rhythm, word choice
- `accuracy`: facts, citations, claims (renamed from v1's `fact`)
- `citation`: missing or wrong reference to an Article, Recital, Annex, or external source
- `structure`: order, sectioning, hierarchy
- `length`: cut or expand (replaces v1's separate `cut` + `expand`)
- `voice`: voice and register against `STYLE.md`
- `keep`: positive note, "preserve this exact phrasing"

## Requirements

A Chromium-family browser: Chrome, Edge, Brave, Arc, Opera. Safari and Firefox lack the File System Access API and will see a typeset notice instead of the app.

## Run locally

```bash
cd tools/reviewer
python3 -m http.server 8765
```

Open `http://localhost:8765`. Click `open workspace` on the gate, then pick the project root or just `chapters/`. Files never leave your machine.

## Deploy as a shared link

Push `tools/reviewer/` to GitHub Pages, Netlify, Cloudflare Pages, or any static host. The hosted page is read-only as far as the host is concerned: each visitor picks their own folder, the File System Access API runs locally, files never leave their browser.

## Output format

Every note in the exported review file is structured for both human and agent consumption:

```markdown
### Note 1 · accuracy · anchored · open

- **anchor**: lines 42 to 47
- **heading**: `Recognising the obligations`
- **quote**:
\`\`\`text
Article 5 prohibits social-scoring systems used by public authorities.
\`\`\`
- **comment**:
\`\`\`text
Wrong article. Should be Art 5(1)(c). Prohibition is not limited to public authorities.
\`\`\`
```

Notes are grouped by file, then ordered open-first, then by source line. Quoted text and free-form bodies are wrapped in fenced blocks; any backtick-fences in user content are defanged so a downstream LLM cannot be prompt-injected by a hostile note. Resolved notes are included by default, marked as such, so revision history survives.

### Schema

Every exported review file declares its contract in the front matter via `schema: bookwright-review/MAJOR.MINOR`. The current version is `bookwright-review/1.0`. The full per-version contract (front matter keys, per-note fields, category and scope vocabulary, prompt-injection rules, and the policy for files predating the contract) lives in [`SCHEMA.md`](SCHEMA.md). Downstream agents should read it once and key off the version string.

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
    manuscript.css         reading column, headings, code wells, highlights
    chrome.css             top app bar
    marginalia.css         notes + composer in the gutter
    palette.css            command palette + pinned-rail mode
    gate.css               browser gate, permission gate, toast
  js/
    main.js                composition root
    lib/
      eventBus.js          pub/sub
      component.js         lifecycle base class
      idb.js               IndexedDB key-value wrapper
      sanitizer.js         DOMPurify facade
    workspace/
      workspaceService.js  FileSystemDirectoryHandle persistence
      fileService.js       repository over the handle
    markdown/
      frontmatter.js       YAML front matter parser (project-scoped)
      renderer.js          line-tagged renderer + sanitiser pass
    annotations/
      annotation.js        domain model: scope, status, priority
      anchor.js            three resolvers: anchored, section, chapter
      annotationStore.js   repository over IndexedDB
      highlightLayer.js    re-applies <mark.hl> underlines into the DOM
      exporter.js          review file builder, prompt-injection safe
    ui/
      gate.js              full-viewport typeset notice
      chrome.js            top bar
      manuscript.js        reading surface + selection resolution
      marginalia.js        gutter rendering + composer + edit-in-place
      palette.js           command palette + rail
      toast.js             transient mono toast
```

Patterns in play:

- **Pub/sub event bus** for component decoupling.
- **Repository pattern** over IndexedDB (`annotationStore`) and over the directory handle (`fileService`).
- **Facade** for the workspace lifecycle, the sanitiser, and the marked vendor.
- **Composition over inheritance**: `Component` is a thin lifecycle base, not a class hierarchy.
- **Strategy by anchor scope**: three resolvers (`anchored / section / chapter`) produce structurally identical anchor objects so the composer and the store treat them uniformly.

## Security posture

- **HTML sanitisation**: every Markdown block goes through DOMPurify before reaching the DOM. Inline event handlers, `style` attributes, `javascript:` URLs, `<script>`, `<iframe>`, `<form>` and friends are stripped.
- **No CDN trust**: marked and DOMPurify are vendored locally; nothing is fetched at runtime from a third-party origin.
- **Prompt-injection defang in the export file**: every user-controlled value (chapter title, heading, quote, body) is rendered inside fenced code blocks, and any nested triple-backtick fences in user content are replaced by triple-quote characters so the surrounding fence cannot be broken.
- **No path traversal in writes**: the review file path is a constant template (`reviews/YYYY-MM-DD-review.md`); the export action does not accept user-provided paths.

## Limitations and known edge cases

- Highlights anchor by line range and verbatim quote. Rewriting the source on disk can leave a stale highlight; reload the file and the missing match is silently skipped (the gutter still shows the note).
- The marginalia layout settles top-to-bottom; on a chapter with very many notes, late notes can accumulate well below their anchor's vertical position. Acceptable; the meta line on each note still names the source line.
- Sectra and GT America are commercial faces. The shipped build uses Source Serif 4 and Inter Tight as free fallbacks, served from Google Fonts. Self-hosting the commercial cuts is a one-line `@font-face` swap in `styles/tokens.css`.

## Roadmap

- Drag-and-drop fallback for Safari and Firefox (download the review file instead of writing in place).
- Roundtrip from the drafter agent: write a `reviews/YYYY-MM-DD-applied.md` so notes flip to `resolved` automatically.
- Auto-flag against `STYLE.md` (em-dashes, ritual hedging, empty intensifiers) so house-style fixes appear as draft annotations on chapter open.
