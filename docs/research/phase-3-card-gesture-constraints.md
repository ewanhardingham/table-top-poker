# Research: accessible browser constraints for Phase 3 card gestures

Resolves [Research constraints for an accessible browser-based card gesture surface](https://github.com/ewanhardingham/table-top-poker/issues/109).

**Question.** What current primary-source accessibility and browser-platform constraints must the Phase 3 tactile Hole-card surface satisfy?

**Scope.** This note updates only the Phase 3-specific gaps in [the existing frontend gesture-stack research](./frontend-gesture-stack.md). That note already settles Pointer Events, capture, `touch-action`, iOS callout/selection suppression, edge insets, viewport sizing, and transform-only animation. Those findings remain the baseline and are not repeated here. Dedicated `prefers-reduced-motion` behavior is out of scope by decision of the Phase 3 map.

Research checked against current primary sources on 1 August 2026.

## Headline

The proposed gesture grammar is viable, but only as a progressively enhanced layer over ordinary controls:

- Upward flick-to-Fold is both path-based and dragging, so an equivalent single-point, non-dragging Fold control must ship. Removing the current Fold button is invalid unless the prototype supplies another operable equivalent.
- Peel-to-Peek is dragging. Persistent Reveal is probably an adequate alternative if the required outcome is simply reading the cards. If the specification treats *temporary, privacy-preserving inspection* as separate functionality, it needs its own non-dragging control; this is a product decision the prototype must expose rather than silently assume.
- Double-tap Check and long-press Reveal are accepted examples of single-pointer, non-path gestures, but keyboard operation cannot require gesture timing. Check and Reveal therefore need immediate, focusable keyboard operations with clear semantics.
- A server Action must never commit on `pointerdown`, on crossing a threshold, or on the long-press timer. Commit on the completing `pointerup`; cancellation before release restores the stable presentation. This matches both WCAG pointer cancellation and the already-chosen release-to-commit Fold model.
- Browser vibration is not cross-browser haptics. In 2026 it exists only in Blink; WebKit has never shipped it and Firefox removed it. A threshold pulse can be attempted on Android Chrome, but must have no semantic meaning and no effect on the interaction state.

## 1. What retaining buttons does—and does not—satisfy

[WCAG 2.2 SC 2.5.1](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures) requires functionality triggered by a multipoint or path-based gesture to also work with a single pointer without a path. W3C explicitly classifies a directional flick as path-based and explicitly lists tap, double-tap, long-press, and click-and-hold as acceptable non-path alternatives. Keyboard access alone is not sufficient for this criterion.

[SC 2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) separately requires every dragging function to have a single-pointer mode that does not drag. The equivalent control can be elsewhere on the same page, but a keyboard-only alternative does not satisfy this pointer requirement.

Applied to the proposed grammar:

| Function | Enhanced gesture | Required simple alternative | Phase 3 consequence |
| --- | --- | --- | --- |
| Fold | Upward directional flick and release | Tap/click Fold control | Keep the Fold button unless an equivalent one-point replacement is designed and tested. |
| Peek | Hold and drag a corner | Non-dragging access to the same underlying function | Reveal suffices only if “read my cards” is the function. A separately meaningful temporary/private Peek needs its own alternative. |
| Reveal / Conceal | Long-press toggle | Not required by SC 2.5.1 because long-press is itself non-path; keyboard still cannot depend on timing | Provide an immediate keyboard/assistive-technology toggle. |
| Check | Double-tap | Not required by SC 2.5.1 because double-tap is non-path; keyboard still cannot depend on timing | Retaining the Check button is the clean semantic and keyboard path. |

The W3C's broader [Input Modalities guidance](https://www.w3.org/WAI/WCAG22/Understanding/input-modalities.html) calls long presses, swipes, and other timed or complex gestures difficult for some users and recommends an untimed alternative. Keeping ordinary Action buttons therefore does more than satisfy flick/drag rules: it keeps the prototype usable while gesture discoverability and error rates are evaluated.

The alternative must be genuinely operable, not merely described in a hint. Contextual copy such as “Flick up to fold” teaches the enhancement; it does not replace the Fold control. Pointer targets should also meet WCAG's [24 by 24 CSS pixel minimum or its spacing exception](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), which the full-size cards easily do but any compact fallback icon may not.

## 2. Keyboard, focus, and semantics

[SC 2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard) requires all functionality to be operable through a keyboard interface without requiring specific timing. Poker Fold, Check, Reveal, and reading the Hole cards do not intrinsically depend on a movement path, so the exception for freehand/path-dependent functions does not apply.

The accessibility tree should expose the interaction as ordinary named controls, not as one mysterious “card” widget with several undiscoverable verbs:

- Use real HTML buttons for Fold, Check, Call, and Raise. Preserve the visible button text in each accessible name, as required by [SC 2.5.3 Label in Name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name).
- Expose Reveal as a separate toggle operation. A native button with a stable name such as “Reveal hole cards” and `aria-pressed` is a good model; WAI's [Button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/) defines Enter and Space activation and `aria-pressed` for toggle state. A command button whose visible/name text changes between “Reveal” and “Conceal” is also understandable, but should not also claim toggle semantics.
- Treat the visual card pair as a labelled Hole-card group. While concealed, do not expose the rank and suit through hidden face markup. After Reveal (or public Showdown), expose each rank and suit as card content. Folded cards leave the accessible presentation just as they leave the visual one.
- If Action availability changes, expose that disabled state programmatically. If a control stays focusable with `aria-disabled`, code must also suppress activation; ARIA does not add behavior. WAI explicitly warns that [an ARIA role is a promise](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/), so native elements are safer than reconstructed `div` buttons.
- Keep a visible `:focus-visible` treatment on every operable control. [SC 2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible) requires the focused control to remain visually identifiable.
- Announce Action pending/rejection text without moving focus. A server acknowledgement or rejection that appears visually is a status result; [SC 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages) requires that such information be programmatically determinable so assistive technology can present it without receiving focus.

This does not require a second visually dominant control layer. The buttons may be secondary to the tactile surface, but they must remain reachable, named, large enough, and operable by pointer and keyboard.

## 3. One recognizer must arbitrate the entire card surface

The current [Pointer Events editor's draft](https://w3c.github.io/pointerevents/) adds two especially relevant cautions to the earlier research:

1. `click`, `auxclick`, and `contextmenu` are high-level `PointerEvent`s, not compatibility mouse events. Calling `preventDefault()` on a lower-level pointer event does **not** determine whether they fire. Their order relative to pointer events varies between browsers, and user agents apply their own movement and long-press heuristics.
2. Tap and double-tap recognition thresholds are deliberately outside the Pointer Events specification. `touch-action: manipulation` excludes browser double-tap zoom, while `touch-action: none` excludes panning and zooming for interactions beginning on the surface, but neither gives the app a standard double-tap duration.

Consequently, independent `onClick`, long-press, drag, and double-tap handlers on the same DOM subtree are not a safe composition. The prototype needs one explicit recognizer/state machine with one active `pointerId`, a shared movement tolerance, and mutually exclusive outcomes. It should:

- begin in an undecided state on `pointerdown` and capture the pointer;
- let early movement cancel the stationary long-press/double-tap candidate and enter Peek or Fold tracking;
- show long-press readiness/reveal feedback at the timer threshold, but commit the persistent Reveal/Conceal toggle only when the pointer is released in a valid state;
- recognize Check only after the second completed tap, and only if Check is still legal at that second `pointerup`;
- commit Fold only at `pointerup`, after both direction and distance/velocity thresholds pass and Fold is still legal;
- explicitly consume or de-duplicate the later `click`/`contextmenu` path so one physical interaction cannot trigger a second operation;
- cancel the candidate, all timers, temporary Peek, and transformed card position on `pointercancel` or `lostpointercapture`.

The first tap is intentionally a no-op in the user's preferred long-press variant, which avoids delaying a single-tap action while waiting to see whether a second tap arrives. The single-tap Reveal variant remains useful as a comparison because it is simpler, but it necessarily competes with double-tap Check and needs a deferred single-tap decision or a reversible preview.

Do not rely on `isPrimary` alone to enforce a single-finger grammar. The Pointer Events specification defines a primary pointer *per pointer type*, so a touch and mouse/pen can both be primary. Track the accepted `pointerId`; if another pointer enters during an unresolved gesture, cancel the gesture rather than risk promoting an accidental multi-touch contact into Check or Fold.

The existing callout/selection mitigations remain necessary for long-press, but `touch-action` does not suppress text selection, native activation, or context menus. Real iPhone/Safari testing remains mandatory because the browser may order `contextmenu`, `pointerup`, and `pointercancel` differently from Chromium.

## 4. Cancellation and leaving the foreground

[WCAG SC 2.5.2 Pointer Cancellation](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation) identifies activation on the down-event as a failure and gives the matching pattern for this UI: activate on release; releasing before/away from the valid target cancels or reverses the interaction. Therefore:

- threshold crossing is feedback, not commitment;
- a sub-threshold Fold snaps back;
- a canceled Peek restores the pre-gesture concealed/revealed presentation;
- a canceled long-press does not leave the toggle changed;
- no Check or Fold Action intent is emitted before the completing release.

The Pointer Events specification requires `pointercancel` when the browser suppresses a stream and lists viewport manipulation, orientation change, modal UI, device loss, palm rejection, and excess pointers as causes. It also implicitly releases capture after `pointerup` or `pointercancel`. Handle `lostpointercapture` as a defensive cancellation path as well; do not assume every interruption looks like a clean `pointerup`.

`pointercancel` is not the privacy boundary for app switching. [Page Visibility Level 2](https://www.w3.org/TR/page-visibility-2/) defines `visibilitychange` and the `hidden` state for background tabs, minimized browsers, and operating-system lock screens. On transition to hidden, synchronously cancel recognizer timers and uncommitted gestures, clear temporary Peek/reveal feedback, and reset the local Hole-card presentation face-down. A Fold or Check already emitted on release is no longer locally cancellable; reconcile that pending Action from server state when the page returns.

## 5. Vibration is a Blink-only enhancement

The current W3C [Vibration API implementation report](https://w3c.github.io/vibration/reports/implementation.html) records only one shipping engine: Blink. Firefox removed the API in version 129, and WebKit has never shipped it and formally opposes it. The Phase 3 iPhone/Safari acceptance device will therefore never receive a web vibration pulse.

Even in Blink, the [Vibration API specification](https://w3c.github.io/vibration/) requires sticky user activation and a visible document, permits the user agent to return `false` or ignore requests, and does not expose whether vibration is enabled or physically felt. Vibration is aborted when the top-level document becomes hidden. A successful-looking API call is not evidence that the player felt anything.

A threshold pulse is safe only under this contract:

- feature-detect `navigator.vibrate` and attempt one short pulse on the first crossing into the armed Fold threshold during a gesture;
- never use the pulse to communicate legality, commitment, success, rejection, or any information absent from the visual surface;
- never alter state based on the method's presence or return value;
- do not pulse continuously while the pointer oscillates around the threshold;
- validate the no-haptic path first on iPhone/Safari, then treat observed Android/Chrome feedback as optional polish.

No library can make this portable: iOS does not expose a web vibration primitive for it to wrap.

## 6. Constraints on the prototype variants

The following comparisons remain valid:

- single-tap Reveal versus long-press Reveal;
- per-card versus coordinated pair Peek;
- side-by-side versus overlapped/fanned cards;
- button Check versus exact double-tap Check;
- button Fold versus upward flick Fold as the preferred interaction.

But the prototype should reject a variant regardless of subjective feel if it:

- removes Fold's simple one-point control without an equivalent replacement;
- makes any poker Action occur before the completing release;
- requires timed keyboard input;
- exposes face-down ranks/suits to the accessibility tree;
- leaves a transformed or temporarily revealed card after cancellation/backgrounding;
- allows a browser-generated `click` or `contextmenu` to trigger a second outcome;
- depends on vibration for understanding or safety;
- or presents one multi-action card surface as though it were one semantically coherent button.

The minimum hands-on matrix already chosen by the map is the correct one: real iPhone/Safari for callout, cancellation, screen-edge behavior, and the guaranteed no-haptic path; real Android/Chrome for the Blink vibration path and system navigation; desktop mouse and keyboard for focus order, immediate Reveal, and Action fallbacks. Add at least one mobile screen-reader pass before the build-ready spec is considered complete, because semantic activation can synthesize high-level `click` events without following the same raw pointer sequence as direct touch.
