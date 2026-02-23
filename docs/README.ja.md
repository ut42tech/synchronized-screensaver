# 🖥️ Synchronized Screensaver

> 複数デバイスでフルスクリーン動画をぴったり同期再生 — サーバー不要。

複数の Mac（ブラウザが動く端末なら何でも OK）で、**同じ動画を同じ位置から同時に再生**できます。再生位置は UTC 時刻から算出するだけなので、サーバー間の通信は一切ありません。[WebViewScreenSaver](https://github.com/nickthedude/WebViewScreenSaver) と組み合わせれば、macOS のスクリーンセーバーとしても使えます。

## ✨ しくみ

```
currentTime = (Date.now() / 1000) % video.duration
```

各デバイスが「今、動画のどこを再生すべきか」をシステム時計から独立して計算します。WebSocket もシグナリングサーバーもなし — 時計さえ合っていれば同期します。

長時間つけっぱなしのときにブラウザのタイマーがズレてくるのを防ぐため、**10 分おきにドリフト補正**を行います。

## 🚀 クイックスタート

```bash
# クローン & インストール
git clone https://github.com/ut42tech/synchronized-screensaver.git
cd synchronized-screensaver
pnpm install

# 開発サーバーを起動
pnpm run dev
```

`http://localhost:5173` を複数タブで開いてみてください。すでに同期再生されているはずです。

## ☁️ クラウドにデプロイ

ボタン一つで自分用のインスタンスをデプロイできます：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ut42tech/synchronized-screensaver)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/ut42tech/synchronized-screensaver)

## 🏠 LAN デプロイ（Docker）

研究室やオフィスなど、同一ネットワーク内で使う場合：

```bash
# アプリをビルド
pnpm run build

# Nginx コンテナを起動
docker compose up -d
```

LAN 内のどの端末からでも `http://<server-ip>/` にアクセスすれば、全画面が同期して再生されます。

### 動画の差し替え

`public/videos/` に `.mp4` ファイルを入れ替えて再起動するだけです：

```bash
cp /path/to/new-promo.mp4 public/videos/
docker compose restart
```

videos ディレクトリ内の `.mp4` は自動検出されるので、コードを変更する必要はありません。

## 🍎 macOS スクリーンセーバーとして使う

1. [WebViewScreenSaver](https://github.com/nickthedude/WebViewScreenSaver) をインストール
2. **システム設定 → スクリーンセーバー** を開く
3. **WebViewScreenSaver** を選択
4. URL にデプロイ先を入力（例：`http://192.168.1.100/`）
5. アイドル時間やディスプレイのスリープ設定をお好みで調整

## 🎬 好きな動画を使う

1. `.mp4` ファイルを `public/videos/` に置く
2. Docker 利用時は再ビルド：`pnpm run build && docker compose up -d --build`

ディレクトリ内の `.mp4` をアルファベット順に自動で検出し、最初のファイルを再生します。

> [!TIP]
> サイズの大きい本番用動画は `.gitignore` で Git 管理から除外されています。

## 🛠️ 技術スタック

| レイヤー             | 技術                                |
| -------------------- | ----------------------------------- |
| フロントエンド       | Vite + Svelte 5（TypeScript）       |
| LAN ホスティング     | Docker Compose + Nginx              |
| クラウドホスティング | Vercel / Netlify / Cloudflare Pages |
| クライアント         | macOS + WebViewScreenSaver          |

## 📄 ライセンス

[MIT](../LICENSE)
