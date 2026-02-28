/**
 * Wall-clock video synchronization engine.
 *
 * Synchronizes video playback across devices using wall-clock
 * loop boundaries — **zero corrections during playback**.
 *
 * Strategy:
 *   1. Initial load  → seek to current wall-clock position → play
 *   2. On `ended`    → seek to frame 0, wait for next loop boundary → play
 *   3. During playback → no corrections at all
 *
 * Loop boundaries are defined by:
 *   boundary_n = n × duration  (wall-clock seconds since epoch)
 */

// ── Pure helpers ────────────────────────────────────────────────

/** Where playback *should* be right now, based on the wall clock. */
export function getTargetTime(duration: number): number {
  return (Date.now() / 1000) % duration;
}

// ── Controller ──────────────────────────────────────────────────

/**
 * Attach the sync engine to a `<video>` element.
 *
 * Performs an initial seek (to current wall-clock position) and
 * starts playback immediately. Subsequent loops are aligned to
 * wall-clock boundaries with zero in-playback corrections.
 *
 * @returns `cleanup` — call to stop the sync loop.
 */
export async function startSync(
  video: HTMLVideoElement,
): Promise<{ cleanup: () => void }> {
  const dur = video.duration;
  let stopped = false;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Initial sync: seek to current position → play immediately ──
  video.currentTime = getTargetTime(dur);
  await new Promise<void>((resolve) =>
    video.addEventListener("seeked", () => resolve(), { once: true }),
  );

  try {
    await video.play();
  } catch {
    // Autoplay blocked — muted + playsinline should handle this.
  }

  console.debug(
    "[sync] initial play at",
    video.currentTime.toFixed(2) + "s",
    "/ " + dur.toFixed(2) + "s",
  );

  // ── Loop boundary scheduling ──────────────────────────────

  function scheduleNextLoop(): void {
    if (stopped) return;

    // Seek to frame 0 (video is paused after 'ended').
    video.currentTime = 0;

    const nowSec = Date.now() / 1000;
    const elapsed = nowSec % dur;
    const remaining = dur - elapsed;

    // Pick the shortest path to a boundary:
    //   elapsed ≤ remaining  → we just passed a boundary → play now
    //   remaining < elapsed  → the next boundary is closer → wait
    const waitMs = elapsed <= remaining ? 0 : remaining * 1000;

    console.debug("[sync] loop boundary wait:", Math.round(waitMs) + "ms");

    if (waitMs < 16) {
      // Less than one frame — play synchronously to avoid setTimeout jitter.
      video.play().catch(() => {});
    } else {
      pendingTimer = setTimeout(() => {
        if (stopped) return;
        pendingTimer = null;
        video.play().catch(() => {});
      }, waitMs);
    }
  }

  // ── Event handlers ────────────────────────────────────────

  function onEnded(): void {
    scheduleNextLoop();
  }

  function onVisibilityChange(): void {
    if (document.hidden) {
      // Tab hidden → cancel pending timer, pause video.
      if (pendingTimer !== null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      video.pause();
    } else {
      // Tab visible → re-sync to current wall-clock position.
      video.currentTime = getTargetTime(dur);
      video.play().catch(() => {});
    }
  }

  video.addEventListener("ended", onEnded);
  document.addEventListener("visibilitychange", onVisibilityChange);

  // ── Cleanup ───────────────────────────────────────────────

  return {
    cleanup(): void {
      stopped = true;
      if (pendingTimer !== null) clearTimeout(pendingTimer);
      video.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
