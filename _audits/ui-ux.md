# UI/UX audit: Bookwright

## Verdict

The build is set up to be a calm, type-led reading surface, and on the page-body level it largely is: serif column, generous leading, paged-feel cream background, pleasant code wells. The reading layer clears the bar that ebook tools should clear (legible measure, decent dark mode, restrained chrome). The interaction layer is where the polish thins out: the selection-to-popover handshake has race conditions, the popover has no real keyboard model for category selection, comment cards do not communicate state (active / focused / orphaned), and the empty / error / permission scaffolding is missing the three or four states a one-to-two-hour review session will actually run into. Microcopy is uneven (clever in one place, generic in the next). Accessibility has the floor right (`focus-visible`, ARIA labels) but skips reduced-motion entirely and trusts color alone for the categorical highlight palette. Twelve to fifteen targeted fixes get this from "shipped" to "felt".

## Top wins

- **Reading column tokens are tuned, not defaulted.** `--type-reading: 18px`, `--type-reading-lh: 1.65`, `--measure: 68ch` (`styles/tokens.css:9-16`). 68ch is on the upper edge of Bringhurst's 45-75 range, but for a book with code samples that need to breathe, it is the right call. Leading at 1.65 paired with an Iowan Old Style stack is the right ebook posture.
- **Cream paper, not screen white.** `--bg-page: #fbf8f1` and `--code-bg: #f5f1e8` (`styles/tokens.css:53,67`). This is the single biggest reason the reader does not feel like a doc viewer. Don't lose it.
- **Block-anchored highlights with a verbatim-quote fallback.** `js/annotations/highlightLayer.js:43-49` (line-range filter) and `:41` (full-reader fallback when source drifts). This is the boring, durable thing that makes the tool survive editing the manuscript underneath it.
- **Per-file note count badge in the sidebar.** `js/ui/sidebar.js:62-63`, `styles/ui.css:118-125`. This is the reviewer's progress meter across 32 chapters. It is in the right place.
- **App-bar uses backdrop blur and a sticky position.** `styles/ui.css:9-15`. Subtle, but it makes the long scroll feel like a page rather than a dump.
- **Highlight-flash on focus.** `js/ui/reader.js:59-62` runs a 1.5s brightness pulse via Web Animations API when you click a comment card. That is the right physics: the document moves, the document confirms.

## Findings

### [blocker] No reduced-motion handling anywhere

**Where:** `styles/tokens.css:35-36`, `styles/ui.css:218-223` (`pop-in`), `styles/ui.css:287` (toast `pop-in`), `js/ui/reader.js:59-62` (focus flash)
**Issue:** `prefers-reduced-motion` is not respected in CSS or in the JS animation. The popover scale-in, the toast pop-in, the brightness flash on focus, and the grid-template-columns transition on panel toggle all run unconditionally.
**Why it matters:** A reviewer in a long session who has set OS-level reduced motion (vestibular sensitivity, focus-mode users, Apple's Reduce Motion default for some accessibility profiles) gets repeated 220ms scale animations on every selection. This is one of the lower-cost accessibility wins in the codebase.
**Fix:** Add a global guard in `styles/tokens.css` or a new section in `ui.css`:
```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```
And gate the focus-flash in `reader.js`:
```js
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    mark.animate([...], { duration: FOCUS_FLASH_MS, easing: "ease-out" });
}
```

### [blocker] Highlight categories rely on color alone

**Where:** `styles/tokens.css:43-50`, `styles/reading.css:113-118`
**Issue:** The six categories (prose / fact / structure / cut / expand / other) are distinguished only by hue. There is no shape, pattern, underline style, or icon differentiator. Two of the six (`structure` 215° blue and `cut` 230° slate) are 15° apart, which means even users with normal color vision will struggle to tell them apart at the page tints (28% alpha on cream); deuteranopic and protanopic readers will not separate `prose` (48° yellow) from `expand` (145° green) or `fact` (0° red) reliably.
**Why it matters:** The whole point of the categorical palette is at-a-glance scanning during a re-read. If categories collapse into "highlighted vs not", you have built a single-bucket tool with extra ceremony.
**Fix:** Pick one redundant channel per category and apply it to `mark.hl`:
- A 2px left border in the same hue at full saturation (works for inline marks because of `border-radius: 2px` already).
- Or a unicode glyph prepended via `::before` with `content: attr(data-category-symbol)` driven by a `data-category-symbol` written by `highlightLayer.js`.
- Pull `cut` from 230° to 270° magenta or move it to a neutral-grey strikethrough (`text-decoration: line-through`) since "cut" semantically reads as struck.

Also widen the hue gap between `structure` (215°) and `cut` (230°). Targets: prose 50, fact 0, structure 200, cut 280, expand 145, other 320.

### [blocker] Selection-popover can race against the selection-clear path

**Where:** `js/ui/reader.js:65-80`, `js/ui/commentPopover.js:54-61`
**Issue:** `selectionchange` is debounced 140ms. When the user releases the selection and clicks anywhere outside the reader (say, the comments panel), the document-level `mousedown` listener in `commentPopover.js:54` runs immediately, but the popover may not yet be open because `SELECTION_MADE` has not fired. Conversely, when the user makes a selection then clicks inside the popover textarea quickly, the debounced `selectionchange` can land *after* the click and re-fire `SELECTION_MADE`, which is guarded only by `this.root.contains(document.activeElement)` (`commentPopover.js:34`). If the user has not yet focused the textarea (microtask race), state resets.
**Why it matters:** Reviewers will lose typed comment text. This is the single highest-impact interaction bug.
**Fix:** Two changes:
1. In `commentPopover.js:onSelectionMade`, also bail if `this.context` exists and the new payload's anchor matches by `lineStart/lineEnd/quote`. This prevents idempotent re-fires from clearing state.
2. Replace the debounce with a `mouseup`/`keyup`-driven trigger inside the reader: only resolve a selection on the user's release event, not on every `selectionchange`. `selectionchange` fires throughout the drag.

```js
// reader.js
this.bind(this.root, "mouseup", () => queueMicrotask(() => this.onSelectionChange()));
this.bind(this.root, "keyup", (ev) => {
    if (ev.shiftKey || ev.key.startsWith("Arrow")) this.onSelectionChange();
});
```

### [major] Popover positions only below the selection; no flip on viewport edge

**Where:** `js/ui/commentPopover.js:99-106`
**Issue:** `position()` always sets `top = rect.bottom + 8`. If the user selects a passage in the bottom 200px of the viewport, the popover renders below the fold and the textarea is unreachable without scrolling. There is no flip-to-above when below would clip.
**Why it matters:** In long-form reading, selections happen all over the column, including the last paragraph before a page break. Reviewers will lose selections trying to reach a popover they cannot see.
**Fix:**
```js
const POPOVER_HEIGHT_EST = 280;
const wouldClipBelow = rect.bottom + POPOVER_HEIGHT_EST + VIEWPORT_PAD > window.innerHeight;
const top = wouldClipBelow
    ? rect.top + window.scrollY - POPOVER_HEIGHT_EST - 8
    : rect.bottom + window.scrollY + 8;
```
Set `data-placement="above"|"below"` on the root so a future caret/arrow can flip too.

### [major] No keyboard shortcut to assign category

**Where:** `js/ui/commentPopover.js:43-52`
**Issue:** Only `Escape` and `Cmd/Ctrl+Enter` are wired. Reviewers cannot pick a category without taking their hands off the keyboard. Six categories with consistent first letters (P/F/S/C/E/O) are begging for `1-6` or letter shortcuts.
**Why it matters:** Reviewers in a 1-2 hour pass will run hundreds of selection cycles. The mouse round-trip to a category button costs 1.5-2 seconds per note. This is the "tool feels inevitable" detail Brichter would obsess over.
**Fix:** Extend `onKeydown`:
```js
const KEY_TO_CAT = { "1": "prose", "2": "fact", "3": "structure",
                    "4": "cut", "5": "expand", "6": "other" };
if (KEY_TO_CAT[ev.key] && document.activeElement?.tagName !== "TEXTAREA") {
    ev.preventDefault();
    this.selectCategory(KEY_TO_CAT[ev.key]);
}
```
Also surface this in placeholder copy: `"What needs to change here? (1-6 to recategorise, Cmd+Enter to save)"`.

### [major] Comment cards are clickable but provide no active state

**Where:** `js/ui/commentPanel.js:61-85`, `styles/ui.css:141-197`
**Issue:** Clicking a comment card emits `ANNOTATION_FOCUSED` and the reader scroll-and-flashes the mark. But the card itself does not change state to indicate "this is the one you are looking at". The hover lifts (`translateY(-1px)`), the focus pulse runs in the reader, then nothing. If the reviewer scrolls back up the comments list to compare two notes, they have lost their place.
**Why it matters:** The comments panel is the navigational spine of a re-read. Without persistent active state, it is a list of disconnected stickies.
**Fix:** When `ANNOTATION_FOCUSED` lands in `CommentPanel`, set `data-focused="true"` on the matching card; clear the previous one. CSS:
```css
.comment-card[data-focused="true"] {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
}
```
Also reflect the same `[data-focused="true"]` on the `mark.hl` itself so the highlight stays elevated past the 1.5s flash.

### [major] No state for "saved review" or for "unsaved changes"

**Where:** `js/ui/toolbar.js:58-71`, `index.html:42`
**Issue:** The Save review button shows a generic toast (`"Saved 12 notes to ..."`) and otherwise looks identical before and after save. There is no indication that, since last save, the user has added six new notes. After exporting, the next session begins with no clue whether yesterday's review file is in sync.
**Why it matters:** Reviewers who close the tab mid-session and return will not know what state they are in. The button is the only persistence affordance and it is mute about its history.
**Fix:**
1. Track `lastSavedAt` and a `dirty` boolean (compare current annotation count + last `createdAt` against last save snapshot) in `Toolbar`.
2. Render the button label as `Save review` (clean) vs `Save review (3 new)` (dirty).
3. Add a tiny `<span class="muted">Saved 4m ago</span>` adjacent.

### [major] Workspace permission re-prompt on every fresh tab is silent and confusing

**Where:** `js/main.js:77-80`, `README.md:11`
**Issue:** `workspace.restore({ requestIfNeeded: false })` returns silently if the handle is stored but permission has lapsed. The reader stays on the placeholder ("Open a workspace to begin") with no hint that a previous workspace exists and just needs a click to re-grant.
**Why it matters:** Every time the reviewer opens the app, they re-experience the cold start. This is the single most repeated friction.
**Fix:** When `workspace.restore` finds a handle but cannot get permission silently, show a softer placeholder:
```html
<div class="reader__placeholder">
    <h2>Reconnect to AIAct-for-Techies?</h2>
    <p>Your last workspace is remembered. Browsers require permission per tab.</p>
    <button class="primary-button">Reconnect workspace</button>
    <button class="ghost-button">Pick a different folder</button>
</div>
```
The handle's name comes from `handle.name`. Show it.

### [major] No error state for "this folder has no markdown files"

**Where:** `js/ui/sidebar.js:49-51`
**Issue:** Renders a single line `<li class="file-list__group">No markdown files found</li>`. The reader-region still shows the original placeholder ("Open a workspace to begin") even though a workspace is open. Two contradictory messages on screen.
**Why it matters:** Users who accidentally pick the wrong folder (the project root vs `chapters/`) will not know what went wrong. This is exactly the foot-gun the README's "or just the chapters/ folder" line is hinting at.
**Fix:** When `FILES_LISTED` arrives with zero files, replace the reader placeholder with:
```html
<div class="reader__placeholder">
    <h2>No .md files in this folder</h2>
    <p>Bookwright reads Markdown chapters. Try a folder like <code>chapters/</code>.</p>
    <button class="ghost-button">Pick a different folder</button>
</div>
```

### [major] Permission-denied / API error has no in-product explanation

**Where:** `js/ui/toolbar.js:41-50`
**Issue:** If `workspace.pick()` throws a non-`AbortError`, the user gets a 2.4-second toast: `"Could not open workspace"`. No log link, no retry button, no explanation. Saving may also throw (quota, write-failure, permission revoked between read and write); same generic toast.
**Why it matters:** When the file system fails at the end of a 90-minute review session, "Could not open workspace" is malpractice.
**Fix:** Replace the toast for hard errors with an inline alert region in the app bar (or a lightweight modal). Distinguish:
- `NotAllowedError` (permission denied) -> "Permission was denied. Click Open workspace and grant read/write."
- `QuotaExceededError` on save -> "Browser storage is full. Export your review file then clear notes."
- Other -> show the underlying `err.name`.

### [major] App bar lacks the chapter title or current file name

**Where:** `index.html:36-39`, `js/ui/toolbar.js:52-56`
**Issue:** The bar shows the brand ("Bookwright"), the workspace folder name in monospace, and a notes count. It does not show *what file you are currently reading*. The only place is the `<h1>` rendered inside the markdown body, which scrolls away.
**Why it matters:** Reviewers who scroll deep into a 6000-word chapter lose orientation. Every ebook reader keeps the chapter title in a persistent header (Kindle, Apple Books, Readwise).
**Fix:** Add a `chapter-title` span to the app bar, populated from `FILE_LOADED` payload's `chapterTitle`. Replace the workspace label or layer it as a subtle second line:
```html
<div class="app-bar__title">
    <span class="chapter-title">Why the AI Act Exists</span>
    <span class="workspace-label">/AIAct-for-Techies</span>
</div>
```
Stack them as title (sans, 14px, ink) + path (mono, 11px, ink-muted).

### [minor] Headings break ebook visual hierarchy by switching to sans-serif

**Where:** `styles/reading.css:13-23`
**Issue:** Body is serif; H1-H6 are forced to `var(--font-sans)` Inter. This is a stylistic choice (some publishers do it), but for *ebook benchmarks* (iBooks, Apple Books, Readwise) the headings stay in the family. It also creates a jarring rhythm in a chapter with frequent `###` level-3 breaks: every fourth or fifth visual unit switches typeface.
**Why it matters:** A 32-chapter technical book with frequent subheads will feel like a slide deck, not a book.
**Fix:** Either keep headings serif (drop `font-family: var(--font-sans)` from `.reader h1...h6`) or commit to a clear hierarchy: serif for body and H1-H2; sans only for H4 small-caps "kicker" labels (which it already does at line 23). Remove sans from H1-H3.

### [minor] Code blocks inherit Prism's default light theme without dark-mode parity

**Where:** `index.html:14-16`
**Issue:** The Prism theme is hard-coded to the light theme via `id="prism-light-theme"`. There is no dark-mode swap. In dark mode the body fights the light Prism palette inside `<pre>`.
**Why it matters:** Half the audience will use dark mode in long sessions. Code samples will glow.
**Fix:** Load both Prism themes, disable the inactive one based on `data-theme`. Minimum:
```html
<link rel="stylesheet" id="prism-light"
      href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css">
<link rel="stylesheet" id="prism-dark" disabled
      href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css">
```
In `toolbar.js:toggleTheme`, flip `disabled` on each link.

### [minor] Justification and hyphenation are unset; ragged-right column

**Where:** `styles/reading.css:3-11`
**Issue:** No `text-align`, no `hyphens`, no `text-wrap`. The reader gets browser default `text-align: start` (left-aligned, ragged right) and no soft hyphens. For a 68ch measure, this is fine; for a code-heavy technical chapter where long terms ("high-risk AI system", "fundamental rights impact assessment") create ugly word-end gaps, it shows.
**Why it matters:** The book talks about long compound legal terms constantly. Bringhurst would set this:
**Fix:**
```css
.reader { text-wrap: pretty; hyphens: auto; -webkit-hyphens: auto; }
.reader p { hyphens: auto; -webkit-hyphenate-limit-chars: 8 4 4; }
.reader pre, .reader code { hyphens: none; }
```
Stay left-aligned; do not justify (justification at this measure looks weak without proper rivers control).

### [minor] Keyboard navigation for the file list is missing

**Where:** `js/ui/sidebar.js:40-46`, `index.html:69`
**Issue:** File list items are `<li>` with `cursor: pointer`. They have no `tabindex`, no `role="button"`, no arrow-key handler. Keyboard users cannot reach files except by Tab + Enter (and there is no focus indicator on `<li>` because it is not focusable).
**Why it matters:** Twenty files to scroll through with mouse only is fine; thirty-two chapters with mouse only is friction. Also: AT users are excluded.
**Fix:**
- Render items as `<button class="file-list__item">` inside the `<li>`.
- Add a keydown handler at the list level for `ArrowUp` / `ArrowDown` / `Home` / `End` that moves focus and Enter that activates.
- `aria-current="page"` instead of `aria-current="true"` (the file is treated like a navigation page).

### [minor] Toast is the only feedback channel and it stacks badly

**Where:** `js/ui/toast.js:18-25`, `styles/ui.css:275-288`
**Issue:** `show()` cancels the previous timer and replaces text. If three saves happen in 200ms (e.g. via Save review batch), the second and third toasts overwrite each other invisibly. There is no queue, no semantic level (info / success / error), no `prefers-reduced-motion` guard on the `pop-in`.
**Why it matters:** A toast is the one place a user gets confirmation. If "Note saved" and "Could not open workspace" use the same visual, the second one will be missed.
**Fix:** Add `level` to the event payload (`"info" | "success" | "error"`); style accordingly (red border for error). Queue toasts: if one is showing, push the next and cycle. Persist error toasts (no auto-dismiss) with a close button.

### [minor] Comment-card delete is a hover-only affordance

**Where:** `styles/ui.css:188-196`
**Issue:** `opacity: 0` until hover. On touch / keyboard, the delete button is unreachable.
**Why it matters:** Even Chromium-only desktop users will scroll the comments list with arrow keys (once you fix the previous finding) and find no visible delete control.
**Fix:** Make it `opacity: 0.4` always; raise to 1 on hover/focus. Add `:focus-visible { opacity: 1 }`.

### [minor] No undo for delete

**Where:** `js/ui/commentPanel.js:53-57`
**Issue:** Click trash icon -> annotation gone, no confirmation, no undo. The store removes immediately.
**Why it matters:** Trash icons next to dense user-typed content one click away from oblivion is a known design hazard.
**Fix:** Add an undo affordance to the toast:
```js
this.deps.bus.emit(Events.TOAST, {
    message: "Note deleted",
    action: { label: "Undo", run: () => this.deps.annotationStore.add(deletedAnn) }
});
```
Render the action as a button in the toast. Persist the toast 5s when an action is present.

### [minor] Sidebar group labels are noisy when there is one group

**Where:** `js/ui/sidebar.js:55-57`
**Issue:** Renders the directory name as a group header (skipping `.`). For a workspace where every file lives in `chapters/`, the user sees `CHAPTERS` once at the top. Useful for nested. Ugly when the answer is a single label.
**Why it matters:** Cognitive noise in long sessions.
**Fix:** If `groups.size === 1`, drop the header. Or, more useful, replace it with the *count*: `CHAPTERS · 32 files`.

### [minor] Workspace label uses monospace and truncates aggressively

**Where:** `styles/ui.css:24-32`
**Issue:** `font-family: var(--font-mono); font-size: 12px; max-width: 32ch;`. Folder names with spaces or long paths get truncated; mono font in a serif/sans bar is a visual oddity.
**Why it matters:** Technical detail bleed where it does not need to be. The workspace name is contextual chrome, not content.
**Fix:** Use `var(--font-sans)`, 13px, ink-muted. Prefix with a folder glyph (`◰` or a 12px SVG). Reserve mono for line numbers and code only.

### [polish] Empty comments-panel state is generic

**Where:** `index.html:91`
**Issue:** "Highlight any passage in the reader, then leave a note." Functional but flat. The empty state is the moment to teach the categories, the keyboard shortcuts, the export workflow.
**Why it matters:** First-run users do not know what categories exist or how to save.
**Fix:**
```
No notes yet on this chapter.

Highlight a passage to leave one. Categories:
prose · fact · structure · cut · expand · other.

Cmd+Enter to save. Cmd+S to export the whole review.
```
Render with the same six color chips for visual continuity with what they will see later.

### [polish] Browser gate copy is technical and unwelcoming

**Where:** `js/ui/browserGate.js:11-23`
**Issue:** "This browser cannot edit local files" plus a paragraph naming the API. For a Safari-default user (a common reviewer profile), the message reads as "you are wrong, leave."
**Why it matters:** Probably 10-20% of reviewers will hit this gate. The current copy turns them away with a paragraph of vendor jargon.
**Fix:**
```
Bookwright needs Chrome, Edge, Brave, Arc, or Opera

This tool reads and writes Markdown files directly on your disk.
The browser API for that ships in Chromium browsers only.
Safari and Firefox will get a drag-and-drop fallback in a later version.

Copy this URL: <button>Copy link</button> — open it in Chrome.
```
Useful, specific, gives the user a path forward.

### [polish] Reader placeholder buries the value prop in the third sentence

**Where:** `index.html:74-79`
**Issue:** "Open a workspace to begin / Pick the folder that holds your .md chapters. Files never leave your machine. Highlights live in your browser..." The first-time user sees a generic call to action; the differentiator ("Files never leave your machine") is in the middle of a paragraph.
**Why it matters:** First impression of a tool that competes with Hypothes.is and Readwise. Lead with the differentiator.
**Fix:**
```
Read your manuscript like a book. Highlight, comment, export.

Everything stays on your machine. Pick a folder of .md files to begin.

[Open workspace]
```

### [polish] Highlight tints could carry a faint underline on hover

**Where:** `styles/reading.css:104-112`
**Issue:** Hover bumps alpha 0.28 -> 0.42. That is a low-contrast tell.
**Why it matters:** On a dense paragraph with three overlapping highlights, the hover-bump is hard to spot.
**Fix:**
```css
.hl:hover {
    background: hsla(var(--cat-h, 48), 90%, 55%, var(--hl-alpha-hover));
    box-shadow: inset 0 -2px 0 hsla(var(--cat-h, 48), 80%, 40%, 0.6);
}
```

### [polish] Block line numbers fade in at `opacity: 0.5`, never to 1

**Where:** `styles/reading.css:88-102`
**Issue:** On reader hover, gutter line numbers reveal at 50% opacity. Useful as a peek; insufficient as a reference. Reviewers who want to confirm a line number cannot make it land legibly.
**Why it matters:** The export format references lines (`L42 to L47`). Authors will scan back to the reader to find them. 50% mono-grey on cream is not enough.
**Fix:** Bring the hover state to `opacity: 0.85`, and add an explicit "show line numbers" toggle in the toolbar (a column-icon button) that pins them at full opacity. Persist with localStorage like theme.

### [polish] Title element copy is overwrought

**Where:** `index.html:6`
**Issue:** `<title>Bookwright. Margin notes for living manuscripts.</title>` is precious. Tab strips show only the first chunk; the second sentence never renders meaningfully.
**Why it matters:** Tab strips with five tabs all reading "Bookwright. Margin notes for liv..." are useless.
**Fix:** Update title dynamically once a file is loaded: `<chapterTitle> · Bookwright`. Keep the long form for the empty state only.

## Bigger bets (optional)

1. **A "review pass" mode that gates progress through the chapter.** Replace the comments panel during a long read with a focus-mode side rail that tracks where you have been (scroll position), what you have flagged, and what you have skipped. End-of-chapter, surface a one-screen summary: 12 notes across 6 categories, 2 sections unread. This turns Bookwright from a sticky-note tool into a chapter-completion ritual, which is what a 32-chapter book actually needs.
2. **Cross-chapter search and category filter.** With 32 chapters and presumably hundreds of notes, the reviewer will eventually need to ask "show me every `fact` note in Part 2." Right now the comments panel is per-file. A second tab or a filter chip row in the comments panel header (`All · Prose · Fact · Structure · ...`) plus a "show across workspace" toggle would extend the tool's utility to a second pass.
3. **Optional inline reply / counter-note.** The export anchors notes by line range and quote. Authors who fix one but not another would benefit from an in-app "addressed" toggle on each card (struck-through and dimmed when checked). On next save, the export can split addressed vs open. This is the difference between a one-shot review file and a living review document, which is closer to the Workspace Comments mental model the audience already uses.
