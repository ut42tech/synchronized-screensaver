/**
 * Wall-clock video synchronization engine.
 *
 * Keeps a `<video>` element's playback position aligned to
 * `(Date.now() / 1000) % duration` using a hybrid correction strategy:
 *
 *   - Tiny  drift (< 50 ms)  → ignore
 *   - Small drift (50–300 ms) → gentle playbackRate adjustment
 *   - Large drift (> 300 ms)  → hard seek
 *
 * Uses a lightweight `setInterval` loop (0.5 calls/sec) and
 * pauses automatically when the tab is hidden via `visibilitychange`.
 */

// ── Configuration ───────────────────────────────────────────────

/** Drift below this is imperceptible — do nothing. */
const DRIFT_IGNORE = 0.05; // 50 ms

/** Drift between IGNORE and SEEK uses playbackRate adjustment. */
const DRIFT_SEEK = 0.3; // 300 ms

/** playbackRate bounds for gentle catch-up / slow-down. */
const RATE_MIN = 0.97;
const RATE_MAX = 1.03;
const RATE_RANGE = RATE_MAX - 1; // 0.03 — pre-computed

/** How often to run drift correction (ms). */
const CHECK_INTERVAL_MS = 2_000;

export interface SyncOptions {
  /** Drift below which no correction occurs (default: 0.05 s). */
  driftIgnore?: number;
  /** Drift above which a hard seek is performed (default: 0.3 s). */
  driftSeek?: number;
}

// ── Pure helpers ────────────────────────────────────────────────

/** Where playback *should* be right now, based on the wall clock. */
export function getTargetTime(duration: number): number {
  return (Date.now() / 1000) % duration;
}

/**
 * Signed drift (seconds) between actual and expected position.
 * Handles the loop-boundary wrap-around correctly.
 */
export function computeDrift(currentTime: number, duration: number): number {
  const target = (Date.now() / 1000) % duration; // inline getTargetTime
  const raw = target - currentTime;

  // Wrap-around: if raw drift exceeds half the duration,
  // the shortest correction path crosses the loop boundary.
  if (raw > duration * 0.5) return raw - duration;
  if (raw < duration * -0.5) return raw + duration;
  return raw;
}

// ── Controller ──────────────────────────────────────────────────

/**
 * Attach the sync engine to a `<video>` element.
 *
 * Performs an initial seek, starts playback, and continuously
 * corrects drift using a lightweight `setInterval` loop.
 * Automatically pauses when the tab is hidden and re-syncs
 * on return.
 *
 * @returns `cleanup` — call to stop the sync loop.
 */
export async function startSync(
  video: HTMLVideoElement,
  opts: SyncOptions = {},
): Promise<{ cleanup: () => void }> {
  const ignoreThreshold = opts.driftIgnore ?? DRIFT_IGNORE;
  const seekThreshold = opts.driftSeek ?? DRIFT_SEEK;

  // Cache duration — it won't change for a looping video.
  const dur = video.duration;

  // ── Initial sync (always a hard seek) ─────────────────────
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

  // ── Correction function ───────────────────────────────────

  /** Core correction — runs every CHECK_INTERVAL_MS. */
  function correct(): void {
    if (video.paused) return;

    const drift = computeDrift(video.currentTime, dur);
    const absDrift = drift > 0 ? drift : -drift; // avoid Math.abs call

    if (absDrift < ignoreThreshold) {
      // Drift is negligible — reset rate if we were adjusting.
      if (video.playbackRate !== 1) video.playbackRate = 1;
      return;
    }

    if (absDrift >= seekThreshold) {
      // Large drift → hard seek.
      console.debug(
        "[sync] hard seek, drift:",
        Math.round(absDrift * 1000) + "ms",
        drift > 0 ? "(behind)" : "(ahead)",
      );
      video.playbackRate = 1;
      video.currentTime = (Date.now() / 1000) % dur;
      return;
    }

    // Small drift → proportional playbackRate nudge.
    const factor = absDrift / seekThreshold; // 0 → 1
    const adjustment = factor * RATE_RANGE; // 0 → 0.03

    const newRate =
      drift > 0
        ? Math.min(1 + adjustment, RATE_MAX) // behind → speed up
        : Math.max(1 - adjustment, RATE_MIN); // ahead  → slow down

    // Only write if the value actually changed (avoids Safari layout thrash).
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
      // Tab became visible — hard re-seek then restart corrections.
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
