# Scroll Contract (SSOT Runtime Boundaries)

This document is the executable contract for scroll behavior.
`MANIFEST.md` owns architecture mapping; this file owns runtime boundaries.

## 1) SSOT Keys

- `scrollMode: EngineScrollMode` (owner: `appStore`)
- `scrollEnabled: boolean` (owner: `appStore`)
- `session.asrEngaged: boolean` (owner: `src/state/session.ts`)
- `session.asrArmed: boolean` (owner: `src/state/session.ts`)

`auto`/`off` are dialect states and must map through `scrollMode + scrollEnabled`.

## 2) ASR Invariants (Hard)

When `scrollMode='asr'`:

- `Start speech sync` must arm ASR for the session (`session.asrArmed=true`) before preroll/live begin.
- Driver attach/create and transcript ingest readiness should occur on ASR mode selection when script blocks are available (do not require `session.asrArmed`).
- `session.asrArmed` is movement permission only: ASR may ingest/match/bookkeep while unarmed, but must not write scroll.
- No timed/hybrid/wpm motor may run.
- No auto-intent flow may drive scroll.
- No preroll event may trigger movement.
- Semantic cursor advancement is ASR commit-driven only.
- ASR movement authority is single-lane: `speech-loader -> asr-scroll-driver` commit path.
- ASR semantic cursor truth and ASR visual scroll target are separate concerns:
	- semantic truth is owned by validated ASR commits
	- visual target correction is allowed only to keep the trusted semantic line readable near the marker
- Visual recovery/protection paths are ASR-owned and must never advance semantic cursor truth.
- Visual recovery/protection paths must never chase raw matcher index (`matchBestIdx`) as scroll target.
- Visual recovery/protection targets must derive from trusted current/committed semantic anchors.
- Visual recovery must be forward-only or protective-hold only unless a trusted rollback/reanchor reason applies.
- Visual recovery/protection movement must be bounded to a small safe step (about one line height or capped safe pixel delta).
- Visual recovery/protection must stand down during noMatch/offscript, stopped/session mismatch, bridge lifecycle/pending/reduced bridge context, contradiction, true visual silence, stale visual recovery evidence, or focus-loss movement hold.
- Recovery/protection diagnostics must prove why movement was allowed or blocked.
- Lifecycle and transcript wiring are single-instance: repeated init/mode toggles must not stack duplicate subscriptions/listeners in the same window.
- Auto-motor authority is single-lane: `scroll-router` owns `__tpAuto` enable/disable state; bridge modules must not toggle it.
- Legacy namespace recognizer backend (`window.__tpSpeech.startRecognizer`) is compatibility-only and opt-in (`window.__tpAllowLegacySpeechNamespace===true` or `?legacySpeechNs=1`).
- Legacy `window.__tpAsrMode` runtime is compatibility-only and opt-in (`window.__tpAllowLegacyAsrMode===true` or `?legacyAsrMode=1`); default runtime must stay on speech-loader shim ownership.
- Legacy `AsrMode` -> `tp:scroll:intent` movement lane is compatibility-only and blocked by default.
- Commit path is writer-first: `seekToBlockAnimated(...)`.
- ASR commit movement is writer-first: resolve block mapping via `seekToBlockAnimated(...)`, then (in ASR mode) ease toward commit `targetTop` with bounded-speed animation; this remains commit-driven (no continuous ASR motor lane).
- ASR hard seeks and snaps are marker-anchored by default: land the confirmed active line at the configured marker Y, not at viewport top. If exact placement is impossible because the document bottom is reached, clamp normally and settle at the scroll limit without re-triggering recovery loops.
- After a successful ASR commit seek, enforce a post-commit readability pass so the active line stays near the marker band while forward readable lookahead remains visible.
- Post-commit readability nudge must preserve a tight marker-centered active-line band with responsive same-line recentering; when forward readable lookahead is clipped, nudge should restore lookahead without forcing the active line above that band.
- Post-commit readability should ensure immediate continuity: if the next speakable line is near bottom clipping (small guard margin), reveal it before chasing deeper lookahead.
- Post-commit readability nudge is bounded to about one line of forward movement per settle pass to avoid overshoot/bounce from stacked helper writes.
- Same-line recenter no-op is near-threshold only: when same-line marker delta is large, do not hard-noop; continue bounded recenter/creep handling.
- Small ASR marker drift is hysteretic: no scroll write inside the hold band, correction only after exiting the larger engage band, and no competing low-pocket/deadband backward reconcile while a fresh forward owner or protected post-commit recovery target still owns the frame.
- Live ASR capture may force interim hypotheses on transport even when UI interim toggle is off; commit/movement remains gated by ASR commit logic.
- Pixel `driveToLine` is fallback only when writer/block mapping is unavailable.
- Strong small-delta forward/same matches (`delta>=0` within relaxed-small window) at/above required similarity must not be blocked solely for weak forward-evidence.
- Forward scan must score speakable joined windows (multi-line candidates) in addition to single-line candidates, so combined ASR phrases can advance to the correct forward line.
- Arbitration must allow forward continuation when transcript length exceeds current-line length and a forward window (`span>=2`) meets floor and near-current score slack.
- If current-line evidence is lexically weak (very low overlap tokens) and a forward candidate is near-score and above floor, prefer forward candidate instead of same-line recenter.
- Weak-current forward rescue must be continuity-bounded (`delta<=2`, `span<=2`) so low-overlap anchors cannot leap multiple lines/paragraphs.
- Weak-current forward rescue may run before LOST_FORWARD when same-line overlap is sparse and bounded forward evidence is competitive, but only with strong evidence (final/strong-score or stable-growing interim) and not because LOST_FORWARD is active by itself; keep near-start capped at `+1` and otherwise max `+2`.
- If arbitration regresses behind the current cursor after a forward commit, continuation recovery must stay near-forward (`+1` preferred, max `+2`) and never long-jump.
- First near-start commit is continuity-capped (`delta<=1`, non-forced) to prevent startup overshoot from buffered multi-line transcript chunks.
- Match selection is band-preferred: pick best candidate from active band (+tiny backward tolerance) first, but permit forward-window continuation/fallback before hard reject.
- During live ASR, `blocks:*` sync may refresh block metadata but must not rewrite cursor/index truth (`currentIndex` / driver line index).
- During live ASR after first commit, external cursor/index sync inputs must be monotonic: they may advance cursor truth but must not regress below committed cursor floor.
- On successful ASR commit, publish canonical cursor truth immediately (`currentIndex` plus commit index signal) so subsequent sync uses the new anchor.
- During interim transcript growth (`bufferGrowing`), block arbitration may temporarily expand forward window to `+2` blocks and evaluate merged forward block text (`N + N+1`) so boundary-split phrases can surface a forward candidate before guards apply.
- After forward/forced commit seek, reseed the match band around the committed index (small back tolerance, forward window) before next ingest so stale pre-commit windows cannot force immediate `match_out_of_band`.
- Out-of-band guard must be non-destructive (no evidence buffer clear or backward reseed); ignore and continue listening for in-band forward evidence.
- `tp:asr:guard` is a structural commit-suppression signal; Hybrid must not translate guard events into semantic off-script evidence/decay.
- Matcher-unavailable fallback must stay neutral: publish `noMatch=true` with non-candidate index (`bestIdx<0`) and omit similarity (`sim`/`bestSim`), never fabricate low-sim match evidence.
- Stuck watchdog fail-safe: if phase is live, ASR is armed, transcript traffic continues (finals or sustained interim bursts), and commit count has not advanced for watchdog window, attempt a bounded forward recovery commit from forward scan at low floor.
- Watchdog recovery commit clamp is bounded: weak-confidence watchdog recovery may raise clamp only to a small cap (default `+2` lines), never an unbounded jump.
- If watchdog selects a forward recovery candidate while interim buffer is still growing, treat that as forward-progress evidence: do not reject it as `interim_unstable`, and preserve watchdog floor through low-sim gating for that recovery attempt.
- Commit-time clamp: before ASR commit finalization (writer/pixel), baseline cap is `+1` line; force-qualified bounded paths (cue-bridge/lost-forward/hold-anchor/watchdog-recovery) may raise only to their capped windows. Outside those capped paths, require strong confidence (`sim>=0.82`) for larger jumps; emit `ASR_CLAMP` dev log when clamp applies.
- Cue-bridge low-sim bypass must be bridge-only: intermediate skipped lines must be skippable cue/meta/blank lines, capped to a small bridge (`<=2` skipped lines), and target must be speakable.
- Multi-line same-line promotions and cue-bridge fallbacks must prove every skipped line is strictly bridge-only: blank, bracketed cue, note, or speaker-tag lines. Bare cue-word text is not sufficient to justify a `+2..+3` commit.
- Cue-bridge progression for multi-line advancement requires an actual bridge (`>=1` skipped skippable line). Same-line final confirmation may plain-advance only `+1` to the adjacent speakable line when confidence is strong (`sim>=0.82`); otherwise plain advancement without a bridge is disallowed.
- Automatic stall rescue is diagnostic-only for progression: `auto-stall` must not synthesize forward commits. Only explicit/manual rescue signals may schedule bounded stall-rescue commits, and those still require strict cue-bridge proof.
- Final forward nudges/fallbacks that already carry a valid cue-bridge delta may raise commit clamp to that bounded bridge cap (`<=3`) so clamp cannot collapse the move to a cue-only line and immediately block commit.
- If commit-time cue-safe resolution finds only cue/meta lines in the clamp window, retry with a bounded cue-bridge scan from cursor (`+3`) and commit to that speakable line when available; only then allow `cue_commit_blocked`.
- Strong same-line final `+1` nudge may bypass short-line ambiguity HOLD only when lexical overlap with current line is high, with no bridge skip and adjacent speakable target only.
- Same-line final forward promotion should not be blocked just because current-line recenter delta is outside the near-band; when bounded/floor-qualified, it should commit forward through normal clamp path.
- In strict matcher mode, if same-line final remains pinned after nudge arbitration but confidence/overlap are strong, a bounded cue-bridge fallback forward pick is allowed (`forceReason='final-forward-fallback'`).
- Dev tuning may enable permissive matcher mode explicitly (`__tpAsrPermissiveMatcher` or `asr_matcher=permissive`): guard branches (`tie`, `low_sim`, short-line ambiguity hold) log but do not hard-block forward commit progression.
- In permissive matcher mode, same-line final completions may promote a bounded `+1` speakable advance (`forceReason='permissive-final-advance'`), and pending commit gate must honor that bypass at progressive floor.
- Permissive same-line final forward promotion is evidence- and position-gated: require minimum lexical overlap evidence (`>=2` overlap tokens plus overlap-ratio floor) and block only true run-ahead (cursor materially ahead of marker); when marker is ahead (lag), permissive forward advance may proceed.
- Final forward promotions (`final-forward-nudge`, `final-forward-fallback`, `permissive-final-advance`) must carry through pending arbitration so bounded forward picks are not re-blocked by low-sim/tie gates during live armed ASR.
- In permissive matcher mode, ambiguity HOLD is non-blocking for bounded final forward advance; hold may log, but it must not trap same-line finals at the cursor.
- Multi-line cue-bridge commits require stronger confidence (`sim>=0.45`); low-floor bypass is not allowed for multi-line bridge jumps.
- For bounded same-line final cue-bridge promotions, a small multi-jump floor epsilon (`<=0.08`) is allowed to avoid float-boundary stalls, only on `final-forward-nudge` / `final-forward-fallback` / `permissive-final-advance` with valid cue-bridge pathing. Hard deny floor (`sim<0.30`) remains unchanged.
- During live armed `speech_stall`, runtime may emit `tp:asr:rescue`; driver may synthesize a bounded cue-bridge forward commit (`forceReason='stall-rescue'`) only when skipped lines are cue/meta/blank and a speakable target exists within bridge cap (`+3`).
- Auto cue-stall rescue is bounded to conservative continuity: automatic stall rescue may schedule only a direct content step (`+1`) when both cursor and target are content lines; multi-line cue-bridge rescue is reserved for explicit/manual rescue signals.
- Automatic stall rescue must defer while manual-anchor adoption is pending (for example after Kick/manual reposition) so recovery does not override the user-selected re-anchor location before local speech confirms it.
- Rescue latch hygiene: `stallRescueRequested` should arm only when rescue scheduling succeeds; blocked content-line auto-stall checks must leave the latch false.
- LOST_FORWARD may use bounded behind-marker catch-up when marker is ahead of cursor and forward content evidence exists: candidate window remains bounded (`<=+6`), per-commit cap defaults to `+1`, and `+2` is allowed only under strong evidence at progressive floor (`sim>=0.20`).
- Same-line/behind low-sim handling includes a small relaxed threshold lane (floor-clamped) so stable same-line evidence can proceed without waiting for strict full-threshold confidence.
- Writer commit scroll-truth is single-authority and glide-aware: while writer glide/seek is active, writer is sole scroll authority and helper paths (readability nudge, truth correction, rollback helpers) do not write; after release (`seek inactive` + safety), run one deferred readability pass, then one truth check/correction pass. If mismatch persists, emit `scroll_desync`, clear pending escalation state, and enter bounded resync without accepting that commit as cursor progress.
- Commit settle is forward-monotonic with bounded ahead tolerance: post-commit readability/truth correction can advance scroll, and backward correction is skipped only for small ahead deltas (about one line); larger ahead landings are corrected back.
- Cue-bridge nudge/confirm into content must require strong evidence (`strongSim`, or large sim-gap, or multi-event stability); low-sim nudges may not bridge into regular content lines.
- Commit-time hard deny: forward jumps greater than `+1` line must clear multi-jump floor (`sim>=0.45`), and `sim<0.30` must never commit multi-line.
- Ambiguity is hold-first: for low-confidence/tied/low-information near-line matches, enter HOLD (no commit), continue ingesting, and only relock/commit on strong forward anchor evidence.
- Short-line ambiguity guard: if best line is short (`<=7` content tokens), confidence is weak/moderate, and a nearby runner-up (`±1..2`) has a small sim gap (`<=0.08`), enter HOLD immediately (no commit, no cue-bridge) when evidence is sparse (`<=2` overlap hits) or the pair is structurally near-duplicate (shared start/end tokens or same-shape prefix match).
- Short-line ambiguity must not suppress obvious anchor recovery: when a strong long-anchor candidate is present within the bounded forward window (`+8`), bypass HOLD for that sample and prefer the anchor candidate over adjacent short-line tie candidates.
- In non-final short-line ambiguity HOLD, suppress forced recovery progression (`lost-forward`, watchdog, progressive-floor forcing) and cue-bridge advancement; continue ingesting until anchor rescue resolves.
- HOLD anchor rescue stays bounded: while HOLD is active, scan only the bounded forward window (`+8` lines) and relock only on strong long-anchor evidence.
- LOST_FORWARD rescue must de-prioritize adjacent short-line tie pockets (`±1..2` short candidates with near-tied scores) and favor bounded strong long-anchor relock when available.
- `tp:auto:intent` with `reason='scriptEnd'` must not stop live armed ASR sessions; in `mode='asr' && phase='live' && session.asrArmed=true`, router ignores that stop intent.
- EOF completion is explicit and confirmation-gated in ASR lane: when commit reaches the last speakable line, driver emits one-shot `tp:asr:script-end` to arm completion. Runtime transitions session to `wrap` only after final transcript confirmation (route line at/after last speakable or last-line token overlap evidence), then dispatches session-intent stop (`active=false`) and `tp:session:stop` to avoid endless stall/restart churn and premature tail cutoff.
- Post-commit grace rollback is bounded and final-only: within a short post-commit window, allow a one-line rollback correction only when `cursor-1` is decisively stronger than current final evidence, then enforce cooldown to prevent oscillation.
- Guard profile defaults are relaxed for forward continuity: reduce same-line throttle, lower forced-evidence floors, and trigger watchdog recovery sooner while keeping forward recovery bounded.
- Any non-finite (`NaN`/`Infinity`) value in ASR commit/seek numeric paths must be hard-guarded and dropped; emit a dev diagnostic (`ASR NAN GUARD` / writer non-finite guard) instead of propagating unstable math.
- Forward-evidence may still block backward jumps, large forward skips, and ambiguous multi-line collisions.
- In short-final recent-forward cases, strong forward candidates above floor may satisfy forced-evidence even if general token/char minima are not met.
- `session.scrollAutoOnLive` does not gate ASR live attach/start logic.
- WebSpeech `onend` during an active ASR session must auto-restart recognition; manual/session stop must terminate without restart loops.
- ASR index seeding from `blocks:scroll-mode` must resolve block-first, then derive line within block.
- If derived line is cue-only (`[pause]`, `[beat]`, `[reflective pause]`), advance to the first speakable line in that block.
- ASR anchor/cursor/evidence scans operate on speakable lines only; cue/tag/note-only render lines stay visible in UI but are excluded from ASR match domain.
- Scroll target identity is canonical: resolve scroller via `getScrollerEl()`; for main role this must be `main#viewer.viewer` with `#viewer` fallback.

### 2.1 ASR Bounded Visual Recovery Lanes

Allowed ASR-owned visual correction paths include:

- **Post-commit visual follow**
	- After a validated semantic commit, ASR may perform bounded visual follow to keep the committed/current line near the marker.
	- This does not create a new commit.
- **Post-release protection**
	- After a valid post-commit visual release, ASR may briefly preserve the accepted release target against lower competing authority targets.
- **Visual-debt flatline recovery**
	- When semantic indices are caught up or nearly caught up but geometry shows the trusted line is still far below the marker, ASR may apply a bounded visual correction toward the current/committed semantic anchor.
- **Lead-pressure visual-debt floor**
	- Lead-pressure capping remains globally active.
	- If a mature visual-debt case would otherwise be capped to zero movement, ASR may apply a narrow forward floor toward the current/committed semantic anchor.
- **Post-floor authority protection**
	- After a visual-debt floor is applied, ASR may briefly preserve the floored target against lower competing authority targets.
- **Post-floor pocket-wall protection**
	- During active post-floor protection, pocket-wall backward correction must not roll below the protected floor target while the same/compatible semantic line remains active and visual debt remains large.
- **Safe live pocket correction**
	- ASR may apply narrow local correction when the trusted current/committed line is visually outside the acceptable marker pocket and safety gates pass.
- **Bottom-drift / comfort corrections**
	- ASR may apply bounded reader-comfort correction when the trusted semantic line drifts materially outside the marker pocket near viewport bottom, without advancing semantic truth.

### 2.2 ASR Diagnostic Contract

ASR diagnostics are part of the runtime contract. New ASR movement/recovery paths must emit enough information to prove:

- which authority selected the target
- which semantic line anchor was used
- whether the target came from current/committed semantic truth rather than raw matcher output
- whether movement was forward, backward, or held
- whether the movement was bounded
- whether safety gates passed or rejected
- why a recovery/protection path applied or stood down
- current marker geometry:
	- markerY / markerOffset
	- host height
	- line height
	- current line viewport Y
	- matched/spoken line viewport Y
	- visual debt
	- marker error
- relevant freshness state:
	- visualRecoveryFresh
	- transcript freshness
	- final freshness
	- speech freshness
	- trueVisualSilence
- relevant ASR lifecycle blockers:
	- noMatch/offscript
	- stopped/session mismatch
	- bridge lifecycle
	- contradiction
	- focus loss

Current important ASR visual diagnostics include:

- `ASR_POST_COMMIT_VISUAL_FOLLOW_RELEASE`
- `ASR_POST_RELEASE_AUTHORITY_PROTECTED`
- `ASR_VISUAL_DEADLOCK_ESCAPE`
- `ASR_LEAD_PRESSURE_VISUAL_DEBT_FLOOR_EVALUATED`
- `ASR_LEAD_PRESSURE_VISUAL_DEBT_FLOOR_APPLIED`
- `ASR_POST_FLOOR_AUTHORITY_PROTECTED`
- `ASR_POST_FLOOR_POCKET_WALL_PROTECTED`
- `ASR_VISUAL_AUTHORITY_LEAD_PRESSURE_CAPPED`
- `ASR_POCKET_WALL_EVALUATED`
- `ASR_READER_COMFORT_NUDGE`
- `ASR_VISUAL_DEBT_CATCHUP_BLOCKED`
- `ASR_SAFE_LIVE_POCKET_CORRECTION_APPLIED`
- `ASR_PURSUE`
- `ASR_READER_LINE_MARKER_ERROR`

## 3) Allowed Flows by Mode

- `timed`: timed engine drives movement when `scrollEnabled=true`.
- `wpm`: wpm adapter/timed drive movement when `scrollEnabled=true`.
- `hybrid`: motor + ASR correction lane (no ASR-only commit assertions).
- `hybrid`: speech presence is activity-driven; `noMatch`/low-sim does not imply silence.
- `hybrid`: speech presence includes a short cadence-safe hold window after speech activity so brief between-word gaps do not drop to silence.
- `hybrid`: `tp:asr:silence` is structural input only; do not hard-stop on event receipt. Pause/stop only after configured silence grace.
- `hybrid`: while speech is active, off-script/no-match applies bounded slowdown/decay instead of immediate stop.
- `hybrid`: sustained `hardNoMatch` during active speech (after short grace) must activate off-script slowdown/decay.
- `hybrid`: off-script decay while speech is active keeps a non-zero velocity floor; hard stop remains silence-grace driven.
- `asr`: semantic advancement is commit-driven only; bounded ASR-owned visual recovery/protection may adjust readability target without advancing semantic truth; no motor lane.
- `step`: discrete manual stepping only.
- `rehearsal`: no programmatic movement; clamp behavior only.

## 4) Hydrate Contract

- Profile hydrate must not silently force runtime mode to ASR unless ASR is already engaged or user selected ASR in current session.
- Hydrate writes affecting scroll mode must be attributable (`withScrollModeWriter` metadata with source tags).

## 5) Kick Contract

- Kick is manual movement and never depends on motor/auto-intent.
- Kick resolves scroller by viewer role (`main` vs `display`) before movement.
- In `scrollMode='asr'`, Kick acts as manual forward assist (advance one ASR block when available).
- In `scrollMode='asr'`, Kick must arm manual-anchor adoption near the assisted location so matcher truth can re-lock on local speech instead of remaining on the pre-kick cursor.
- Kick prefers writer path; pixel nudge is fallback.
- Hotkeys and buttons call typed kick entrypoints only.
- Hotkey typing-target suppression may block only `input`, `textarea`, and contenteditable targets; it must not suppress Kick on actionable controls like `button`/`#recBtn`.
- Dev globals are allowed only in dev mode and must not leak to production.

## 6) Scroller Resolution Contract

- All runtime scroll reads/writes (kick, writer, router apply, step, restore, scheduler bridge) must use shared scroller resolution from `src/scroll/scroller.ts`.
- Do not target `document.scrollingElement`/`document.body` for script movement in normal runtime paths.
- Main viewer role target is `main#viewer.viewer` (fallback `#viewer`); display role target is display viewer element (`__tpDisplayViewerEl`) or `#wrap`.

## 7) Forbidden Flows

- Motor tick writes while `scrollMode='asr'`.
- Auto-intent writes while `scrollMode='asr'`.
- Unattributed hydrate mode writes.
- Publishing scroll globals outside `src/index-app.ts`.
- Defining new local ScrollMode unions instead of importing canonical types.
