# Writer's audit: Bookwright

## Verdict

For a single one-hour pass on a single chapter, Bookwright is honestly better than VS Code preview plus a chat window: it gets out of your way, the popover is fast, the export is the right artefact for the AI handoff, and the line-anchored quotes are the kind of thing you would otherwise hand-stitch. It will not yet survive a real review cycle, though. The first time you reopen yesterday's notes and try to mark half of them done, or try to write a "this whole section drags" note without picking a passage, or wonder which of your 41 notes you have already actioned, you will feel the tool pushing back. Right now this is a one-shot capture tool that pretends to be a review tool. Authors who do one-pass-then-export will keep using it. Authors who iterate (most book authors) will fall back to red pen on a printout within two sessions, because paper at least lets you tick boxes.

## What this tool gets right

1. **Line-anchored verbatim quotes in the export.** Reading `exporter.js`, every note carries `filePath`, nearest heading, line range, and the exact selected text. That is the format a downstream reviser actually needs. Markdown line numbers are stable across Bookwright sessions because front matter is counted (per README), so `lines 42 to 47` survives a re-pick of the workspace. This is the load-bearing decision and it is right.
2. **One file per session, deterministic ordering.** Sort by file path then by line. An author can diff two review files, or stack three sessions on one chapter, without the AI getting confused about ordering. That is how a working reviewer thinks about their own notes.
3. **Cmd+Enter saves, Escape closes, popover auto-focuses the textarea.** The hotkey trio is what makes a note take 4 seconds instead of 12. Over 40 notes per chapter that is the difference between finishing a session and abandoning one.
4. **Frontmatter hidden from the rendered view but counted in line numbers.** Subtle and correct. The author reads what the reader will read; the export points the AI at lines that match the source on disk. Most home-built reviewers get this wrong.
5. **Workspace-folder model, not upload model.** The author keeps editing in their normal toolchain and refreshes Bookwright. No copy, no paste, no stale fork. This is the only way an author tolerates a second tool in the loop at all.

## Workflow gaps

### [blocker] No way to leave a note that is not anchored to a passage

**The moment it bites:** You finish reading section 3 of chapter 1. The whole section is fine line by line, but the cumulative effect drags: too many cross-references to chapter 2, the reader will have lost the thread by the penalty table. There is no passage to highlight. The thought is about the section, not a sentence in it. Right now you have two bad options: invent a fake highlight on a random sentence, or open VS Code and write the note somewhere else. Both will happen. Both lose the note.

**Why it matters:** Section-level and chapter-level reactions are where the highest-value editorial moves live: cuts, reorders, "this whole side trip into Article 25 belongs in chapter 2 not here." A tool that only captures sentence-level prose nits silently steers you toward sentence-level prose nits. Look at chapter 1 and notice: the most important questions are "is the dual-mission framing in section 1 doing too much work?" and "does the penalties section deserve its own chapter?" Neither question lives at any single line.

**Fix:** Add a "note this chapter" button (or `n` key) that opens the same popover with `lineStart/lineEnd` set to the H1 line and a category of `chapter`. Same for `section` (anchored to the nearest H2). The export already handles "no nearest heading" gracefully, so this is mostly a UI affordance plus one new category.

### [blocker] Notes have no resolved state and cannot be edited

**The moment it bites:** Tomorrow morning you reopen the chapter, see your 41 notes from yesterday, and want to do three things: tick the eight you have already addressed in your head overnight, sharpen the wording of three notes you wrote at midnight, and add five new ones. You cannot do any of the first two. `commentPanel.js` only deletes; the README's roadmap admits "edit existing notes in place" is not built. So you delete and rewrite, or you live with stale notes in tomorrow's export, or you keep a parallel TODO outside the tool. Within two sessions you stop trusting the notes panel.

**Why it matters:** Multi-pass review is the actual workflow for a 32-chapter book. A solo author rarely reviews a chapter once and ships. They review, partially fix, re-read, re-review. A capture-only tool forces the author to flush every session into a downstream reviser before they can think again. That is the opposite of the README's "collapse the loop" pitch.

**Fix:** Two things. (1) Add a `status` field to the annotation: `open | resolved | wontfix`. Show resolved notes muted in the panel and excluded from the default export (with a flag to include them as a changelog appendix). (2) Make notes editable in place: click the panel card body, edit, save. Both the model and the renderer support this with small additions; `Annotation.update` already exists and is unused.

### [major] No orphan thoughts, no chapter-level summary, no bookmarks, no positive notes, no missing-thing notes

**The moment it bites:** Six concrete review situations that map to nothing in the current taxonomy or workflow:
1. "There should be an Implementation box here showing the YAML for an AI Act fine runbook." (missing thing, no passage to anchor to)
2. "Keep this exact phrasing about 'the Act follows the system, not the company.' Do not let the AI smooth it." (positive note, currently no way to express)
3. "Look up: did Italy actually contemplate a sectoral rule before the AI Act, or am I generalising from press coverage?" (todo / verify-later, currently a `fact` note but it is really an open task for the author, not a change request to the AI)
4. "Come back to this paragraph after I have drafted chapter 2; the cross-reference may need rewording." (bookmark, no anchor for "future me")
5. "Overall this chapter is too long. Worth splitting around the penalties section?" (chapter-level structural)
6. "Tone-wise this section feels more punchy than Dibble. Compare to the §18 example in STYLE.md." (a meta-note about voice)

**Why it matters:** A reviewer who cannot capture (1)-(6) in the tool will capture them somewhere else, and then half the review is in Bookwright and half is in Bear or Apple Notes. The export becomes incomplete and the whole "one file to the AI" promise breaks.

**Fix:** Three additions. (1) An "orphan note" creation path (covered by the chapter-level note above). (2) Two new categories or a parallel "tag" axis: `todo` (private to author, do not ship to AI) and `keep` (positive note, ship to AI as "do not change"). (3) A `bookmark` flag, separate from category, that lets you save a passage with no comment and re-open the chapter scrolled to it. The annotation model is small enough that adding a `tags: string[]` field is cleaner than multiplying categories.

### [major] The export is a one-shot file with no roundtrip

**The moment it bites:** You hand `2026-05-09-review.md` to the drafter agent. It applies eleven changes. Six it does well, three it does mediocre, two it refuses or punts. You now have no way to mark which were applied. Tomorrow you re-run the chapter through Bookwright and have to remember by hand which of yesterday's notes are still live.

**Why it matters:** The README pitches Bookwright as the input to the drafter agent, but the loop is not closed. A real review tool needs a way to ingest "here is what changed" so the next session opens with five remaining notes, not 41 ghost notes plus eleven new ones. Without this, the export grows monotonically and the author starts pruning by hand in VS Code, which is exactly the workflow the tool was meant to replace.

**Fix:** Two paths, pick one. The cheap one: when you re-export a session for the same chapter, generate a delta (`new since last export`, `still open`, `closed`) by hashing on `quote + heading + body`. The right one: have the drafter agent write `reviews/2026-05-09-review.applied.md` with each note marked `applied | skipped | needs-followup`, and have Bookwright read it back to flip annotation status on next load. The second path makes Bookwright a real review loop instead of a one-way capture form.

### [major] Highlights silently vanish when the source moves

**The moment it bites:** You highlight a sentence on line 42, write the note, switch to chapter 2 to check a cross-reference, come back. Meanwhile the drafter has rewritten the sentence (or you fixed a typo two lines above and shifted line 42). The README admits this: "stale highlight; reload the file and the missing match is silently skipped." So your note still exists in the panel but the highlight on the page is gone, and on next reload the export still references `lines 42 to 47` of a passage that no longer reads that way.

**Why it matters:** The author loses trust in the panel. Worse, the export hands the AI a verbatim quote that no longer matches the source on disk, and the AI either guesses or refuses. Either way you find out at the worst time: when the revised draft lands and four of your changes were ignored.

**Fix:** When a highlight cannot be re-anchored on file load, show the note in the panel marked `stale` with the original quote and the new line number guess (fuzzy match on the quote string). Let the author confirm the new anchor with one click, or convert the note to chapter-level so it does not get lost. Do not silently skip.

### [minor] No way to read the review file back inside Bookwright

**The moment it bites:** You exported yesterday. You want to skim what you said before starting today's pass on chapter 2, because chapter 2 is going to surface chapter 1 dependencies. The review file is on disk but Bookwright does not show it. You open it in VS Code, which is the tool you were trying to escape.

**Why it matters:** The author's actual mental model is "what have I been telling the AI to fix lately?" That is a queryable history, not a dead file.

**Fix:** Surface `reviews/` as a virtual folder in the sidebar, rendered read-only. Bonus: render notes as backlinks on the chapter file when you re-open it ("3 notes on this chapter from May 5, May 7, May 9").

### [minor] Reading 2,000 words pulls toward annotation, not toward reading

**The moment it bites:** You open chapter 1 (about 4,500 words). The popover triggers on every selection. Selection is a thing readers do for many reasons: copying a phrase to think about, double-clicking to look up a word, dragging to keep your place. Each one fires `onSelectionMade` (debounced 140ms but still firing), pops a popover, demands a category. You quickly learn to not select. Which means you stop the reading instinct of marking up as you go.

**Why it matters:** A review tool should encourage actual reading. The current UX trains you to select only when you have already decided to leave a note, which inverts the natural rhythm: read, react, capture. You start composing notes in your head before you have finished the paragraph.

**Fix:** Two-step selection. First selection: show a small unobtrusive "annotate" affordance near the selection (the Medium / GoodReader pattern). Click or hit `a` to open the popover; otherwise dismiss on next selection. Costs nothing, gets out of the way of pure reading.

### [minor] No keyboard navigation between notes

**The moment it bites:** You finish writing 41 notes, panel-scroll to find note 7 because you remember it was the one about Recital 6, click on it to scroll the reader. That click works. But you cannot `j/k` or arrow through notes, cannot search the panel, cannot filter by category. With more than ~20 notes the panel becomes a wall.

**Why it matters:** A long-form chapter with detailed review will routinely produce 30 to 80 notes. The panel is the author's review map. A wall is not a map.

**Fix:** Filter chips at the top of the panel (one per category plus an "open / resolved" toggle), a search input, and `j/k` to step through and focus the corresponding mark in the reader.

### [minor] No idea how many notes I have left to write before I am done

**The moment it bites:** Halfway through a 90-minute review session, you do not know if you are at note 12 of 30 or note 12 of 70. You cannot tell whether you are pacing right. The header shows total notes; that is not the same as progress.

**Why it matters:** Pacing matters for sustainable reading. Without a sense of how far through the chapter you are by content (not just by scroll position), it is easy to over-annotate the first third and run out of energy for the last third, where the most important structural notes usually live.

**Fix:** A reading-progress indicator (scroll position vs document length) is a 10-line addition and changes the felt experience materially. Bonus: notes-per-thousand-words density readout, so the author can spot when they have gone into nit-pick mode and need to step back.

### [nice-to-have] No "review brief" at the top of the export

**The moment it bites:** You hand the review file to the drafter agent. The agent has 41 line-anchored notes and zero context. It does not know you spent the session focused on tightening section 1, that you want all `prose` notes treated as suggestions rather than directives, or that two notes contradict each other and you want the agent to ask before resolving.

**Why it matters:** The drafter agent will do better work with 60 seconds of human framing at the top of the file than with another 10 line-anchored notes.

**Fix:** Optional "session note" textarea, one per session, written to the front matter or as a top-level paragraph above the per-file sections. Read in `commentPanel.js` as a separate top-level affordance, not anchored to any file.

### [nice-to-have] No way to mark a category as the chapter's dominant problem

**The moment it bites:** You finish chapter 1 with 41 notes. You realise 28 are `prose`. The structural notes are buried. The drafter agent will treat all 41 with equal weight and spend its budget on commas.

**Why it matters:** Reviewers prioritise. Tools that flatten priority make the reviewer feel responsible for the prioritisation in prose rather than in metadata, which is more work for the same result.

**Fix:** A note-level priority (`P1 / P2 / P3` or `must / should / nit`), surfaced in the export. One field, three values, large effect on downstream behaviour.

## Category taxonomy review

The current six are not bad as a starter set but they conflate two axes (what kind of problem and what kind of action) and miss a couple of common review acts.

| Category | Verdict | Reasoning |
|---|---|---|
| `prose` | **Keep.** | Load-bearing. The category that catches the most notes. |
| `fact` | **Keep, but rename to `accuracy`.** | "Fact" reads narrow. In an AI Act book the natural bucket includes Article numbers, citation fidelity, paraphrase drift, and `cite.py` `⚠️` results, not just "this fact is wrong." `accuracy` covers all of it without losing meaning. |
| `structure` | **Keep.** | Distinct from `cut`/`expand`: structure is "this belongs elsewhere" or "this is in the wrong order", not "shorter / longer". |
| `cut` | **Merge with `expand` into `length`.** | These are two values of one variable. Forcing them as siblings of `prose` and `fact` makes the picker feel arbitrary. A `length: cut` versus `length: expand` (or just a free-text comment with a clear verb) is cleaner. |
| `expand` | **Merge with `cut` (see above).** | Same. |
| `other` | **Keep, but make it last in the picker and rename to `meta`.** | "Other" invites laziness. "Meta" frames it as "this is about the chapter, not the passage" and pairs naturally with the chapter-level note workflow above. |

New categories worth adding:

- **`voice`** — distinct from `prose`. A `prose` note says "this sentence is muddled." A `voice` note says "this paragraph sounds like a consultant's slide deck, not Dibble." Given the project explicitly anchors voice in `STYLE.md` §1 and §18, voice deserves its own bucket. Otherwise voice notes get filed under `prose` and the drafter agent applies sentence-level edits when the real fix is register.
- **`citation`** — distinct from `accuracy`. Citation notes are highly mechanical: missing `cite.py` cross-reference, wrong Article number, page reference goes stale. They deserve their own category because their resolution path is mechanical (re-run `cite.py`) and the drafter agent can act on them differently from a prose accuracy claim.
- **`gdpr-bridge`** — project-specific. Given that the GDPR bridge is the author's stated USP and chapters carry a `gdpr_bridge: true|false` flag, a category for "this is a place where a GDPR bridge belongs and is missing" or "this bridge is half-baked" is high-leverage. Currently those notes go to `structure` or `expand` and lose their tag.
- **`keep`** — positive notes. "Keep this exact phrasing." Not an action item; an instruction to the reviser to leave alone. Cheap to add, prevents the AI from over-editing.

So my recommended set: `prose / voice / accuracy / citation / structure / length / gdpr-bridge / keep / meta`. Nine items is more than six, but four of them (`citation`, `voice`, `gdpr-bridge`, `keep`) carry distinct semantics that the export consumer (the drafter agent) needs in order to do the right thing. The author can also pin a default category per session ("I am doing a fact pass today") to avoid clicking on every save.

## Output file critique

The exporter does the structural work right: deterministic ordering, frontmatter with totals, file-grouped sections, line-anchored quote blocks, category-tagged note headings. Reading `exporter.js`, the file an AI agent would receive on `2026-05-09` with 11 notes is exactly the artefact the README describes.

What is right:
- Sort by file then line. Stable across runs.
- Verbatim quote in a blockquote followed by the note body. The agent does not have to fetch the source to know what passage you mean.
- Heading + line range gives the agent two independent anchors. If the line range goes stale, the heading still locates the area.
- Frontmatter with `total_notes` and `files_reviewed` lets the agent reason about session size.

What is missing:
- **No author-level intent.** No top-of-file paragraph saying "this session focused on section 3" or "treat prose notes as suggestions, structure notes as directives." Even a single optional textarea would change the quality of the AI revision substantially.
- **No priority.** All notes look equal. Eighty-percent of editorial leverage comes from twenty-percent of notes. The export erases that signal.
- **No category-level instruction.** A `cut` note and a `fact` note are both bare prose under a `### Note 3: Fact` heading. The agent has to infer the action verb from the body. A small `_action: replace | delete | insert | verify | discuss_` field on each note would let the agent route work.
- **No status.** Every export contains every open note. There is no way to say "this is what I have decided since the last review file." See the roundtrip gap above.
- **No source file hash or version.** The export references `01-why-ai-act-exists.md` but does not pin a content hash. If the chapter has been edited since the export, the line numbers and quotes are still in the file but the agent cannot tell whether the source is the same source the reviewer was reading. A `git_hash` or `content_sha256` field per file in the frontmatter would close that hole. Reviewers writing across days will edit between sessions; the export needs to know.
- **`(no comment text)`** as a fallback is a footgun. A note with no body is either a bookmark or a category-only signal ("cut", "expand", with no further detail). The agent cannot distinguish those, and `_(no comment text)_` reads to the agent as missing data rather than intentional brevity. Either require a body or make the empty case mean something explicit.
- **`chapterTitle` in the H2 is shipped but never used elsewhere.** Fine, but if the H2 also carried part number (Part I, Part II) the agent would have a sense of where in the book this chapter sits. Cheap.

The bigger question, though, is whether this file is what the drafter agent actually wants. The current shape assumes the agent will read top-to-bottom and apply one note at a time. A different shape, where notes are grouped by file and within file by category, would let the agent batch all `accuracy` notes (which need `cite.py`) separately from `prose` notes (which need voice work). That is one schema change for materially better revisions. The current ordering by line number is intuitive for humans but probably suboptimal for agents.

## Bigger bets (optional)

### 1. Make Bookwright the persistent home of the manuscript's editorial state, not just a session capture form
Today Bookwright forgets you between sessions except by what is in IndexedDB. Tomorrow it could be the author's actual editorial dashboard: every chapter shows note count, most recent review date, open versus resolved breakdown by category, and a heat-map of where in the chapter notes cluster. The author opens Bookwright in the morning and immediately knows "chapter 7 has 14 open `accuracy` notes from last week, none resolved; that is today's work." This is a small UX shift and a large workflow shift, and it is what turns Bookwright from a tool you open occasionally into the place you live.

### 2. Two-way sync with the drafter agent, with a diff view
Right now the loop is: export, drafter applies changes, you read the new draft in Bookwright, you write new notes. The missing middle step is "show me what the drafter actually changed in response to each note." If the drafter writes back an `applied.md` per session that flips note statuses, Bookwright can render the panel as `41 notes: 27 applied, 9 skipped, 5 needs-discussion` and let the author iterate on the nine skipped ones without reading the whole revised chapter linearly. This is the difference between Bookwright as a file format and Bookwright as a review loop.

### 3. A "voice diff" sidebar that compares the chapter against `STYLE.md` automatically
The book has an unusually opinionated style guide (`STYLE.md` is 900 lines and has worked examples of right and wrong tone). A small static analyser could flag obvious mismatches as suggested annotations: heading not gerund-led, "let's dive in" present, em-dash count anomalous (project rule), unbolded glossary term on first appearance, `cite.py` `⚠️` not yet resolved. These would land in the panel as draft notes the author confirms or dismisses. It is a way of letting the style guide grade itself, and it would catch the kinds of issues a tired author misses on the fifth read of a chapter.
