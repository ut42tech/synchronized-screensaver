# 🖥️ Synchronized Screensaver

> Time-synced full-screen video playback across multiple devices — no server communication required.

Multiple Macs (or any device with a web browser) play the **same video at exactly the same position** by calculating the playback offset from the current UTC time. Designed to run as a macOS screensaver via [WebViewScreenSaver](https://github.com/nickthedude/WebViewScreenSaver).

## ✨ How It Works

```
currentTime = (Date.now() / 1000) % video.duration
```

Every device independently computes where in the video loop it should be, based on the wall clock. No WebSocket, no signaling server — just synchronized clocks.

A **drift correction** runs every 10 minutes to compensate for browser timing inaccuracies during long sessions.

## 🚀 Quick Start

```bash
# Clone & install
git clone https://github.com/ut42tech/synchronized-screensaver.git
cd synchronized-screensaver
pnpm install

# Start dev server
pnpm run dev
```

Open `http://localhost:5173` in multiple tabs — playback is already synchronized.

## ☁️ Deploy to Cloud

Deploy your own instance with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fut42tech%2Fsynchronized-screensaver)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/ut42tech/synchronized-screensaver)

## 🏠 LAN Deployment (Docker)

For lab/office environments where all devices are on the same network:

```bash
# Build the app
pnpm run build

# Start Nginx container
docker compose up -d
```

All clients on the LAN can access `http://<server-ip>/` and will play in perfect sync.

### Updating the Video

Simply replace the file in `public/videos/` and restart:

```bash
cp /path/to/new-promo.mp4 public/videos/sample.mp4
docker compose restart
```

## 🍎 macOS Screensaver Setup

1. Install [WebViewScreenSaver](https://github.com/nickthedude/WebViewScreenSaver)
2. Open **System Settings → Screen Saver**
3. Select **WebViewScreenSaver**
4. Set the URL to your deployment (e.g. `http://192.168.1.100/`)
5. Adjust idle timeout and display sleep settings as needed

## 🎬 Using Your Own Video

1. Place your MP4 file in `public/videos/`
2. Update `VIDEO_SRC` in `src/App.svelte`:
   ```ts
   const VIDEO_SRC = "/videos/your-video.mp4";
   ```
3. Rebuild if using Docker: `pnpm run build && docker compose up -d --build`

> [!TIP]
> Large production videos are excluded from Git by default (`.gitignore`).
> The included `sample.mp4` (31 KB) is a lightweight placeholder for development.

## 🛠️ Tech Stack

| Layer         | Technology                          |
| ------------- | ----------------------------------- |
| Frontend      | Vite + Svelte 5 (TypeScript)        |
| LAN Hosting   | Docker Compose + Nginx              |
| Cloud Hosting | Vercel / Netlify / Cloudflare Pages |
| Client        | macOS + WebViewScreenSaver          |

## 📄 License

[MIT](LICENSE)
