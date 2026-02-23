/**
 * Wall-clock video synchronization engine.
 *
 * Keeps a `<video>` element's playback position aligned to
 * `(Date.now() / 1000) % duration` using a hybrid correction
 * strategy optimised for cross-browser compatibility:
 *
 *   - Tiny  drift (< 50 ms)  → ignore
 *   - Small drift (50–300 ms) → gentle playbackRate adjustment
 *   - Large drift (> 300 ms)  → hard seek
 *
 * Uses `requestVideoFrameCallback` where available (Safari 15.4+,
 * Chrome 83+) for frame-accurate timing, with `setInterval` fallback.
 */

// ── Configuration ───────────────────────────────────────────────

/** Drift below this is imperceptible — do nothing. */
const DRIFT_IGNORE = 0.05; // 50 ms

/** Drift between IGNORE and SEEK uses playbackRate adjustment. */
const DRIFT_SEEK = 0.3; // 300 ms

/** playbackRate bounds for gentle catch-up / slow-down. */
const RATE_MIN = 0.97;
const RATE_MAX = 1.03;

/** How often to run drift correction (ms) — applies to both rVFC and fallback. */
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
  const raw = getTargetTime(duration) - currentTime;

  if (Math.abs(raw) > duration / 2) {
    return raw - Math.sign(raw) * duration;
  }
  return raw;
}

// ── Controller ──────────────────────────────────────────────────

/**
 * Attach the sync engine to a `<video>` element.
 *
 * Performs an initial seek, starts playback, and continuously
 * corrects drift using the most efficient method available.
 *
 * @returns `cleanup` — call to stop the sync loop.
 */
export async function startSync(
  video: HTMLVideoElement,
  opts: SyncOptions = {},
): Promise<{ cleanup: () => void }> {
  const ignoreThreshold = opts.driftIgnore ?? DRIFT_IGNORE;
  const seekThreshold = opts.driftSeek ?? DRIFT_SEEK;

  // ── Initial sync (always a hard seek) ─────────────────────
  await seekToTarget(video);

  // Fine-tune: the first seek may have taken time
  if (
    Math.abs(computeDrift(video.currentTime, video.duration)) >= ignoreThreshold
  ) {
    await seekToTarget(video);
  }

  try {
    await video.play();
  } catch {
    // Autoplay blocked — muted + autoplay attr should handle this.
  }

  const initialDrift = Math.abs(
    computeDrift(video.currentTime, video.duration),
  );
  console.debug(
    "[sync] initial sync achieved, drift:",
    Math.round(initialDrift * 1000) + "ms",
  );

  // ── Continuous drift correction ─────────────────────────────

  /** Core correction logic — called on every frame (rVFC) or interval. */
  function correct(): void {
    if (!video.duration || isNaN(video.duration) || video.paused) return;

    const drift = computeDrift(video.currentTime, video.duration);
    const absDrift = Math.abs(drift);

    if (absDrift < ignoreThreshold) {
      // Drift is negligible — reset rate if we were adjusting.
      if (video.playbackRate !== 1) {
        video.playbackRate = 1;
      }
      return;
    }

    if (absDrift >= seekThreshold) {
      // Large drift → hard seek (unavoidable).
      console.debug(
        "[sync] hard seek, drift:",
        Math.round(absDrift * 1000) + "ms",
        drift > 0 ? "(behind)" : "(ahead)",
      );
      video.playbackRate = 1;
      video.currentTime = getTargetTime(video.duration);
      return;
    }

    // Small drift → gentle playbackRate nudge.
    // Scale the rate proportionally to the drift size.
    const factor = absDrift / seekThreshold; // 0 → 1
    const adjustment = factor * (RATE_MAX - 1); // 0 → 0.03

    const newRate =
      drift > 0
        ? Math.min(1 + adjustment, RATE_MAX) // behind → speed up
        : Math.max(1 - adjustment, RATE_MIN); // ahead  → slow down

    // Only write if the value actually changed (avoid Safari layout thrash).
    if (Math.abs(video.playbackRate - newRate) > 0.001) {
      video.playbackRate = newRate;
      console.debug(
        "[sync] rate-adjust:",
        newRate.toFixed(3),
        "drift:",
        Math.round(absDrift * 1000) + "ms",
      );
    }
  }

  // ── Choose the best loop mechanism ──────────────────────────

  let stopped = false;

  if ("requestVideoFrameCallback" in video) {
    // rVFC fires every frame — throttle so correct() only runs periodically.
    let lastCheckTime = 0;
    function rvfcLoop(): void {
      if (stopped) return;
      const now = performance.now();
      if (now - lastCheckTime >= CHECK_INTERVAL_MS) {
        lastCheckTime = now;
        correct();
      }
      video.requestVideoFrameCallback(rvfcLoop);
    }
    video.requestVideoFrameCallback(rvfcLoop);
  } else {
    // Fallback: setInterval at a conservative cadence.
    const timer = setInterval(correct, CHECK_INTERVAL_MS);
    const origCleanup = () => clearInterval(timer);
    return {
      cleanup: () => {
        stopped = true;
        origCleanup();
      },
    };
  }

  return {
    cleanup: () => {
      stopped = true;
      if (video.playbackRate !== 1) {
        video.playbackRate = 1;
      }
    },
  };
}

// ── Internal ────────────────────────────────────────────────────

function seekToTarget(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    video.currentTime = getTargetTime(video.duration);
    video.addEventListener("seeked", () => resolve(), { once: true });
  });
}
