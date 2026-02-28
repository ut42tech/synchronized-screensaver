<script lang="ts">
  import { discoverVideos, cacheVideo } from './lib/discoverVideos';
  import { startSync } from './lib/sync';

  const VIDEO_DIR = '/videos/';

  // svelte-ignore non_reactive_update
  let videoEl: HTMLVideoElement;
  let videoSrc = $state('');
  let synced = $state(false);
  let syncCleanup: (() => void) | null = null;

  async function onLoadedMetadata(): Promise<void> {
    const { cleanup } = await startSync(videoEl);
    syncCleanup = cleanup;
    synced = true;
  }

  async function init(): Promise<void> {
    const videos = await discoverVideos(VIDEO_DIR);
    const url = videos.length > 0 ? videos[0] : `${VIDEO_DIR}sample.mp4`;

    // Cache the full video file → Blob URL for offline playback.
    videoSrc = await cacheVideo(url);
  }

  init();

  $effect(() => {
    return () => syncCleanup?.();
  });
</script>

{#if videoSrc}
<video
  bind:this={videoEl}
  src={videoSrc}
  onloadedmetadata={onLoadedMetadata}
  class:synced
  muted
  playsinline
  preload="auto"
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
    opacity: 0;
    transition: opacity 0.3s ease;

    /* Safari/WebKit GPU compositing — translateZ(0) is more
       reliable than will-change for promoting to a GPU layer. */
    transform: translateZ(0);
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
  }

  video.synced {
    opacity: 1;
  }
</style>
