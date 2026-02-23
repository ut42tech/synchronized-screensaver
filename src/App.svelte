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
  const VIDEO_DIR = '/videos/';
  const RESYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  // ── State ──────────────────────────────────────────────────────
  // svelte-ignore non_reactive_update
    let videoEl: HTMLVideoElement;
  let videoSrc = $state('');

  /**
   * Discover video files from the /videos/ directory.
   * Uses nginx autoindex (JSON format) in production,
   * falls back to a known manifest endpoint for development.
   */
  async function discoverVideos(): Promise<string[]> {
    try {
      const res = await fetch(VIDEO_DIR);
      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        // nginx autoindex JSON response
        const entries: { name: string; type: string }[] = await res.json();
        return entries
          .filter((e) => e.type === 'file' && /\.mp4$/i.test(e.name))
          .map((e) => `${VIDEO_DIR}${e.name}`)
          .sort();
      }

      // Fallback: parse HTML directory listing
      const html = await res.text();
      const matches = html.match(/href="([^"]+\.mp4)"/gi) || [];
      return matches
        .map((m) => {
          const name = m.match(/href="([^"]+)"/i)?.[1] || '';
          return name.startsWith('/') ? name : `${VIDEO_DIR}${name}`;
        })
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Initialize: discover videos and set the first one as source.
   */
  async function init(): Promise<void> {
    const videos = await discoverVideos();
    if (videos.length > 0) {
      videoSrc = videos[0];
    } else {
      // Fallback to a sensible default if discovery fails
      console.warn('No videos discovered, falling back to default.');
      videoSrc = `${VIDEO_DIR}sample.mp4`;
    }
  }

  init();

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

{#if videoSrc}
<video
  bind:this={videoEl}
  src={videoSrc}
  onloadedmetadata={onLoadedMetadata}
  autoplay
  loop
  muted
  playsinline
></video>
{/if}

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
