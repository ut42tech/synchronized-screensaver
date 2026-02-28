/**
 * Wall-clock video synchronization engine.
 *
 * Keeps a `<video>` element's playback position aligned to
 * `(Date.now() / 1000) % duration` using a **proportional rate
 * controller** — no hard seeks during playback, so WebKit never
 * flushes its decode pipeline and playback never stutters.
 *
 *   - Tiny drift (< 50 ms)  → ignore (rate = 1.0)
 *   - Any larger drift       → proportional playbackRate nudge
 *
 * Formula:  newRate = clamp(1 + drift × GAIN, RATE_MIN, RATE_MAX)
 *
 * Pauses automatically when the tab is hidden and re-syncs
 * (hard seek — acceptable since the tab was invisible) on return.
 */

// ── Configuration ───────────────────────────────────────────────

/** Drift below this is imperceptible — do nothing. */
const DRIFT_IGNORE = 0.05; // 50 ms

/**
 * Proportional gain: how aggressively to correct.
 * Stability constraint: GAIN ≤ 1 / CHECK_INTERVAL_S = 0.5.
 * We use 0.4 for a comfortable stability margin (~80% correction per step).
 */
const GAIN = 0.4;

/** playbackRate bounds — wide enough to correct large drifts smoothly. */
const RATE_MIN = 0.5;
const RATE_MAX = 1.5;

/** How often to run drift correction (ms). */
const CHECK_INTERVAL_MS = 2_000;

export interface SyncOptions {
  /** Drift below which no correction occurs (default: 0.05 s). */
  driftIgnore?: number;
  /** Proportional gain for rate correction (default: 0.4). */
  gain?: number;
}

// ── Pure helpers ────────────────────────────────────────────────

/** Where playback *should* be right now, based on the wall clock. */
export function getTargetTime(duration: number): number {
  return (Date.now() / 1000) % duration;
}

/**
 * Signed drift (seconds) between actual and expected position.
 * Positive = behind (needs to speed up), negative = ahead.
 * Handles the loop-boundary wrap-around correctly.
 */
export function computeDrift(currentTime: number, duration: number): number {
  const target = (Date.now() / 1000) % duration;
  const raw = target - currentTime;

  // Wrap-around: shortest correction path may cross the loop boundary.
  if (raw > duration * 0.5) return raw - duration;
  if (raw < duration * -0.5) return raw + duration;
  return raw;
}

// ── Controller ──────────────────────────────────────────────────

/**
 * Attach the sync engine to a `<video>` element.
 *
 * Performs an initial seek (while video is invisible), starts
 * playback, and continuously corrects drift using only
 * `playbackRate` — never setting `currentTime` during playback.
 *
 * @returns `cleanup` — call to stop the sync loop.
 */
export async function startSync(
  video: HTMLVideoElement,
  opts: SyncOptions = {},
): Promise<{ cleanup: () => void }> {
  const ignoreThreshold = opts.driftIgnore ?? DRIFT_IGNORE;
  const gain = opts.gain ?? GAIN;

  // Cache duration — doesn't change for a looping video.
  const dur = video.duration;

  // ── Initial sync (hard seek is safe — video is invisible) ──
  await seekToTarget(video, dur);

  // Fine-tune: the first seek may have taken time.
  if (Math.abs(computeDrift(video.currentTime, dur)) >= ignoreThreshold) {
    await seekToTarget(video, dur);
  }

  try {
    await video.play();
  } catch {
    // Autoplay blocked — muted + autoplay attr should handle this.
  }

  console.debug(
    "[sync] initial drift:",
    Math.round(Math.abs(computeDrift(video.currentTime, dur)) * 1000) + "ms",
  );

  // ── Proportional rate correction ──────────────────────────

  function correct(): void {
    if (video.paused) return;

    const drift = computeDrift(video.currentTime, dur);
    const absDrift = drift > 0 ? drift : -drift;

    if (absDrift < ignoreThreshold) {
      // Drift is negligible — reset rate if we were adjusting.
      if (video.playbackRate !== 1) video.playbackRate = 1;
      return;
    }

    // Proportional correction: rate scales linearly with drift.
    // Never touches video.currentTime → zero stutter in WebKit.
    const rawRate = 1 + drift * gain;
    const newRate =
      rawRate > RATE_MAX ? RATE_MAX : rawRate < RATE_MIN ? RATE_MIN : rawRate;

    // Only write if the value actually changed (avoids WebKit layout thrash).
    const rateDelta = video.playbackRate - newRate;
    if (rateDelta > 0.001 || rateDelta < -0.001) {
      video.playbackRate = newRate;
      console.debug(
        "[sync] rate:",
        newRate.toFixed(3),
        "drift:",
        Math.round(absDrift * 1000) + "ms",
      );
    }
  }

  // ── Timer lifecycle ───────────────────────────────────────

  let timer: ReturnType<typeof setInterval> | null = null;

  function startTimer(): void {
    if (timer !== null) return;
    timer = setInterval(correct, CHECK_INTERVAL_MS);
  }

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  // ── Visibility-aware pause / resume ───────────────────────

  function onVisibilityChange(): void {
    if (document.hidden) {
      stopTimer();
    } else {
      // Tab became visible — hard seek is acceptable here because
      // the tab was invisible, so the brief decode stall is hidden
      // behind the browser's own tab-switching recomposition.
      video.currentTime = (Date.now() / 1000) % dur;
      if (video.paused) {
        video.play().catch(() => {});
      }
      startTimer();
    }
  }

  document.addEventListener("visibilitychange", onVisibilityChange);

  // Start the correction timer.
  startTimer();

  // ── Unified cleanup ───────────────────────────────────────

  return {
    cleanup(): void {
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (video.playbackRate !== 1) video.playbackRate = 1;
    },
  };
}

// ── Internal ────────────────────────────────────────────────────

function seekToTarget(
  video: HTMLVideoElement,
  duration: number,
): Promise<void> {
  return new Promise((resolve) => {
    video.currentTime = (Date.now() / 1000) % duration;
    video.addEventListener("seeked", () => resolve(), { once: true });
  });
}
