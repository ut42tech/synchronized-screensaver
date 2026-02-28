/**
 * Discover and cache video files served from a given directory path.
 *
 * Discovery supports two server formats:
 *   1. nginx autoindex (JSON) — `application/json` response
 *   2. HTML directory listing  — falls back to parsing `<a href>` tags
 *
 * Uses the Cache API to:
 *   - Cache the directory listing (avoid repeated listing requests)
 *   - Cache the video file itself (fully offline playback via Blob URL)
 */

// ── Cache configuration ─────────────────────────────────────────

const LISTING_CACHE = "video-discovery-v1";
const VIDEO_CACHE = "video-files-v1";
const LISTING_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Directory listing (with cache) ──────────────────────────────

async function cachedFetch(url: string): Promise<Response> {
  if (!("caches" in globalThis)) return fetch(url);

  const cache = await caches.open(LISTING_CACHE);
  const cached = await cache.match(url);

  if (cached) {
    const cachedAt = Number(cached.headers.get("x-cached-at") || "0");
    if (Date.now() - cachedAt < LISTING_MAX_AGE_MS) {
      return cached;
    }
  }

  const res = await fetch(url);
  const clone = res.clone();

  const headers = new Headers(clone.headers);
  headers.set("x-cached-at", String(Date.now()));

  const body = await clone.blob();
  const stamped = new Response(body, {
    status: clone.status,
    statusText: clone.statusText,
    headers,
  });

  cache.put(url, stamped).catch(() => {});
  return res;
}

export async function discoverVideos(dir: string): Promise<string[]> {
  try {
    const res = await cachedFetch(dir);
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const entries: { name: string; type: string }[] = await res.json();
      return entries
        .filter((e) => e.type === "file" && /\.mp4$/i.test(e.name))
        .map((e) => `${dir}${e.name}`)
        .sort();
    }

    const html = await res.text();
    const matches = html.match(/href="([^"]+\.mp4)"/gi) || [];
    return matches
      .map((m) => {
        const name = m.match(/href="([^"]+)"/i)?.[1] || "";
        return name.startsWith("/") ? name : `${dir}${name}`;
      })
      .sort();
  } catch {
    return [];
  }
}

// ── Video file caching ──────────────────────────────────────────

/**
 * Download a video file and store it in the Cache API.
 * Returns a Blob URL for fully offline playback — the browser
 * reads directly from memory, with zero server communication.
 *
 * On subsequent visits, the cached version is used immediately.
 */
export async function cacheVideo(url: string): Promise<string> {
  if (!("caches" in globalThis)) return url;

  const cache = await caches.open(VIDEO_CACHE);
  const cached = await cache.match(url);

  if (cached) {
    console.debug("[cache] video cache hit:", url);
    const blob = await cached.blob();
    return URL.createObjectURL(blob);
  }

  console.debug("[cache] downloading video:", url);
  const res = await fetch(url);

  // Store in cache for future visits (fire-and-forget).
  cache.put(url, res.clone()).catch(() => {});

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
