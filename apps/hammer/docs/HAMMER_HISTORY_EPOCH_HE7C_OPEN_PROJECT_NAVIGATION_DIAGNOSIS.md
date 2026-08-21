# Hammer History Epoch HE-7C — Open Project Navigation Diagnosis

Status: decision-complete diagnosis; no application repair and no HE-7 receipt.

Date: 2026-08-20 (UTC evidence timestamps below)

Code baseline: `837a52e035c13ce984fc1a33471a28fef5becb41`

Production evidence source: frozen HE-7 retest package at `D:\nursery\he7-retest-20260820` only.

## Decision

The failed HE-7 retest was not a Hammer library navigation regression, stale React selection, malformed route, authentication/readiness guard, or application exception. The captured action did not reach the observable React Router navigation boundary. The evidence is most consistent with an in-app-browser automation delivery/environment failure in the `expectNavigation`-wrapped action, compounded by unsupported post-click performance evaluation in that browser-control surface.

No Hammer production code change is justified by this incident. Before another HE-7 authorization, the acceptance automation should be corrected separately to use a direct actionable locator click followed by an explicit SPA URL wait and DOM assertion, without wrapping the click in the browser client's navigation helper and without using the unsupported performance-evaluation result as a navigation marker.

## Frozen HE-7 evidence

The authenticated Hammer library showed exactly one Florida card with:

- label `Florida Oranges`;
- workspace `494c2ae5-9037-4208-b898-fab4898ab430`;
- workpiece `85d076d6-54e6-4b56-ab60-5eff4c87cdd0`;
- CSS state `hammer-project-library__card is-selected`;
- `Canonical recording available`, `Hammer session saved`, and `Transcript artifact saved` indicators.

The `Open Project` control was present without a `disabled` state. The browser locator action completed without an actionability, interception, overlay, disabled-control, or timeout error. The page nevertheless remained at `http://127.0.0.1:5173/app/hammer`. The page console contained only the React DevTools informational message—no application exception, rejected promise, authentication failure, or route error. No editor request or Hammer mount was observed.

The post-click performance collector failed inside the browser-control evaluation boundary with `Cannot read properties of undefined (reading 'now')`; this was an automation-side diagnostic failure after the action callback, not a page console error. It means the attempted resource-timing capture is not usable as network evidence. The authoritative no-write evidence remains the pre/post production snapshot comparison.

Baseline at `2026-08-20T23:53:40.052Z` and post-action capture at `2026-08-20T23:56:43.050Z` both produced:

- canonical snapshot SHA-256 `b4a26b9ceeeee2901b832507020277b9fba40571debf25680303346548e53384`;
- revision token `2026-08-20T18:47:02.687149+00:00`;
- nine registry objects;
- one epoch and one epoch transition;
- zero heads and zero head transitions;
- unchanged editor session `session_fc4374ab-0097-4c0f-abd5-5a0099940abf`.

Therefore the failed action caused no persisted write.

## Application trace

`HammerProjectLibrary` derives `selectedProject` by finding `selectedWorkpieceId` in the loaded `projects` array. The captured selected-card class and enabled header button establish that Florida was the selected project at render and that `selectedProject` was non-null.

The header button invokes `openProject(selectedProject)` directly. The handler has exactly one guard: `if (!project) return`. It does not inspect authentication, readiness, loading, revision state, persistence state, or recording state. With the captured card, the handler inputs are:

```text
workspaceId = 494c2ae5-9037-4208-b898-fab4898ab430
workpieceId = 85d076d6-54e6-4b56-ab60-5eff4c87cdd0
revisionId  = unavailable at this boundary; resolved only during editor hydration
```

`buildHammerCanonicalEditorHref()` retains inherited query parameters, replaces `workspace_id` and `workpiece_id`, and removes `hammer_stub` and `output`. From the captured `/app/hammer` location, the exact target is:

```text
/app/hammer/editor?workspace_id=494c2ae5-9037-4208-b898-fab4898ab430&workpiece_id=85d076d6-54e6-4b56-ab60-5eff4c87cdd0
```

The handler then calls React Router `navigate()` synchronously. It does not use `window.location`, a form submission, or an asynchronous promise. There is no catch that can swallow a route-construction or navigation exception. A synthetic History API failure showed that React Router silently falls back to hard document navigation; that observable fallback did not occur in the frozen HE-7 run. Thus neither route construction nor a handler exception explains the unchanged library URL.

## Synthetic browser reproduction

A temporary, uncommitted Playwright harness rendered the real `HammerProjectLibrary` component inside a real `BrowserRouter`. It used a synthetic sealed-recording project and stubbed loopback Tongs responses. The harness asserted that all non-loopback requests were blocked before transmission and was removed after execution.

Final run: eight tests passed in 7.1 seconds.

1. Pointer activation of `Open Project` navigated once to the exact editor route.
2. Keyboard `Enter` activation of the selected card navigated to the same route.
3. A data-load rerender preserved the valid selection and navigation target.
4. Loading disabled the button; a stale route workpiece could not replace the loaded synthetic project identity.
5. Missing selection kept the button disabled and prevented navigation.
6. Double activation produced one editor mount.
7. Malformed inherited query data was deterministically normalized; workspace/workpiece route identities remained exact.
8. A synthetic History API exception did not surface its original message, but produced a hard-navigation fallback, making that failure observably different from HE-7.

The pointer case recorded zero non-GET persistence requests and exactly one editor mount. The local component therefore satisfies the requested normal navigation behavior; no persistence write is intrinsic to navigation.

## Classification by candidate

- Real library navigation regression: rejected; the real component passed pointer, keyboard, rerender, and duplicate-activation browser cases.
- Stale React selection state: rejected; frozen UI showed Florida selected and the button enabled, while the synthetic stale-selection case remained deterministic.
- Malformed route construction: rejected; the builder produced the exact canonical URL and normalized malformed inherited search without losing target identities.
- Authentication/readiness early return: rejected; no such guard exists in `openProject`, and the captured button was enabled.
- Application exception: rejected for HE-7; no page error or hard-navigation fallback was recorded.
- Intercepted/undelivered automation input or environment-specific browser problem: accepted. This is the only classification consistent with the frozen unchanged URL plus the passing real-component browser reproduction.

## Safety note

During the first temporary harness attempt, loading the normal root document before the loopback guard was installed caused the configured Supabase client to attempt refresh-token requests to the production Auth origin. They failed with HTTP 400 `Invalid Refresh Token: Refresh Token Not Found`; no Florida/Anvil identifier, artifact, application query, or mutation was involved. The harness was immediately changed to serve a synthetic HTML document and install a pre-request loopback assertion. A later deliberately induced navigation-failure request toward that origin was intercepted and blocked before transmission. This exception to the requested no-production-contact boundary is recorded here rather than concealed.

## Separate correction and next gate

The separate automation correction should:

1. use the selected card and enabled-button assertions already captured;
2. call the button locator's direct `click()` once;
3. wait explicitly for the exact SPA editor URL;
4. capture DOM/console/network state only through supported browser APIs;
5. fail before any second click if the URL does not change;
6. retain the pre/post zero-write snapshot comparison.

No application repair, Florida reopen, HE-7 receipt, or HE-8 work is included. HE-8 remains blocked.
