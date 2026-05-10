# Visual direction: Bookwright v2

## Philosophy

The book being reviewed is a regulation manual: 113 Articles, 180 Recitals, 13 Annexes, voiced like Dibble. The thing on the table is a manuscript, not a SaaS document. So the reviewer should look like a typesetter's proofing rig, not a Notion clone. The redesign treats Bookwright as a single instrument with one job — present 4,000 words of prose calmly enough that an author can stay inside it for ninety minutes — and treats every other concern (file switching, status filters, exports, the permission dance) as marginalia. Chrome retracts. Type does the work. The ornament budget gets spent in two places only: the typographic identity at the top of the column, and the line of margin notes running beside the prose. Nothing else carries decoration. No cards. No pills. No tints on tints. The look should read, on first encounter, as a publishing tool somebody made for themselves before software design existed as a discipline.

## The signature move

A live margin. Notes do not live in a 320 px right pane. They live in the right gutter of the manuscript itself, vertically aligned with the line they anchor to, set in a smaller monospaced face, ranged left against a hairline rule that runs the full height of the column. The manuscript stays the centre of attention; notes appear *next to* the line they comment on, the way a copy-editor pencils them on a galley. Resolved notes do not disappear; they desaturate to a thin grey hairline note with the body collapsed, leaving a record of what was thought and dismissed. Chapter-level and section-level notes drop into the margin too, but anchor visually to the heading rule rather than a line of body text. The right pane goes away. The reader stops being interrupted by a separate column of UI; they get a manuscript with a working margin.

The mechanic that makes it work is CSS Grid plus container queries plus an anchor offset stored on each note as a custom property:

```css
.manuscript {
    display: grid;
    grid-template-columns:
        [text-start] minmax(0, 62ch)
        [text-end gutter-start] 28ch
        [gutter-end];
    column-gap: 4ch;
    align-items: start;
}

.note {
    grid-column: gutter;
    /* offset-line is set by JS from the anchor's bounding box,
       relative to the manuscript's top */
    transform: translateY(calc(var(--offset-line) * 1px));
    transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1);
}

/* Notes that would collide are nudged down by a JS pass that walks the
   list, never overlapping. The transform animates so the gutter "settles"
   when a note is added or resolved. */

.note[data-status="resolved"] {
    color: color-mix(in oklch, var(--ink) 38%, transparent);
}
.note[data-status="resolved"] .note__body { display: none; }
.note[data-status="resolved"] .note__meta::after {
    content: " · resolved";
    font-style: italic;
}
```

When the gutter does not fit (narrow viewport, container query trips), notes flip into a footnote drawer that slides up from the bottom of the column on focus, not into a separate pane. The three-pane shell is gone in both directions.

## Anti-targets

- Linear / Notion / Vercel / Stripe corporate minimalism: rounded grey cards, soft shadows, a single accent.
- Anthropic / OpenAI marketing pages: peach gradients, cream cards, generic editorial-but-not-quite type.
- Generic ebook readers: sepia paper, page-curl, fake leather, drop caps as decoration.
- The current Bookwright: cream + Iowan + blue + three-pane + rounded category pills.
- Mid-2010s brutalism cosplay: 1 px borders on everything, monospace headlines, neon yellow on black.
- AI tells: lavender-to-cyan gradients, generic "no notes yet" illustrations, every surface stacking border + shadow + tint.
- The "design system" look: visible 8 px grids, captions labelled `caption-1`, every component in a Figma sticker sheet.

## Type system

The book's voice is Dibble. The visual register is editorial print. So the type system is one serif for prose, one grotesk for marginalia and chrome, one mono for source. No Inter. No Iowan.

**Prose: GT Sectra Book / Sectra Regular.** Display-grade modern serif designed for editorial reading. Sharp serifs, distinctive italics, correct grey on a screen at 19 px. Costs money: licence the four cuts. Free fallback: **Source Serif 4** (variable, free, weight 380, optical size 18). Not perfect, but legitimately good and will not embarrass you.

**Marginalia and chrome: GT America Mono / GT America.** GT America for any sans need (file labels, the workspace bar). GT America Mono, regular and medium, for the margin notes themselves: monospaced makes notes feel like editorial annotation rather than chat. Free fallback: **Inter Tight** for sans, **JetBrains Mono** for marginalia.

**Source code: JetBrains Mono.** Free, looks correct in code wells, not the same monospace the marginalia uses (so a code listing inside the manuscript reads as quoted material, not as a margin note that escaped).

```css
@font-face {
    font-family: "Sectra";
    src: url("/fonts/GT-Sectra-Book.woff2") format("woff2");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
}
@font-face {
    font-family: "Sectra";
    src: url("/fonts/GT-Sectra-Book-Italic.woff2") format("woff2");
    font-weight: 400;
    font-style: italic;
    font-display: swap;
}
@font-face {
    font-family: "Sectra";
    src: url("/fonts/GT-Sectra-Medium.woff2") format("woff2");
    font-weight: 600;
    font-style: normal;
    font-display: swap;
}

@font-face {
    font-family: "Marginalia";
    src: url("/fonts/GT-America-Mono-Regular.woff2") format("woff2");
    font-weight: 400;
    font-display: swap;
}
@font-face {
    font-family: "Marginalia";
    src: url("/fonts/GT-America-Mono-Medium.woff2") format("woff2");
    font-weight: 500;
    font-display: swap;
}

:root {
    --font-prose: "Sectra", "Source Serif 4", Charter, Georgia, serif;
    --font-margin: "Marginalia", "JetBrains Mono", ui-monospace, monospace;
    --font-chrome: "GT America", "Inter Tight", system-ui, sans-serif;
    --font-code: "JetBrains Mono", ui-monospace, monospace;
}
```

Type scale (rems, base 16):

| Token | Size | LH | Use |
|---|---|---|---|
| `--t-display` | 3.25rem (52 px) | 1.04 | Chapter title only. Set in Sectra Medium with negative tracking, single hairline rule beneath. |
| `--t-h2` | 1.625rem (26 px) | 1.18 | Section heading. Sectra Regular, no rule. |
| `--t-h3` | 1.125rem (18 px) | 1.3 | Sub-section. Sectra Medium, italics retained. |
| `--t-prose` | 1.1875rem (19 px) | 1.62 | Body text. Slightly larger than v1's 18 px because Sectra has a smaller x-height than Iowan. |
| `--t-prose-quote` | 1.0625rem (17 px) | 1.55 | Block quotes from the regulation, italic Sectra. |
| `--t-margin` | 0.8125rem (13 px) | 1.42 | Margin notes. Mono. Tight enough that 28ch fits useful body text. |
| `--t-meta` | 0.6875rem (11 px) | 1.3 | Line range, category tag, "resolved" status. Mono, all lowercase. |
| `--t-chrome` | 0.8125rem (13 px) | 1.4 | App bar, file switcher, button labels. Sans. |
| `--t-code` | 0.875rem (14 px) | 1.55 | Inline and block code inside the manuscript. |

Pairing rationale: a single editorial serif carries the manuscript end to end (heading and body in the same family is what makes it read like a *book*, not a slide deck — the v1 audit flagged this). Every UI surface is monospace or grotesk so the manuscript and the apparatus around it never look like the same kind of object. The reader's eye learns within thirty seconds: serif means content, mono means apparatus.

## Palette

OKLCH because the reds and greens need to feel calibrated, not "brand". The base is paper, not cream and not pure white: a desaturated warm off-white in light mode, a near-black with a sliver of warmth in dark mode. The accent is not blue; blue is what every dev tool uses and what the v1 audit complained about. Accent is a deep ink red, reserved exclusively for the reviewer's own marks: the cursor of the reviewer's attention, not a brand colour.

Highlight tints are pulled apart in hue (the v1 audit was right that 215° structure and 230° cut were too close) and given a redundant channel: a 2 px left-edge bracket in full saturation, so a deuteranopic reader can tell categories apart by shape and saturation, not hue alone. Six categories matter: prose, accuracy, citation, structure, length, voice. A seventh, "keep", is rendered without a tint at all — a small green check in the gutter — to make positive notes visually unlike change-requests.

```css
:root {
    /* Paper */
    --paper:        oklch(98.5% 0.006 85);     /* warm off-white, not cream */
    --paper-deep:   oklch(96.8% 0.008 85);     /* code wells, table headers */
    --paper-edge:   oklch(93%   0.010 85);     /* hairlines */

    /* Ink */
    --ink:          oklch(20%   0.015 60);     /* body text, near-black warm */
    --ink-2:        oklch(42%   0.012 60);     /* secondary, line ranges */
    --ink-3:        oklch(62%   0.010 60);     /* tertiary, file paths */
    --ink-thin:     oklch(82%   0.008 60);     /* hairline rules */

    /* Reviewer's mark — used for current-note focus and selection only */
    --mark:         oklch(48%   0.18  25);     /* deep ink red */
    --mark-soft:    oklch(48%   0.18  25 / 0.10);
    --selection:    oklch(48%   0.18  25 / 0.18);

    /* Categories — hue, then per-category lightness/chroma tuned by eye */
    --cat-prose:     oklch(78% 0.13  85);   /* warm yellow */
    --cat-accuracy:  oklch(62% 0.18  25);   /* the mark hue, not coincidence */
    --cat-citation:  oklch(70% 0.14  280);  /* violet */
    --cat-structure: oklch(70% 0.14  235);  /* deep blue */
    --cat-length:    oklch(72% 0.12  150);  /* sage */
    --cat-voice:     oklch(70% 0.15  330);  /* magenta */
    --cat-keep:      oklch(60% 0.14  155);  /* a separate green, for positive notes */

    /* Highlight surfaces (mixed at use, not stored) */
    --hl-alpha:        0.22;
    --hl-alpha-active: 0.40;
}

[data-theme="dark"] {
    --paper:        oklch(16%   0.012 60);    /* near-black, warm */
    --paper-deep:   oklch(20%   0.014 60);
    --paper-edge:   oklch(28%   0.014 60);

    --ink:          oklch(92%   0.012 80);
    --ink-2:        oklch(72%   0.010 80);
    --ink-3:        oklch(54%   0.010 80);
    --ink-thin:     oklch(36%   0.012 60);

    --mark:         oklch(72%   0.18  25);
    --mark-soft:    oklch(72%   0.18  25 / 0.16);
    --selection:    oklch(72%   0.18  25 / 0.28);

    --hl-alpha:        0.30;
    --hl-alpha-active: 0.52;
}

::selection { background: var(--selection); color: inherit; }
```

The accent is used in three places only: the reviewer's selection, the focused note's hairline, and the cursor in input fields. Buttons are not accented. The "save" button is set in ink, like body text, with a single hairline beneath. The product's voice is type and rules, not brand colour.

## Spatial system

Math, not "an 8 px scale".

The reading column is the constraint. Sectra at 19 px / 1.62 line height yields characters of about 9.7 px average advance and a line height of 30.78 px. Bringhurst's range for prose is 45 to 75 characters; for technical prose with code the audit was right to push to 68. I am setting 62 ch, because Sectra has narrower characters than Iowan and 68 ch in Sectra reads as 70+ ch in Iowan — past the comfort line. 62 ch × ~9.7 px ≈ 601 px column.

```
viewport >= 1280:   [side  72]  [text 601]  [gap 56]  [margin 320]  [side  …flex]
viewport 1024-1280: [side  40]  [text 601]  [gap 40]  [margin 280]  [side  …flex]
viewport  720-1024: [side  24]  [text 580]  [gap 32]  [margin 220]  [side  …flex]
viewport  < 720:    column only; notes become a footnote drawer
```

Vertical rhythm is the line height: 30.78 px is the unit. Every heading, sidebar, code well, and table aligns its top to a multiple of 30.78 px. Paragraph spacing is one line height (30.78 px), not "1.1 rem".

```css
:root {
    --line: 1.9rem;                /* 30.4 px, the rhythm unit */
    --measure-text: 62ch;
    --measure-margin: 28ch;
    --gap-column: 4ch;
    --gap-side: clamp(1.5rem, 4vw, 4.5rem);
}

.manuscript p,
.manuscript ul,
.manuscript ol,
.manuscript pre,
.manuscript blockquote,
.manuscript table,
.manuscript figure {
    margin: 0 0 var(--line);
}

.manuscript h2 {
    margin: calc(var(--line) * 2.5) 0 var(--line);
}
.manuscript h3 {
    margin: calc(var(--line) * 1.5) 0 calc(var(--line) * 0.5);
}
```

The 30.4 px rhythm is what makes a 4,000-word chapter feel like a book and not a doc. The current build floats things on rems with no shared baseline; the new build commits to a baseline grid because the manuscript is the only thing on screen worth committing to.

## Motion principles

Five rules.

1. **Motion confirms position; it does not entertain.** When a note is created the gutter settles into place (notes below it slide down to make room). When a note is resolved, the body collapses; the meta line stays. Nothing else moves on its own.
2. **Durations: 140 ms for confirmations, 280 ms for layout shifts, never longer.** Easing: `cubic-bezier(0.32, 0.72, 0, 1)` (a soft spring without overshoot) for layout, `cubic-bezier(0.2, 0, 0, 1)` for fades. No bounces, no scales above 1, no `pop-in` keyframes from the v1 build.
3. **Selection-to-compose is instant.** No popover scale-in. The composer fades 90 ms.
4. **No filters, no stacked shadows, no animated blur.** A focused note gets a 1 px hairline in `--mark`, no glow. Backdrop-filter is gone from the chrome bar; sticky position is enough.
5. **Reduced motion is honoured globally and meant.** Under `prefers-reduced-motion`, `transition-duration` is 0 ms and the gutter settle becomes an instantaneous reflow.

```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}
```

View transitions are used for one moment only: switching files. Crossfade the manuscript element with `view-transition-name: manuscript`, 220 ms, easing the same as layout. Nothing else opts in.

## Layout direction

Strong positions on the open questions.

**Layout: marginalia, not three-pane.** The right pane goes away. Notes live in the right gutter of the manuscript itself, vertically aligned with the anchor line, set in mono 13 px. This is the signature decision and it is non-negotiable. Three-pane shells are the visual default of dashboards; this product is not a dashboard. Facing-page (manuscript left, notebook right) was considered and rejected because it forces the eye to leave the prose to find a note, which is the exact friction the writer's audit complained about.

**Reading mode: scroll, with sectioning rules that feel like turning a page.** Long-form prose is read by scrolling; pagination is a skeuomorph that makes ctrl-F harder and disrupts highlights that span a page break. But scroll alone is undifferentiated. So `<hr>` between sections renders as a 1ch-wide centred rule at 30% opacity, with `var(--line) * 2.5` of breathing room above and below — the hint of a page break without the artifice. Section H2s get a hairline that runs the full column width; H1 (chapter title) gets the only thick rule in the document.

**File list: command palette by default; persistent sidebar on demand.** A sidebar with 32 chapters competes with the manuscript for attention; the v1 sidebar was the second-loudest thing on screen. Replace it with a `cmd-K` command palette that opens centred, dismisses on Escape, lists chapters with their note counts and resolved/open ratio. For the author who wants the persistent view, a single keystroke (`cmd-\`) pins the palette as a left rail, narrow (240 px), serif title + mono ratio. Default state: hidden. The author keeps the manuscript at the centre of the screen.

**The popover: replaced with an inline marginalia composer.** When the reviewer selects a passage, the gutter slot adjacent to that selection unfolds: an empty mono input, a category bar (six chips, keyboard-driven 1-6), a hint line. No floating popover. No edge-flip. The composer is in the gutter where the note will live anyway, so there is no perceptual jump from "I am writing a note" to "the note exists". Cmd-Enter saves; the composer turns into the saved note in place.

**Resolved notes: stay visible, desaturate, body hidden.** The writer's audit was clear: hidden by default loses history. So resolved notes remain in the gutter as a single-line meta entry: `L42-47 · accuracy · resolved`. Click to re-expand. There is no archive view, because there is no archive — the gutter *is* the archive. A filter in the chrome bar (`open / resolved / all`) lets the reviewer hide resolved if a session needs the gutter cleaner.

**Browser-not-supported gate: rebuilt as a typeset notice, not a card.** Full viewport, paper background, the same Sectra Display title as the chapter title would use, body in Sectra 19 px, a single ink-coloured "Copy this URL" button. No card, no border, no shadow. It looks like a printed front matter page. The current "card on a card on a tinted background" pattern is deleted.

ASCII sketch of the default layout:

```
+----------------------------------------------------------------------+
|  [ Bookwright ]              ch. 1 · why the ai act exists           |
|                                            open(31)  resolved(8)  ⌘K |
+--------+-----------------------------------------+-------------------+
|        |                                         |                   |
|        |  Chapter 1                              | L18-22  prose     |
|        |  Why the AI Act Exists                  | tighten the       |
|        |  ───────────────────────────────────    | second sentence   |
|        |                                         |                   |
|        |  Regulation (EU) 2024/1689 — the AI     | L34     citation  |
|        |  Act — is the first horizontal,         | recheck art 113   |
|        |  binding rulebook on artificial         | dates             |
|        |  intelligence anywhere in the world.    |                   |
|        |                                         | §2  meta          |
|        |  It was signed on 13 June 2024,         | section drags     |
|        |  published on 12 July 2024 …            | toward end        |
|        |                                         |                   |
|        |  ## Understanding why the EU regulated  | L60-66  resolved  |
|        |  ─────────────────────────────────      |                   |
|        |                                         |                   |
+--------+-----------------------------------------+-------------------+
```

## Information architecture

Where everything lives.

**App bar (top, 56 px, paper background, single 1 px hairline beneath).** Left: the wordmark "Bookwright" set in Sectra Medium 15 px. Right: chapter title set in Sectra Regular (truncated with text-overflow), then a counter `open(31) resolved(8)`, then a single icon-button row: status filter (open/resolved/all), command palette trigger, theme toggle, export. No "save review"; saves are continuous (the v1 audit's complaint about unsaved-state friction goes away if there is no manual save). The export button reads `export 31 notes` in lowercase mono, no icon. There is no separate workspace label; the chapter title is the chapter title, and the workspace path lives behind a mono badge inside the command palette.

**Manuscript (centre).** The reading column. Sectra 19 px, 62 ch measure, baseline-aligned. Section rules. No frames, no border, no shadow, no card. The paper background runs to the full viewport width.

**Margin (right gutter).** Anchored notes, chapter-level notes, section-level notes, the inline composer, and the resolved register. Mono 13 px. Each note is a vertical flex stack: meta line (line range or `§3` for section, category as lowercase tag, status), body (ranged-left, three-line clamped with click-to-expand), and a single icon row that appears on hover or focus (edit, resolve, delete). No card. No background. No border. Notes are separated by 1ch of empty space.

**File switcher (command palette).** Triggered by `cmd-K` or by clicking the wordmark. Centred modal, 540 px wide, paper background, single hairline border, no shadow. List of chapters: serif title left, mono ratio right (`31/8` = open/resolved). Up/down/enter; type to filter. `cmd-\` pins it as a 240 px left rail.

**Selection-to-note flow.** User selects text. The composer unfolds in the gutter, vertically aligned with the selection start. Focus is in the textarea. Number keys 1-6 set the category. `cmd-Enter` saves. `Escape` closes without saving. There is no popover, no flip-above-on-edge, no race condition with selectionchange because the composer is in the gutter, not over the selection.

**Orphan / chapter-level note flow.** Hit `n` to leave a chapter-level note (anchored to the H1). Hit `s` to leave a section-level note (anchored to the nearest H2 above the scroll position). The composer unfolds in the gutter at the heading's row. Same keyboard model.

**Edit-in-place.** Click a note's body. The body becomes a textarea pre-populated with the existing text, cursor at the click point if possible. `cmd-Enter` saves; `Escape` cancels. This is what the writer's audit demanded.

**Filter (chrome bar).** Three buttons: `open` `resolved` `all`. Plus a category multi-select that lives behind a single button labelled by count (`6 categories` collapses to `prose, accuracy +4` when narrowed). State stored in `localStorage`.

**Empty state.** When the workspace is opened for the first time, the manuscript area renders a typeset card-less notice: chapter-display-sized "Bookwright", a sub-line in mono ("read your manuscript like a book"), and a single ink button "open workspace". When a workspace is open but the file has no notes, the gutter shows one mono line near the top: `no notes on this chapter. select to add. n for chapter-level, s for section-level.` Six small category dots beneath. That is the entire empty state. No illustration.

**Permission-gate (the moment of first contact).** Full viewport. Sectra Display: "Bookwright reads files from your disk." Body in Sectra Regular: "This needs Chrome, Edge, Brave, or Arc. Your manuscript never leaves your machine." Then the single ink button "open workspace". When a workspace exists but permission lapsed: same surface, but the title becomes "Reconnect to AIAct-for-Techies" and the body names the path. No card, no shadow, no border. It reads like a frontispiece, not a dialog.

**Export.** Single button in the chrome bar, lowercase mono: `export 31 notes`. Click writes `reviews/YYYY-MM-DD-review.md` to the workspace and shows a small mono toast at the bottom centre: `wrote 2026-05-09-review.md · 31 notes`. Toast is paper background, single ink hairline, no fill.

## Component specifications

### Reading column

```html
<article class="manuscript" data-chapter="1">
    <header class="manuscript__masthead">
        <p class="manuscript__kicker">Chapter 1</p>
        <h1 class="manuscript__title">Why the AI Act Exists (and Why You Should Care)</h1>
    </header>
    <div class="manuscript__body" data-baseline-locked>
        <p class="block" data-line-start="15">Regulation (EU) 2024/1689 ...</p>
        ...
    </div>
</article>
```

```css
.manuscript {
    display: grid;
    grid-template-columns:
        [side-start] minmax(var(--gap-side), 1fr)
        [text-start] var(--measure-text)
        [text-end gap-start] var(--gap-column)
        [gap-end margin-start] var(--measure-margin)
        [margin-end] minmax(var(--gap-side), 1fr) [side-end];
    column-gap: 0;
    padding: calc(var(--line) * 4) 0 calc(var(--line) * 8);
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-prose);
    font-size: 1.1875rem;       /* 19 px */
    line-height: var(--line);
    font-feature-settings: "kern", "liga", "onum", "pnum";
    text-wrap: pretty;
    hyphens: auto;
    -webkit-hyphenate-limit-chars: 8 4 4;
}
.manuscript > * { grid-column: text; }
.manuscript .note,
.manuscript .composer { grid-column: margin; }

.manuscript__kicker {
    font-family: var(--font-margin);
    font-size: 0.6875rem;
    text-transform: lowercase;
    letter-spacing: 0.04em;
    color: var(--ink-3);
    margin: 0 0 calc(var(--line) * 0.4);
}
.manuscript__title {
    font-family: var(--font-prose);
    font-weight: 600;
    font-size: 3.25rem;
    line-height: 1.04;
    letter-spacing: -0.018em;
    margin: 0 0 calc(var(--line) * 1.5);
    padding-bottom: calc(var(--line) * 0.5);
    border-bottom: 1px solid var(--ink-thin);
}

.manuscript__body h2 {
    font-family: var(--font-prose);
    font-weight: 400;
    font-size: 1.625rem;
    line-height: 1.18;
    letter-spacing: -0.01em;
    border-top: 1px solid var(--ink-thin);
    padding-top: calc(var(--line) * 1.5);
}
.manuscript__body h3 {
    font-family: var(--font-prose);
    font-style: italic;
    font-weight: 600;
    font-size: 1.125rem;
    line-height: 1.3;
}
.manuscript__body hr {
    border: 0;
    text-align: center;
    margin: calc(var(--line) * 2.5) 0;
}
.manuscript__body hr::before {
    content: "·   ·   ·";
    color: var(--ink-3);
    letter-spacing: 0.6em;
    font-family: var(--font-margin);
}

.manuscript__body blockquote {
    font-family: var(--font-prose);
    font-style: italic;
    font-size: 1.0625rem;
    color: var(--ink-2);
    margin: var(--line) 0;
    padding: 0 0 0 calc(var(--gap-column) * 0.5);
    border-left: 1px solid var(--ink-thin);
}

.manuscript__body pre {
    font-family: var(--font-code);
    font-size: 0.875rem;
    line-height: 1.55;
    background: var(--paper-deep);
    color: var(--ink);
    padding: var(--line) calc(var(--gap-column));
    border-left: 2px solid var(--ink-thin);
    border-radius: 0;                 /* no rounded code wells */
    overflow-x: auto;
}
```

Hover, focus, empty:
- The block line-start gutter numbers (already emitted in the markup) sit in the left margin as 11 px mono at `color: var(--ink-3)`, opacity 0 by default, opacity 1 when the manuscript has `:focus-within` or the `View source lines` toggle is on. They are full opacity, not 50% (the v1 audit was right).
- No hover state on body text; the column should feel like a page, not a clickable surface. Selection is the only feedback.

### Anchored note (the marginalia)

```html
<aside class="note" data-id="..." data-status="open"
       data-category="accuracy" style="--offset-line: 412">
    <p class="note__meta">L34-37 · accuracy</p>
    <p class="note__body">Recheck the entry-into-force date against Art 113.</p>
    <div class="note__actions" hidden>
        <button>resolve</button>
        <button>edit</button>
        <button>delete</button>
    </div>
</aside>
```

```css
.note {
    grid-column: margin;
    position: relative;
    padding: 0 0 0 calc(var(--gap-column) * 0.5);
    border-left: 1px solid var(--ink-thin);
    font-family: var(--font-margin);
    font-size: 0.8125rem;
    line-height: 1.42;
    color: var(--ink);
    transform: translateY(calc(var(--offset-line, 0) * 1px));
    transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1),
                color 140ms ease-out;
}
.note__meta {
    color: var(--ink-3);
    font-size: 0.6875rem;
    margin: 0 0 0.4em;
    text-transform: lowercase;
    letter-spacing: 0.02em;
}
.note__meta::before {
    /* The category bracket — a 2 px coloured edge prepended to the meta line.
       Redundant channel: shape + colour. */
    content: "";
    display: inline-block;
    width: 2px;
    height: 0.85em;
    margin-right: 0.5em;
    transform: translateY(0.12em);
    background: var(--cat, var(--ink-3));
}
.note[data-category="prose"]     { --cat: var(--cat-prose); }
.note[data-category="accuracy"]  { --cat: var(--cat-accuracy); }
.note[data-category="citation"]  { --cat: var(--cat-citation); }
.note[data-category="structure"] { --cat: var(--cat-structure); }
.note[data-category="length"]    { --cat: var(--cat-length); }
.note[data-category="voice"]     { --cat: var(--cat-voice); }
.note[data-category="keep"]      { --cat: var(--cat-keep); }

.note__body {
    margin: 0;
    word-break: break-word;
    /* Three-line clamp with a click-to-expand button rendered by JS when overflow. */
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.note[data-expanded="true"] .note__body {
    -webkit-line-clamp: unset;
    display: block;
}

/* Focused note: the one the reviewer is currently looking at. */
.note[data-focused="true"] {
    border-left-color: var(--mark);
}
.note[data-focused="true"] .note__meta {
    color: var(--mark);
}

/* Resolved: desaturate, hide body. */
.note[data-status="resolved"] {
    color: color-mix(in oklch, var(--ink) 38%, transparent);
}
.note[data-status="resolved"] .note__body { display: none; }
.note[data-status="resolved"] .note__meta::after {
    content: " · resolved";
}

/* Hover and focus surface the actions. */
.note:hover .note__actions,
.note:focus-within .note__actions { display: flex; }
.note__actions {
    display: none;
    gap: 1ch;
    margin-top: 0.4em;
    font-size: 0.6875rem;
}
.note__actions button {
    color: var(--ink-3);
    text-transform: lowercase;
    letter-spacing: 0.02em;
    border: 0;
    padding: 0;
    background: none;
}
.note__actions button:hover { color: var(--ink); }
```

The corresponding inline highlight in the manuscript is a 2 px-thick coloured underline (not a fill), with the fill applied at low alpha only when the note is focused:

```css
.hl {
    text-decoration: underline 2px var(--cat, var(--ink-3));
    text-underline-offset: 0.18em;
    text-decoration-skip-ink: none;
    cursor: pointer;
    transition: background 140ms ease-out;
}
.hl[data-focused="true"] {
    background: color-mix(in oklch, var(--cat) 22%, transparent);
}
```

This is the v1 audit's "redundant channel" point taken seriously: a colour-blind reviewer reads category by underline-colour-and-shape *plus* meta tag, never by tint alone.

### Orphan / chapter-level note composer

```html
<form class="composer" data-anchor="chapter">
    <p class="composer__meta">§ chapter · new note</p>
    <textarea class="composer__body"
              placeholder="What about this chapter? (1–6 to categorise. ⌘↵ to save.)"
              autofocus></textarea>
    <div class="composer__cats" role="radiogroup">
        <button type="button" data-cat="prose">prose</button>
        <button type="button" data-cat="accuracy">accuracy</button>
        <button type="button" data-cat="citation">cite</button>
        <button type="button" data-cat="structure">struct</button>
        <button type="button" data-cat="length">length</button>
        <button type="button" data-cat="voice">voice</button>
        <button type="button" data-cat="keep">keep</button>
    </div>
</form>
```

```css
.composer {
    grid-column: margin;
    border-left: 1px solid var(--mark);
    padding: 0 0 0 calc(var(--gap-column) * 0.5);
    font-family: var(--font-margin);
    font-size: 0.8125rem;
    color: var(--ink);
    animation: composer-fade 90ms ease-out both;
}
@keyframes composer-fade {
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: translateY(0); }
}
.composer__meta {
    color: var(--mark);
    font-size: 0.6875rem;
    margin: 0 0 0.4em;
    text-transform: lowercase;
}
.composer__body {
    width: 100%;
    min-height: calc(var(--line) * 3);
    border: 0;
    background: transparent;
    resize: vertical;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    line-height: 1.42;
    caret-color: var(--mark);
    padding: 0;
}
.composer__body:focus { outline: 0; }
.composer__cats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6em;
    margin-top: 0.6em;
    font-size: 0.6875rem;
    color: var(--ink-3);
    text-transform: lowercase;
}
.composer__cats button {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    border-bottom: 2px solid transparent;
}
.composer__cats button:hover { color: var(--ink); }
.composer__cats button[aria-checked="true"] {
    color: var(--ink);
    border-bottom-color: var(--cat-current, var(--mark));
}
```

For an anchored composer (text selected), the only difference is that `.composer__meta` reads `L34-37 · new note` and the underline already exists in the manuscript at the selection. The anchor and composer share the same row by default; if the composer gets too tall, JS pushes following notes down with the same gutter-settle transform.

Empty: placeholder is the only content (no separate help text). Hover: no change. Focus: caret is `--mark`, no border highlight, no glow.

### File switcher (command palette)

```html
<dialog class="palette" data-state="closed">
    <div class="palette__head">
        <input class="palette__search" placeholder="open chapter, file, or section">
        <kbd class="palette__hint">esc</kbd>
    </div>
    <ol class="palette__list">
        <li>
            <button>
                <span class="palette__title">Why the AI Act Exists</span>
                <span class="palette__path">01-why-ai-act-exists.md</span>
                <span class="palette__ratio">31/8</span>
            </button>
        </li>
    </ol>
</dialog>
```

```css
.palette[open] {
    position: fixed;
    inset: 12vh auto auto 50%;
    transform: translateX(-50%);
    width: min(540px, 92vw);
    max-height: 70vh;
    background: var(--paper);
    border: 1px solid var(--ink-thin);
    border-radius: 0;
    box-shadow: none;
    padding: var(--line);
    color: var(--ink);
    font-family: var(--font-chrome);
    font-size: 0.8125rem;
}
.palette::backdrop {
    background: color-mix(in oklch, var(--paper) 70%, transparent);
}
.palette__search {
    width: 100%;
    border: 0;
    border-bottom: 1px solid var(--ink-thin);
    padding: 0 0 0.6em;
    background: transparent;
    color: var(--ink);
    font-family: var(--font-prose);
    font-size: 1.1875rem;
    line-height: 1.4;
    caret-color: var(--mark);
}
.palette__search:focus { outline: 0; border-bottom-color: var(--mark); }
.palette__list { margin-top: var(--line); }
.palette__list button {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    align-items: baseline;
    column-gap: 1ch;
    width: 100%;
    text-align: left;
    padding: 0.5em 0;
    border: 0;
    background: none;
    color: inherit;
}
.palette__title {
    font-family: var(--font-prose);
    font-size: 1.0625rem;
    grid-column: 1;
    grid-row: 1;
}
.palette__path {
    font-family: var(--font-margin);
    font-size: 0.6875rem;
    color: var(--ink-3);
    grid-column: 1;
    grid-row: 2;
}
.palette__ratio {
    font-family: var(--font-margin);
    font-size: 0.8125rem;
    color: var(--ink-2);
    grid-row: 1 / span 2;
    grid-column: 2;
}
.palette__list button:hover,
.palette__list button[aria-selected="true"] {
    background: var(--mark-soft);
}
```

Pinned-rail mode (`cmd-\`) reuses the same markup, restyled to a 240 px left column that pushes the `.manuscript` grid right by adjusting `--gap-side`. Same component, two layouts; keystroke flips between them.

### App chrome

```html
<header class="chrome">
    <div class="chrome__left">
        <button class="chrome__brand">Bookwright</button>
        <span class="chrome__sep" aria-hidden="true">/</span>
        <span class="chrome__chapter">ch. 1 · why the ai act exists</span>
    </div>
    <div class="chrome__right">
        <div class="chrome__filter" role="group">
            <button aria-pressed="true">open</button>
            <button>resolved</button>
            <button>all</button>
        </div>
        <span class="chrome__count">31 notes</span>
        <button class="chrome__icon" title="command palette">⌘K</button>
        <button class="chrome__icon" title="theme">◐</button>
        <button class="chrome__action">export 31</button>
    </div>
</header>
```

```css
.chrome {
    height: 56px;
    padding: 0 calc(var(--gap-side));
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-chrome);
    font-size: 0.8125rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--ink-thin);
    position: sticky;
    top: 0;
    z-index: 10;
    /* No backdrop-filter. Sticky paper is enough. */
}
.chrome__brand {
    font-family: var(--font-prose);
    font-weight: 600;
    font-size: 0.9375rem;
    letter-spacing: -0.005em;
}
.chrome__sep { color: var(--ink-3); margin: 0 0.6em; }
.chrome__chapter {
    color: var(--ink-2);
    font-size: 0.8125rem;
    text-transform: lowercase;
}
.chrome__filter {
    display: flex;
    gap: 1.4ch;
    color: var(--ink-3);
    text-transform: lowercase;
}
.chrome__filter button {
    border: 0;
    padding: 0;
    background: none;
    color: inherit;
    border-bottom: 2px solid transparent;
}
.chrome__filter button[aria-pressed="true"] {
    color: var(--ink);
    border-bottom-color: var(--mark);
}
.chrome__count {
    font-family: var(--font-margin);
    font-size: 0.75rem;
    color: var(--ink-3);
}
.chrome__icon {
    color: var(--ink-2);
    padding: 0.4em 0.6em;
    font-family: var(--font-margin);
    font-size: 0.75rem;
}
.chrome__icon:hover { color: var(--ink); }
.chrome__action {
    color: var(--ink);
    border-bottom: 1px solid var(--ink);
    padding: 0 0 0.15em;
    font-family: var(--font-margin);
    font-size: 0.8125rem;
    text-transform: lowercase;
}
.chrome__action:hover { border-bottom-color: var(--mark); color: var(--mark); }
```

There is no save button. Notes persist on every change. The chrome's "save" affordance becomes "export", which is the artefact the writer's audit said matters.

### Selection-to-note flow

1. Reviewer drags a selection in `.manuscript`. `mouseup` (not `selectionchange`) resolves the selection. The 140 ms debounce in v1 is gone, killing the race condition the v1 audit flagged.
2. JS calculates the line-start offset of the selection's bounding rect relative to the manuscript top, sets `--offset-line` on a freshly inserted `.composer`, and inserts the composer into the gutter.
3. Composer fades in (90 ms). Textarea has focus.
4. Reviewer types. `1`-`6` (and `7` for keep) at the start of the textarea, before any text input, set the category; if the textarea has content, those keys insert literal characters as expected (single-key shortcuts only fire when the textarea is empty or the focus is on the category radiogroup).
5. `cmd-Enter` saves. The composer transforms in place into a `.note` (no swap, no new element entering — just `data-state` change and a class rename so the DOM continuity is preserved). The underline in the manuscript switches from "draft" (1 px dashed) to permanent (2 px solid).
6. `Escape` cancels. Composer fades out (90 ms). Manuscript loses the draft underline.

Empty / no-selection variant: keys `n` (chapter) and `s` (section, anchored to nearest H2 above current scroll position) trigger the same composer at the heading's row. The composer's `data-anchor` attribute changes; nothing else does.

## What dies

- The three-pane shell. Sidebar and right comments panel both go.
- The 320 px right comments panel, including its header, its empty-state message, and its rounded comment cards.
- The category pill badges (rounded `999px`, all-caps tinted background). Categories become a meta tag plus a 2 px coloured edge.
- The cream paper background `#fbf8f1`. Replaced by a calibrated paper in OKLCH.
- Iowan Old Style. Replaced by Sectra (Source Serif 4 fallback).
- Inter. Replaced by GT America (Inter Tight fallback) for chrome only; not used in body.
- The blue accent `#1f6feb`. Replaced by an ink-red `--mark`, used sparingly.
- The popover's `pop-in` keyframe and 220 ms scale-in. Composer fades 90 ms, no scale.
- The popover entirely. Replaced by an inline gutter composer.
- The `backdrop-filter: blur` on the app bar. Sticky paper-coloured bar with a 1 px ink-thin rule.
- Stacked decoration: `border + box-shadow + tinted background` on every card. Replaced by hairlines and whitespace.
- Rounded corners on code wells, comment cards, and the browser-gate card. Code wells get a 2 px left rule, no border, no radius. The browser gate stops being a card.
- Headings in sans-serif. The whole hierarchy is Sectra; no Inter inside the manuscript.
- The "save review" button. Saves are continuous; export is the explicit action.
- The `comments-panel__empty` message ("Highlight any passage in the reader, then leave a note."). Replaced by a single mono line in the gutter and the absence of a panel.
- The brightness-flash focus animation. Focused note hairline goes to `--mark`; the manuscript line-start gutter number wakes up; nothing pulses.
- The gradient-tinted comment_card border-strong hover lift `translateY(-1px)`. Notes do not lift; they have no card to lift.
- The shadow tokens `--shadow-1/2/3`. Deleted. Nothing in the new design casts a shadow.
- The "Bookwright. Margin notes for living manuscripts." overwrought title. Title becomes `<chapter title> · Bookwright`, set dynamically.
- The `comment-count` pill with `border-radius: 999px`. The chrome's count is mono text, no fill.
- The eight-symbol icon row in the chrome. Replaced by three text actions (`open / resolved / all`), one count, two minimal icon-buttons (palette, theme), and the export action.
- "No markdown files found" leaking into the sidebar while the reader still says "Open a workspace to begin". The workspace empty-state is now a single full-viewport notice.

## References

- **Craig Mod's typesetting work (specifically his pop-up newsletters and the Special Projects books).** Taken: the conviction that a reading surface should be set with the discipline of print. Applied to: the baseline grid (30.4 px line, every block aligns), the choice to put a single rule under the chapter title and nothing else, the absence of cards.
- **iA Writer.** Taken: refusal to decorate. Applied to: the chrome (no icons where text will do), the kill-list of shadows and tints, the calibrated paper background instead of cream-as-mood.
- **Edward Tufte's Tufteian sidenotes (and the Tufte CSS implementations of them).** Taken: notes as marginalia, vertically aligned with the line they comment on, in a contrasting face. Applied to: the entire signature move. This is the structural inheritance, made dynamic.
- **Read.cv.** Taken: the comfort of an editorial serif used for body and titling, with monospaced metadata as the only contrast. Applied to: the type pairing (Sectra everywhere in the manuscript, mono for marginalia and meta).
- **Pitchfork's 2023 redesign.** Taken: serif used at large display sizes without italic-affectation, hairline rules under headlines, no decorative furniture. Applied to: the chapter masthead (kicker + Sectra Medium 52 px + single rule).
- **Are.na.** Taken: the discipline of a UI built from text and rules instead of buttons and panels. Applied to: the chrome (filter as inline text-with-underline, count as mono), the command palette (no icons), the export action (text with a hairline beneath, not a button).
- **Robin Rendle's writing on web typography (the *Pace and Pause*, *Things I want from a CMS* essays).** Taken: the position that web reading should commit to a measure and a rhythm or it is not a reading surface at all. Applied to: the 62 ch measure, the 30.4 px baseline rhythm, the decision that section breaks render as a centred rule instead of a generic `hr`.
