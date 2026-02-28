/**
 * Discover video files served from a given directory path.
 *
 * Supports two server formats:
 *   1. nginx autoindex (JSON) — `application/json` response
 *   2. HTML directory listing  — falls back to parsing `<a href>` tags
 *
 * Uses the Cache API to avoid redundant network requests,
 * reducing server load on the distribution server.
 */

const CACHE_NAME = "video-discovery-v1";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch with client-side Cache API caching.
 *
 * If a cached response exists and is younger than `CACHE_MAX_AGE_MS`,
 * it is returned without hitting the network. Otherwise a fresh
 * response is fetched, timestamped, and stored in the cache.
 */
async function cachedFetch(url: string): Promise<Response> {
  if (!("caches" in globalThis)) {
    // Cache API unavailable — fall back to plain fetch.
    return fetch(url);
  }

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);

  if (cached) {
    const cachedAt = Number(cached.headers.get("x-cached-at") || "0");
    if (Date.now() - cachedAt < CACHE_MAX_AGE_MS) {
      console.debug("[discoverVideos] cache hit for", url);
      return cached;
    }
  }

  // Cache miss or expired — fetch from network.
  console.debug("[discoverVideos] cache miss, fetching", url);
  const res = await fetch(url);

  // Clone the response so we can read it *and* store it.
  const resForCache = res.clone();

  // Rebuild the response with an extra timestamp header.
  const headers = new Headers(resForCache.headers);
  headers.set("x-cached-at", String(Date.now()));

  const body = await resForCache.blob();
  const stamped = new Response(body, {
    status: resForCache.status,
    statusText: resForCache.statusText,
    headers,
  });

  // Store in cache (fire-and-forget).
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

    // Fallback: parse HTML directory listing
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
