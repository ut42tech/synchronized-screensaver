<script lang="ts">
  /**
   * Synchronized Screensaver
   *
   * Plays a full-screen video synchronized across multiple devices
   * by aligning playback position to the current wall-clock time.
   *
   * Sync formula:
   *   currentTime = (Date.now() / 1000) % video.duration
   */

  // ── Configuration ──────────────────────────────────────────────
  const VIDEO_SRC = '/videos/sample.mp4';
  const RESYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  // ── State ──────────────────────────────────────────────────────
  let videoEl: HTMLVideoElement;

  /**
   * Calculate the expected playback position from the current UTC
   * time and force the video element to that position.
   */
  function syncPlayback(): void {
    if (!videoEl || !videoEl.duration || isNaN(videoEl.duration)) return;

    const nowSec = Date.now() / 1000;
    const targetTime = nowSec % videoEl.duration;
    videoEl.currentTime = targetTime;
  }

  /** Called once video metadata (duration) is available. */
  function onLoadedMetadata(): void {
    syncPlayback();
    videoEl.play().catch(() => {
      // Autoplay may be blocked; muted + autoplay attribute should suffice.
    });
  }

  // Periodic drift correction
  $effect(() => {
    const id = setInterval(syncPlayback, RESYNC_INTERVAL_MS);
    return () => clearInterval(id);
  });
</script>

<video
  bind:this={videoEl}
  src={VIDEO_SRC}
  onloadedmetadata={onLoadedMetadata}
  autoplay
  loop
  muted
  playsinline
></video>

<style>
  video {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
