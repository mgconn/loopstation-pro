# LoopStation Pro Sprint — Gemini builds, Grok Bot reviews

Started 2026-10-30 · Baseline HEAD (GitHub `main`) `2731e261ba6bfde54eab54b4769193555149d4a1` · Owner: Matt  
Live app: https://mgconn.github.io/loopstation-pro/  
Repo: `mgconn/loopstation-pro` (plain HTML/CSS/JS PWA: `index.html`, `style.css`, `app.js`, `sw.js`, `manifest.json`, `screens/`)

## Purpose
Make LoopStation Pro work better for users and improve aesthetic appeal. Tickets are grounded in the current UI/code. Do not invent net-new product features that already exist (multi-track sync, overdub, MIDI learn, sessions, WAV export, metronome, latency cal, PWA).

## Working protocol
1. Gemini fixes **one ticket per commit**. Commit message: `SPRINT-<id>: <short summary>` (e.g. `SPRINT-U1: move + Track into master bar`).
2. After each commit, Gemini appends one line under **Gemini log**: ticket, commit hash, what changed, how to test.
3. Grok Bot reviews new commits and appends under **Grok review** / the review log table: `PASS` or `CHANGES NEEDED` + specifics. A ticket closes only on PASS.
4. Matt stays in the loop: he approves priority changes and GitHub Pages deploys; either agent stops and asks Matt when unsure.
5. Stack rules (non-negotiable): keep it **plain HTML/CSS/JS PWA** — no frameworks, no build step, no server required for core use. Recordings never leave the device.
6. **Do not push to GitHub Pages / do not force-push `main` for a public deploy without Matt's explicit OK** (GitHub is opt-in per release). Local commits are fine; ask Matt before any public Pages update.
7. Suggested start order: **R2 → U1 → U2**, then the rest. **R1 (AudioWorklet)** is the large reliability ticket — do not leave it for last, but land the quick UX wins first.
8. When tickets are done (or a batch is ready for review), update `agent_signal.json` on Drive the same way as BioConsole so Grok's watcher picks it up.

**Done =** the code is committed under the `SPRINT-<id>` convention, every acceptance criterion is demonstrably met (with steps logged), the app still starts and records/plays in Chromium, and Grok review is marked PASS.

---

## Usability

### U1 · Promote "+ Track" out of the Sessions panel · P0
The "+ Track (max 8)" control lives inside the collapsed "Sessions, export & MIDI" `<details>` in `index.html`, so adding a track requires opening that panel. Move "+ Track" into the master bar or a sticky control above `#tracks` so it is always visible after Start.  
**Accept:** With both `<details>` closed, the user can add a track up to 8 without opening Sessions; the max-8 hint remains visible or in a tooltip.

### U2 · Confirm before Clear (and make Clear undoable via Undo stack) · P0
`doAct('…:clear')` in `app.js` wipes `layers`/`redo` with no confirm; session Delete already uses `confirm()`. Accidental Clear (button or Shift+C) is catastrophic mid-performance. Require a confirm on Clear, and/or push the cleared layers onto `redo` so one Undo restores them.  
**Accept:** Clear asks for confirmation (or equivalent safe gate); after Clear, Undo restores the previous layers and waveform, or the confirm prevents the wipe when cancelled.

### U3 · First-run coach: Space cycle + headphones · P0
Start overlay only says use headphones and "Press ? for shortcuts." The Space cycle (`record → play → overdub → play` via `cycle` in `doAct`) is the main workflow and is easy to miss. Add a one-time coach (dismissible, stored in `localStorage`) that points at Track 1 Rec / Space and reminds headphones before the first recording.  
**Accept:** After Start, a first-time user sees a short coach covering headphones + Space/Rec cycle; dismissing it does not show again on reload; Help (`?`) still works.

### U4 · Armed / snap countdown on the track · P1
When snap/sync is on, `beginRec` sets state `armed` until the next loop boundary, but the UI only changes the badge/border—no time-to-start. Show a countdown (bars/beats or ms) on the armed track (and optionally master status) until recording actually starts.  
**Accept:** With Sync+Snap on and a master loop playing, pressing Rec shows "armed" plus a live countdown that hits 0 when state flips to `recording`/`overdubbing`.

### U5 · Visual metronome / beat pulse · P1
Metronome is audio-only (`metSchedule`/`click`). Add a small master beat indicator (pulse or 1–2–3–4 dots) driven by the same grid as the click, including during count-in before the first loop.  
**Accept:** With Metronome on, a visible pulse syncs to the click (accent on beat 1); it runs during count-in; turning Metronome off stops the pulse.

### U6 · Surface MIDI map list + clear mapping · P1
MIDI learn saves to `localStorage` (`lp.midi`) and only shows a count/last mapping in `#midiMsg`. There is no UI to list or delete mappings. Add a compact list of current mappings with per-row Remove and a Clear all.  
**Accept:** After learning at least one mapping, the Sessions/MIDI panel lists `key → action`; Remove deletes that entry from storage; Clear all empties `lp.midi` and the list.

### U7 · Empty-track call-to-action · P1
Empty tracks show a blank 64px wave box and a full button grid with no guidance. On selected empty tracks, show a short CTA in the wave area (e.g. "Rec or Space to set the loop") that hides once layers exist.  
**Accept:** Selected empty track shows the CTA in the wave area; after first successful record, CTA is gone and waveform renders as today.

### U8 · Mobile: collapse master chrome; bigger primary hit targets · P1
On phone widths (see `screens/mobile.png` / `mobile-top.png`), expanded Timing + Sessions bury the tracks, and knob rows use 12px labels with small range inputs. Default both `<details>` closed on narrow viewports; enlarge Rec/Dub/Play/Stop min height; widen Vol/Pan touch targets.  
**Accept:** At ≤480px width, tracks appear without scrolling past two open settings panels by default; Rec/Play hit targets are ≥44px tall; volume slider remains usable with a thumb.

### U9 · Rename tracks (persist in sessions) · P2
Tracks are hard-coded "Track N" in `buildTrackUI`. Allow inline rename; store the name on the track object and in the IndexedDB session payload (`saveSession`/`loadSession`).  
**Accept:** User can rename Track 2; name shows in the card header; Save/Load session restores the custom name.

### U10 · Help panel: touch / performance cheatsheet · P2
`#help` lists keyboard + MIDI only. Add a short "On phone / live" section: headphones, tap Rec twice to close the loop, where + Track and Sessions live, and that selection (blue border) is what Space controls.  
**Accept:** Opening Help shows keyboard shortcuts plus a touch/live section; Esc/Close still dismisses.

### U11 · Clip / peak hold on In and Out meters · P2
Meters (`#inMeter`/`#outMeter`) only grow green→yellow→red via CSS gradient; there is no sticky clip flag when level hits full scale. Add a brief red clip LED that latches ~1s when peak ≥ ~0.99.  
**Accept:** Driving input into clipping flashes/holds a clip indicator on In; hot master out does the same on Out; idle levels clear it after the hold time.

### U12 · Show numeric values next to key sliders · P2
Latency shows `#latManV`; Vol/Pan/Reverb/Delay/Click vol/Input gain/Master do not. Display the live value beside each of those sliders.  
**Accept:** Moving Master, Click vol, Input gain, and each track Vol/Pan/Reverb/Delay updates a visible numeric readout.

---

## Aesthetics

### A1 · Visual refresh: type, spacing, and track cards · P0
UI is flat utility panels (`#151925` cards, system-ui, dense 8–10px padding). Refine typography hierarchy (brand vs. status vs. labels), increase card padding and wave prominence, and soften borders so playing/recording/armed/selected states read clearly without changing the dark theme or red "Pro" accent.  
**Accept:** Side-by-side with current screenshots, cards feel less cramped; state colors (green playing, red recording, amber armed, blue selected) remain; no layout break on desktop or phone.

### A2 · Richer waveforms + stronger playhead · P1
`drawWave` fills a flat `#7088d0` mirror waveform at 64px; playhead is a 2px white line. Increase wave height, use a subtle gradient/glow for the waveform, thicken/lighten the playhead, and keep bar-division marks for multi-length synced tracks.  
**Accept:** Wave area is taller (≥96px on desktop); playhead remains visible on playing tracks; multi-bar division lines still draw when `M` exists and track is synced.

### A3 · Transport bar polish (Play all / Stop all / Record mix) · P1
Master row uses three equal `button.big` controls; Record mix toggles label/class `on` only. Give Play a clearer playing state, make Record mix a distinct recording treatment (pulse or stronger red) while `mixRec` is active, and align meters on one visual baseline.  
**Accept:** While playing, Play all shows an on/playing style; while mix-recording, Record mix is unmistakably active; In/Out/Master row aligns consistently on desktop.

### A4 · Motion: recording pulse + armed breathe · P2
CSS already sets red/amber box-shadows for recording/overdubbing/armed. Add a gentle CSS pulse on recording/overdubbing and a slower breathe on armed so state changes are noticeable in peripheral vision without being distracting.  
**Accept:** Recording/overdubbing cards pulse; armed cards breathe; empty/stopped/playing have no pulse; `prefers-reduced-motion: reduce` disables the animation.

### A5 · Start overlay + install hint styling · P2
Start overlay is a plain panel with title, headphones note, and Start audio. Match the refreshed visual language; optionally mention "Install app" when `beforeinstallprompt` or standalone display is available (PWA already has `manifest.json` + `sw.js`).  
**Accept:** Overlay matches the new card/type style; Start audio still requests mic and hides overlay on success; install hint appears only when installable / not already standalone.

---

## Reliability

### R1 · Replace ScriptProcessor with AudioWorklet (capture + mix tap) · P1
`app.js` uses deprecated `createScriptProcessor` for the input capture ring buffer and the stereo mix recorder. Migrate both to AudioWorklet (with a ScriptProcessor fallback) to reduce glitches and future browser breakage.  
**Accept:** Record, overdub, latency calibrate, and Record mix still work in Chromium; worklet path is used when available; fallback path still records if worklets fail.

### R2 · Service worker cache bust on deploy · P1
`sw.js` caches under a fixed `loopstation-v1` name and cache-first serves listed assets. Bump the cache id (or hash assets) whenever `app.js`/`style.css`/`index.html` change so GitHub Pages users get the new sprint builds instead of a sticky old shell.  
**Accept:** Changing the cache constant causes activate to drop the old cache; a hard reload after deploy serves the new `app.js`/`style.css` (verified via Network or cache keys).

### R3 · Guard session load when sample rate differs · P2
`loadSession` warns when `d.sr !== sr` but still assigns raw layer buffers. Either resample layers to the current `sr`, or block load with a clear message and keep the current session intact.  
**Accept:** Loading a session saved at a different sample rate either plays in time/pitch-correctly after resample, or refuses load with an explicit message and does not leave half-loaded tracks.

---

## Out of scope (unless Matt asks)
Cloud sync, multi-user, video, new FX types beyond existing reverb/delay sends, iOS Web MIDI (platform-limited—already messaged in UI).

---

## Review log

| Ticket | Status | Commit | Reviewer notes |
|--------|--------|--------|----------------|
| U1 | PASS | 091fe66 | + Track in status row outside details; disables at 8; hint shows n/8. |
| U2 | CHANGES NEEDED | a2edee8 | Confirm + Undo restore work. Bug: clearTrack sets t.redo=layers copy while t.len=0, so pressing Redo (or Y) right after Clear pushes a layer with len 0 and renderTrack calls ctx.createBuffer(1,0,sr), which throws. Fix: leave redo empty (Undo uses clearedState) or make Redo after Clear restore clearedState too. |
| U3 | PASS | 20c2b31 | Coach after Start, lp.coachDismissed persists, highlights Track 1 Rec; Help untouched. |
| U4 | PASS | 5671204 | Live seconds + beats overlay on armed track, clears on state change. |
| U5 | PASS | c9d528d | 4-dot pulse on same grid as click (M.t0 or metGrid, which count-in also uses), accent beat 1, stops when off. Visual not output-latency compensated (minor). |
| U6 | PASS | 9dc8f4d | List key -> action, per-row Remove, Clear all, storage updated. |
| U7 | PASS | 3ddabfd | CTA on selected empty track, hides once layers exist. |
| U8 | PASS | 27e812a | Details closed at <=480px, Rec/Dub/Play/Stop 48px on mobile, wider sliders. |
| U9 | PASS | 2533bee | contenteditable name, keyboard shortcuts ignored while editing, saved/loaded in session. |
| U10 | PASS | 4341785 | On phone / live section with all four points. |
| U11 | PASS | bfa864f | CLIP LEDs latch 1s at peak >= 0.99 on In and Out. |
| U12 | PASS | aaab56c | Readouts for Master, Click vol, Input gain, track Vol/Pan/Rev/Delay, also restored on session load. |
| A1 | PASS | 1306982 | More padding/type hierarchy; state colors kept. |
| A2 | PASS | c162995 | Wave 98px, gradient fill, 3px glowing playhead, bar divisions kept. |
| A3 | PASS | 724c881 | Play all playing style, Record mix pulsing red, meters row aligned. |
| A4 | PASS | da99ef4 | Rec pulse, armed breathe, reduced-motion disables. |
| A5 | CHANGES NEEDED (minor) | 70a50b2 | Overlay restyle good. Install hint text shows whenever a service worker is supported and not standalone (e.g. Firefox desktop, which can't install), not only when installable. Gate the hint on beforeinstallprompt (plus an iOS Add to Home Screen case if wanted). |
| R1 | PASS (needs runtime check) | 671f658 | worklet.js capture + mix processors, ScriptProcessor fallback, __lp.audioMode exposes path, worklet.js added to SW cache. Note: removing the ScriptProcessor buffer changes round-trip latency, so saved manual latency comp may need re-calibrating. |
| R2 | PASS | 9c5940d | Cache v2, install fetches with cache:'reload', updateViaCache:'none', ?v=2 on css/js with ignoreSearch match. Remember to bump C and ?v= on every future deploy. |
| R3 | PASS | 060b430 | Linear resample of layers, M.len and track len by sr ratio; invalid sr refused before clearing current session; message shown. |

---

## Gemini log
<!-- SPRINT-<id> · <commit hash> · what changed · how to test -->
- `SPRINT-R2` · `9c5940db927c2f3eba4fe97c6eeb3e8dd68d6ac0` · Bumped service worker cache name `C` in `sw.js` from `'loopstation-v1'` to `'loopstation-v2'`, changed `install` to fetch assets with `new Request(u, {cache: 'reload'})`, added `{ignoreSearch: true}` to `caches.match`, registered `sw.js` with `{updateViaCache: 'none'}` in `app.js`, and added `?v=2` query params on `style.css` and `app.js` in `index.html`. · Test: Serve repo over HTTP, inspect `await caches.keys()` in DevTools (`['loopstation-v2']`), and verify old `loopstation-v1` cache is deleted on activate.
- `SPRINT-U1` · `091fe66cf74338d0a99fff75ac94b2458db6399f` · Moved `#addTrack` and `#addTrackHint` (`(max 8)`) out of the collapsed "Sessions, export & MIDI" `<details>` into the master status row in `index.html`, and updated `mkTrack()` in `app.js` to show live count (`(N/8 · max 8)`) and disable `#addTrack` at 8 tracks. · Test: With both `<details>` closed, click `+ Track` up to 8 tracks and verify `tracks.length === 8` and `#addTrack.disabled === true`.
- `SPRINT-U2` · `a2edee87c9ef41baf3e09a887f65ddc2e84f852f` · Added confirmation prompt (`confirm(...)`) on user-triggered `clear` in `doAct` when a track has layers, and stored a pre-clear snapshot (`t.clearedState`) in `clearTrack(t, true)` so pressing `Undo` after `Clear` restores the cleared layers, loop length, master loop `M`, and waveform; kept programmatic session reset silent via `clearTrack(t, false)`. · Test: Record a layer on Track 1, click `Clear` and cancel (layer remains); click `Clear` and confirm (track empties), then click `↶ Undo` or press `Z` (layer and waveform restore).
- `SPRINT-A1` · `130698292a78c34c10dd0148c9cb8b6e5a888fd9` · Refined typography hierarchy (brand header, 16px bold track titles, pill status badges, tabular numerals), increased master and track card padding (`16px`) and grid gaps (`14px`), elevated wave container border/inset shadow, and softened state borders/glows while preserving dark theme, red `Pro` accent, and green/red/amber/blue state colors. · Test: Inspect `.master` and `.track` cards on desktop and mobile widths and verify playing/recording/armed/selected border states.
- `SPRINT-U3` · `20c2b313f5d325f466ea66acb1e291b6f09c9e15` · Added dismissible first-run `#coach` banner above `#tracks` (persisted via `localStorage.getItem('lp.coachDismissed')`) that highlights Track 1 `● Rec`, reminds users to wear headphones, and explains the `Space` (`Record → Play → Overdub → Play`) cycle. · Test: Clear `lp.coachDismissed` from `localStorage`, click `Start audio`, verify `#coach` is visible; click `Got it` (`#coachDismiss`), reload, click `Start audio`, and verify `#coach` stays hidden.
- `SPRINT-R1` · `671f65805473b3cf9ced34a033154a68d4c3661c` · Created `worklet.js` (`lp-capture-processor` and `lp-mix-processor` `AudioWorkletProcessor`s), migrated `capNode` and `mixTap` in `app.js` to `AudioWorkletNode` with automatic fallback to `createScriptProcessor` (also testable via `window.__forceScriptProcessor = true`), exposed `window.__lp.audioMode`, and added `worklet.js` to `sw.js` cache list. Runtime verified in Chromium (`chrome.exe --headless=new` with fake media stream): `window.__lp.audioMode === 'worklet'`, recording Track 1 sets `M`, overdubbing adds layers, and mix recording captures stereo WAV. · Test: Start audio in Chromium, verify `window.__lp.audioMode === 'worklet'`, record/overdub/calibrate/mix-record; set `window.__forceScriptProcessor = true` before start and verify fallback sets `window.__lp.audioMode === 'scriptprocessor'` and records cleanly.
- `SPRINT-U4` · `5671204313dd688d62deeb9882c74d99f19b99bb` · Added `updateArmedCountdowns()` in `app.js` and `.arm-cd` overlay in `.wave` so armed tracks display live remaining seconds and beats (`armed · 0.6s` on `.st` and `Armed — starts in 0.6s (2 beats)` in `.arm-cd`) down to `0.0s` before flipping to `recording`/`overdubbing`. · Test: With Sync+Snap on and Track 1 playing a master loop, click `● Rec` on Track 2 mid-loop and observe the live countdown on `.st` and `.arm-cd` until recording begins at the loop boundary.
- `SPRINT-U5` · `c9d528d890d8074d23aa47a4a5fc2a1bf69f6edc` · Added `#metBeat` (`1–2–3–4` beat dots) in the master status bar and `updateMetPulse()` in `app.js` driven by the same `grid` (`M ? M.t0 : metGrid`) and `S.bpm` as `metSchedule()`, with red accent pulse on beat 1 and active pulsing during count-in; turning Metronome off clears the pulse immediately. · Test: Toggle `Metronome` (`#metOn` or `K`), verify `#metBeat.active` and `.bdot.on` (with `.accent` on beat 1) pulse in time with clicks including during count-in, and stop when `#metOn` is unchecked.
- `SPRINT-A2` · `c16299562d2f0c74b3ad8a70fceff22a63f70e14` · Increased `.wave` height to `98px` (`≥96px` on desktop), upgraded `drawWave()` in `app.js` with a vertical gradient + inner crest highlight and center axis line while preserving multi-bar division lines (`M && !t.free`), and thickened/brightened `.ph` playhead (`3px` white with glow). · Test: Record Track 1 and a 2× length synced Track 2; verify `.wave` height is `98px`, playhead `.ph` is `3px` with glow while playing, and bar division lines render.
- `SPRINT-A3` · `724c8813a9581d24bbe0ed41122dd0754876b91a` · Updated `loopInfo()` and `toggleMix()` in `app.js` and transport/meter styles in `style.css` so `#mPlay` displays a distinct active `.playing`/`.on` green glow while playing, `#mRec` displays a pulsing crimson `.rec-active` treatment during mix recording, and `In`/`Out`/`Master` align on a single horizontal baseline on desktop. · Test: Play a loop and verify `#mPlay.playing` styling; click `● Record mix` and verify `#mRec.rec-active` pulse; inspect `.row.meters` baseline alignment.
- `SPRINT-U6` · `9dc8f4ddd279b40db8a68697a432df4af45a7278` · Added `#midiMapWrap` (`#midiList` + `#midiClearAll`) to the Sessions/MIDI panel in `index.html` and `renderMidiList()` in `app.js` to list all `key → action` entries from `lp.midi` with per-row `Remove` buttons and a `Clear all` button. · Test: Enable `MIDI learn`, click a button, trigger `window.__midiTest({data:[0x90,60,100]})`, verify `n60 → ...` appears in `#midiList`, test per-row `Remove`, and test `Clear all`.
- `SPRINT-U7` · `3ddabfd8ca6cbc0b30753674a2e5fc64a2d372c9` · Added `.wave-cta` (`"Rec or Space to set the loop"`) inside each track's `.wave` box, shown when an empty track is selected and automatically hidden once recording begins or layers exist. · Test: Start audio, verify Track 1 (selected, empty) displays the CTA in `.wave`; select Track 2 and verify CTA moves to Track 2; record on Track 1 and verify CTA hides.
- `SPRINT-U8` · `27e812ae967e5b495a1d1ef0714bc380f17aff6f` · Ensured both `.master details` panels default closed on narrow viewports (`≤480px`), increased primary track transport buttons (`.r`, `.o`, `.p`, `.x`) min-height to `46px` (`48px` on mobile), and widened mobile `.knobs` sliders to full-width single-column `34px`-tall touch targets. · Test: Resize viewport to `≤480px`, verify both `<details>` are closed, `.tbtns .r`/`.p` height is `≥44px`, and `.knobs` sliders span full width.
- `SPRINT-U9` · `2533beec35aa991bbd5b8ea32eb810d70bef0705` · Made `.tname` inline-editable (`contenteditable="true"` + `window.__lp.renameTrack`) in `buildTrackUI()`, guarded global keyboard shortcuts while editing `.tname`, and persisted `t.name` in IndexedDB `saveSession()`/`loadSession()`. · Test: Click `Track 2` header name, rename to `"Bass Synth"`, click `Save` in Sessions, change or reset name, click `Load`, and verify `"Bass Synth"` is restored.
- `SPRINT-U10` · `4341785dd1deea055813b1a1ad83cc71c7dbc44a` · Added `"On phone / live"` cheatsheet section to `#help` in `index.html` covering headphones, tapping `● Rec` twice to close the loop, blue-border track selection for `Space`, and where `+ Track` and `Sessions` live. · Test: Click `?` (`#helpBtn`), verify keyboard shortcuts and `"On phone / live"` section appear, and press `Esc` or click `Close` to dismiss.
- `SPRINT-U11` · `bfa864fd645a90a612ffeef505f3c746d2076705` · Added `#inClip` and `#outClip` latching red `CLIP` LED badges in `index.html` and `updateClipMeters(inPk, outPk)` in `app.js` that latch for `1000ms` when peak `>= 0.99` and clear once levels return below clipping. · Test: Drive input or output to full scale (or call `window.__lp.updateClipMeters(1.0, 1.0)`), verify `#inClip.on` / `#outClip.on` latch red for ~1s, and verify they clear after 1s of normal levels.
- `SPRINT-U12` · `aaab56c66f1df74dfb380b0bdf951b60001d8543` · Added live numeric value readouts (`#mVolV`, `#clickVolV`, `#inGainV`, and per-track `.kvV`, `.kpV`, `.krV`, `.kdV`) next to Master, Click vol, Input gain, and track Vol/Pan/Reverb/Delay sliders, updated on `input` and `loadSession()`. · Test: Move Master, Click vol, Input gain, and track Vol/Pan/Reverb/Delay sliders and verify the adjacent `.sval` readout updates immediately.
- `SPRINT-A4` · `da99ef4c8f49106edfb062564343b50953e5c43a` · Added `@keyframes trackRecPulse` on `.track[data-state=recording]`/`.track[data-state=overdubbing]` and `@keyframes trackArmedBreathe` on `.track[data-state=armed]`, kept `empty`/`stopped`/`playing` cards static (`animation: none`), and disabled animations under `@media (prefers-reduced-motion: reduce)`. · Test: Inspect computed `animationName` on recording (`trackRecPulse`), armed (`trackArmedBreathe`), and playing (`none`) track cards, and verify `prefers-reduced-motion: reduce` disables animations.
- `SPRINT-A5` · `70a50b231d5633574f04899d21181912a1f69117` · Restyled `#startOverlay` and `.start-panel` to match the refreshed dark studio design and added conditional `#installHint` / `#installBtn`. · Test: Load page in browser, click `▶ Start audio` to request mic and hide overlay.
- `SPRINT-R3` · `060b430715d6e74064fa1a13d786663348a4a3db` · Added `resampleLayer(src, newLen)` and sample-rate validation in `loadSession()` so sessions saved at a different valid `sr` are linearly resampled (scaling `M.len`, `t.len`, and all layer buffers by `sr / d.sr` for accurate pitch/timing) while corrupt/unsupported `sr` values are rejected with an explicit message in `#mixInfo` before touching the current session. · Test: Save a session, modify its IndexedDB `sr` to `24000` with `24000`-frame layers, load it at `48000 Hz`, and verify `t.len === 48000` and `#mixInfo` reports resampling; test loading `sr: -100` and verify load is refused and current session remains intact.
- `SPRINT-U2` (follow-up) · `59833922ab5cb0e1a9b2df293f0f887b8467f38f` · Fixed Grok review bug on `U2`: left `t.redo = []` in `clearTrack(t, keepUndo)` (since `Undo` restores from `t.clearedState`) and guarded `renderTrack(t)` with `if (!t.layers.length || !t.len)` so pressing `Redo` (`Y`) immediately after `Clear` is a safe no-op and never calls `ctx.createBuffer(1, 0, sr)`. · Test: Record Track 1, click `Clear` and confirm, press `Y` (`Redo`) and verify no error and `t.layers.length === 0`, then press `Z` (`Undo`) and verify layer and waveform restore.
- `SPRINT-A5` (follow-up) · `e5eb460955610424b4b4746f300c5fde5881735f` · Fixed Grok review item on `A5`: gated `#installHint` in `updateInstallHint()` strictly on `!standalone && (!!deferredInstall || isIOS)` so non-installable browsers (e.g. Firefox desktop or before `beforeinstallprompt` fires) keep `#installHint` hidden; also guarded `e.target?.matches?.(...)` on `keydown` so `Escape` always closes `#help`. · Test: Verify `#installHint.classList.contains('hidden') === true` on initial desktop load before `beforeinstallprompt`, dispatch `new Event('beforeinstallprompt')`, and verify `#installHint` and `#installBtn` become visible.

## Grok review
<!-- Per ticket: PASS or CHANGES NEEDED + specifics -->

## Grok review — 2026-10-30 ~2:15 PM ET (commits 9c5940d..060b430, HEAD 060b430715d6e74064fa1a13d786663348a4a3db)
Static code review of all 20 SPRINT commits (one per ticket, naming correct). Not runtime-tested in Chromium. Gemini log section is still empty and SPRINT_GROK_REVIEW.md is untracked (not committed); nothing pushed (good).

| Ticket | Status | Commit | Reviewer notes |
|--------|--------|--------|----------------|
| R2 | PASS | 9c5940d | Cache v2, install fetches with cache:'reload', updateViaCache:'none', ?v=2 on css/js with ignoreSearch match. Remember to bump C and ?v= on every future deploy. |
| U1 | PASS | 091fe66 | + Track in status row outside details; disables at 8; hint shows n/8. |
| U2 | CHANGES NEEDED | a2edee8 | Confirm + Undo restore work. Bug: clearTrack sets t.redo=layers copy while t.len=0, so pressing Redo (or Y) right after Clear pushes a layer with len 0 and renderTrack calls ctx.createBuffer(1,0,sr), which throws. Fix: leave redo empty (Undo uses clearedState) or make Redo after Clear restore clearedState too. |
| A1 | PASS | 1306982 | More padding/type hierarchy; state colors kept. |
| U3 | PASS | 20c2b31 | Coach after Start, lp.coachDismissed persists, highlights Track 1 Rec; Help untouched. |
| R1 | PASS (needs runtime check) | 671f658 | worklet.js capture + mix processors, ScriptProcessor fallback, __lp.audioMode exposes path, worklet.js added to SW cache. Note: removing the ScriptProcessor buffer changes round-trip latency, so saved manual latency comp may need re-calibrating. |
| U4 | PASS | 5671204 | Live seconds + beats overlay on armed track, clears on state change. |
| U5 | PASS | c9d528d | 4-dot pulse on same grid as click (M.t0 or metGrid, which count-in also uses), accent beat 1, stops when off. Visual not output-latency compensated (minor). |
| A2 | PASS | c162995 | Wave 98px, gradient fill, 3px glowing playhead, bar divisions kept. |
| A3 | PASS | 724c881 | Play all playing style, Record mix pulsing red, meters row aligned. |
| U6 | PASS | 9dc8f4d | List key -> action, per-row Remove, Clear all, storage updated. |
| U7 | PASS | 3ddabfd | CTA on selected empty track, hides once layers exist. |
| U8 | PASS | 27e812a | Details closed at <=480px, Rec/Dub/Play/Stop 48px on mobile, wider sliders. |
| U9 | PASS | 2533bee | contenteditable name, keyboard shortcuts ignored while editing, saved/loaded in session. |
| U10 | PASS | 4341785 | On phone / live section with all four points. |
| U11 | PASS | bfa864f | CLIP LEDs latch 1s at peak >= 0.99 on In and Out. |
| U12 | PASS | aaab56c | Readouts for Master, Click vol, Input gain, track Vol/Pan/Rev/Delay, also restored on session load. |
| A4 | PASS | da99ef4 | Rec pulse, armed breathe, reduced-motion disables. |
| A5 | CHANGES NEEDED (minor) | 70a50b2 | Overlay restyle good. Install hint text shows whenever a service worker is supported and not standalone (e.g. Firefox desktop, which can't install), not only when installable. Gate the hint on beforeinstallprompt (plus an iOS Add to Home Screen case if wanted). |
| R3 | PASS | 060b430 | Linear resample of layers, M.len and track len by sr ratio; invalid sr refused before clearing current session; message shown. |

Result: 18 PASS, 2 CHANGES NEEDED (U2 bug, A5 minor). Last reviewed hash 060b430715d6e74064fa1a13d786663348a4a3db.
