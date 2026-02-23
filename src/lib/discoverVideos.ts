/**
 * Discover video files served from a given directory path.
 *
 * Supports two server formats:
 *   1. nginx autoindex (JSON) — `application/json` response
 *   2. HTML directory listing  — falls back to parsing `<a href>` tags
 */
export async function discoverVideos(dir: string): Promise<string[]> {
  try {
    const res = await fetch(dir);
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
