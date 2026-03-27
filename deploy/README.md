# INXS Umbrel Stack

This stack keeps the `INXS-Live` site and the three tool backends running 24/7 behind Caddy.

## What it serves

- `https://inxs.live` -> static landing page from the repo root
- `https://pdf.inxs.live` -> PDF/DOCX converter
- `https://convert.inxs.live` -> video converter
- `https://download.inxs.live` -> video downloader

## Repo layout

- `index.html` -> public landing page
- `apps/pdf-docs` -> PDF/DOCX service
- `apps/video-converter` -> FFmpeg conversion service
- `apps/video-downloader` -> yt-dlp download service
- `deploy` -> Caddy and Docker Compose stack

## DNS

Point these records at your Umbrel Pi public IP:

- `inxs.live`
- `www.inxs.live`
- `pdf.inxs.live`
- `convert.inxs.live`
- `download.inxs.live`

If your IP changes, put Cloudflare in front and update the origin there instead of changing DNS at the registrar every time.

## Portainer deployment

1. Push this `INXS-Live` repo to GitHub.
2. In Portainer, create a new stack.
3. Use the repository's `deploy/docker-compose.yml`.
4. Deploy the stack.
5. Caddy will request TLS certificates automatically once DNS is pointed correctly and ports `80` and `443` reach the Pi.

## Updates

When you change the site or apps, push to GitHub and redeploy or pull/recreate the stack in Portainer.

## Persistence

Docker named volumes keep output files and Caddy certificates across restarts:

- `video_converter_downloads`
- `video_converter_uploads`
- `video_downloader_downloads`
- `caddy_data`
- `caddy_config`

## Notes

- The video tools depend on `ffmpeg`.
- The PDF tool depends on LibreOffice for DOCX -> PDF.
- The downloader's desktop-only "Open Downloads Folder" button is disabled in the server deployment.
