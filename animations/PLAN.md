# Logo morph animation: ANTHROPIC → ant

Status: **planned and prepared, not built.** Everything below marked ✅ exists in this folder.

## Goal
A short intro (~3 s) that starts as the Anthropic wordmark, sheds `THROPIC` down to `ANT`, becomes lowercase `ant`, flickers through a handful of typefaces, and lands on Ant's real logo (the heavy serif "ant" from `docs/refs/ant-inspo.png`).

## What we have

| Asset | Where | Notes |
|---|---|---|
| ✅ Anthropic wordmark, vector, exact | `assets/source/anthropic-wordmark.svg` | Wikimedia Commons "File:Anthropic logo.svg", licence tag **PD-Textlogo**. 1024.2×115 viewBox, fill `#1f1f1e`. This is the uppercase `ANTHROPIC` with a slash in place of the I (the 2021 identity), not a font, so it is already 1:1. |
| ✅ Per-letter paths | `assets/letters/anthropic-letters.json` | 9 paths with bbox and letter label, ordered by x: A N T H R O P `\` C. **A, N, T are the first three letters**, so "shortening to ANT" means removing the other six. |
| ✅ Ant wordmark traced from the reference | `assets/ant/ant-wordmark-traced.svg`, script `assets/ant/trace_ant.py` | 482×218 viewBox, `#faf9f5`. Traced from a ~490 px-wide crop, so edges are slightly stair-stepped even after smoothing. Fine for 3 s of motion; replace the source for production (see Open questions). |
| ✅ Font candidates ranked against the ant logo | `font-match/match.py`, `ranking.json`, `sheet.png` | IoU of each open-licence font's `ant` vs the reference mask. Best: Bitter 900 (0.846), Source Serif 4 900 (0.841), Rokkitt 800 (0.834), Roboto Serif 900 (0.833), Eczar 800 (0.830), Aleo 900 (0.830). Nothing reaches 1.0: the real logo is heavier and tighter (letters touch) than any stock font, so the **final frame must be the traced path, not a font**. |

## Font facts (so nobody wastes time)
- The Anthropic **wordmark is not set in a published font**; use the SVG. Anthropic's brand typefaces are custom (Anthropic Sans / Serif / Mono, by Chester Jenkins at BSPK); the earlier identity used Styrene (Commercial Type) and Tiempos (Klim). Copies on font-download sites are almost certainly unlicensed, so **do not bundle them**.
- Ant's UI fonts are already Poppins (UI) and Lora (text), per `CLAUDE.md`. The sidebar currently renders "ant" in Lora 700 (`Sidebar.svelte` `.wordmark`), which does **not** match the inspo logo. Swapping that for the traced SVG is a follow-up task once this animation exists.

## Timeline (3.2 s, adjustable; times are starts)

| t (s) | Beat | What moves |
|---|---|---|
| 0.00 | **Hold ANTHROPIC** | Wordmark in `#faf9f5` on `#141413`, small fade/scale-in. |
| 0.60 | **Shed THROPIC** | H R O P `\` C each scale to 0 on x, fade, staggered right-to-left (50 ms apart); A N T stay put. The row recentres on A N T (width 0→349 of 1024). |
| 1.25 | **ANT → ant** | Per-glyph path morph uppercase → lowercase in a matching sans (nearest open geometric grotesque to the wordmark; pick with the same IoU method against the A/N/T outlines). |
| 1.55 | **Font flicker** | 6–8 typefaces, ~90–110 ms each, no easing between (hard cuts feel like a slot machine). Order moves from sans toward heavy serif: sans → mono → light serif → Lora 400 → Lora 700 → Source Serif 4 900 → Bitter 900. Each step is a path swap with a 1-frame scale/skew jolt. |
| 2.45 | **Lock to logo** | Last font morphs into the traced `ant` path over 350 ms with `--ease-spring`; tracking collapses so n and t touch as in the logo. |
| 2.95 | **Settle** | Tiny overshoot, then hold 250 ms. Optional: ants (`<Ant />`) pop in around it (like the reference image). |

Animate `transform` and `opacity` for everything except the morph itself (path `d` interpolation); keep the morph to ≤3 paths on screen so it stays 60 fps. Respect `prefers-reduced-motion` by rendering the final frame only.

## Build approach

1. **Glyph outlines.** `fonttools` → SVG `d` for each of `a n t` (and `A N T`) in every flicker font. Cache as JSON in `assets/fonts/outlines.json`. Fonts come from Fontsource (`@fontsource/*`) or Google Fonts, all OFL; no network needed at runtime.
2. **Path normalisation.** All glyphs to a shared box (the ant logo's 482×218), same winding and start point, resampled to the same segment count (flubber `interpolate()` with `maxSegmentLength`, or hand-rolled with `svg-path-properties`). The 'a' counter is a second subpath: pad single-contour glyphs with a collapsed dummy contour.
3. **Timeline.** One GSAP timeline (or Svelte `tweened` + `requestAnimationFrame`) driving a tiny state: `{progress, stage}`. No framework dependency in the logic so it can render headlessly.
4. **Deliverables**
   - `AntIntro.svelte` (drop-in splash for `web/src/features/`), props `{ onDone, skippable }`, click/Esc skips.
   - `render.mjs`: Chromium headless frame capture → ffmpeg → `ant-intro.mp4`/`.webm`/`.gif` for README and social. (`chromium`, `ffmpeg`, `rsvg-convert` are installed on this machine.)
   - Optional Lottie export only if a designer will edit it; otherwise skip.
5. **QA.** Frame-sample at 0, 0.6, 1.25, 1.55, 2.45, 3.2 s and diff the last frame against the traced SVG; check 60 fps in Chromium performance panel; check reduced motion.

## Task list (in order)
1. [ ] Pick the lowercase sans for step 3 (run `match.py`-style IoU on uppercase A/N/T vs candidate sans fonts).
2. [ ] Generate glyph outline JSON for the flicker fonts (`fonttools`).
3. [ ] Prototype the morph in a standalone `preview.html` (no build step) and iterate on timing.
4. [ ] Port to `AntIntro.svelte` using `lib/motion.ts` easing tokens; wire to first launch (and reduced-motion fallback).
5. [ ] Replace the sidebar's Lora "ant" with the traced SVG wordmark.
6. [ ] `render.mjs` and exports.

## Open questions for you
1. **Which Anthropic logo?** The public-domain vector available is the uppercase `ANTHROPIC` with a slash in place of the I. If you meant a newer/different mark (e.g. the Claude wordmark or a lowercase version), I need the file; I can't fetch an official asset from anthropic.com (their brand page 404s).
2. **Better source for `ant`.** The reference PNG is low-res. If you have the original vector or a ≥2000 px export, drop it in `assets/ant/` and I'll re-trace; otherwise the current trace is the ceiling for "pixel-accurate".
3. **Where does it play?** First launch only, every launch, or the loading state while antd connects? And should it have sound?
4. **Trademark.** The wordmark is tagged public domain on Commons (below the threshold of originality), but Anthropic's trademark still stands. Fine as an in-app intro that visibly morphs into Ant; I'd keep it out of the app icon, store listings and anything implying affiliation.

## Sources
- Wordmark file and licence: https://commons.wikimedia.org/wiki/File:Anthropic_logo.svg
- Identity agency write-up (Styrene + Tiempos, slash detail): https://geist.co/work/anthropic
- Anthropic custom type family (BSPK): https://gooova.com/en/anthropic-designed-its-own-type-family/
