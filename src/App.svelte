<script lang="ts">
  import { discoverVideos } from './lib/discoverVideos';
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
    if (videos.length > 0) {
      videoSrc = videos[0];
    } else {
      console.warn('No videos discovered, falling back to default.');
      videoSrc = `${VIDEO_DIR}sample.mp4`;
    }
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
  autoplay
  loop
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
    will-change: transform;
  }

  video.synced {
    opacity: 1;
  }
</style>
