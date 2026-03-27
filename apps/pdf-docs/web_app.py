#!/usr/bin/env python3
from __future__ import annotations

import argparse
import email
import io
import logging
import os
import sys
import tempfile
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from pdf_doc_converter import docx_to_pdf, pdf_to_docx

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>INXS PDF and DOCX Converter</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #08090d;
      --bg-2: #0e0f17;
      --bg-3: #141625;
      --panel: rgba(14, 15, 23, 0.9);
      --panel-strong: rgba(20, 22, 37, 0.98);
      --border: #23263a;
      --text: #edf0f7;
      --muted: #9197b3;
      --faint: #606684;
      --accent: #7c3aed;
      --accent-2: #9d5cf6;
      --success: #10b981;
      --danger: #f87171;
      --shadow: 0 22px 60px rgba(0, 0, 0, 0.32);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Inter", sans-serif;
      min-height: 100vh;
      color: var(--text);
      background:
        radial-gradient(circle at 10% 10%, rgba(124, 58, 237, 0.22), transparent 30%),
        radial-gradient(circle at 90% 0%, rgba(44, 63, 173, 0.2), transparent 24%),
        linear-gradient(180deg, #07080c 0%, var(--bg) 100%);
    }
    .site-nav {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 24px;
      background: rgba(8, 9, 13, 0.84);
      backdrop-filter: blur(18px);
      border-bottom: 1px solid var(--border);
    }
    .nav-logo {
      color: var(--text);
      text-decoration: none;
      font-weight: 900;
      letter-spacing: -0.04em;
      font-size: 1.2rem;
    }
    .nav-links {
      display: flex;
      gap: 18px;
    }
    .nav-links a {
      color: var(--muted);
      text-decoration: none;
      font-size: 0.95rem;
    }
    .nav-links a:hover { color: var(--text); }
    .shell {
      width: min(1080px, calc(100% - 32px));
      margin: 0 auto;
      padding: 48px 0 72px;
    }
    .hero {
      margin-bottom: 28px;
    }
    .eyebrow, .chip {
      display: inline-flex;
      align-items: center;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .eyebrow { color: var(--accent-2); }
    .hero h1 {
      margin: 14px 0 0;
      max-width: 720px;
      font-size: clamp(2.3rem, 6vw, 4.6rem);
      line-height: 0.98;
      letter-spacing: -0.04em;
    }
    .subtitle {
      max-width: 720px;
      line-height: 1.7;
      margin-top: 16px;
      color: var(--muted);
      font-size: 1rem;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.85fr);
      gap: 20px;
    }
    .card {
      background: linear-gradient(180deg, var(--panel), var(--panel-strong));
      border-radius: 22px;
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      padding: 28px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 20px;
    }
    .card h2 {
      margin: 0;
      letter-spacing: -0.04em;
    }
    .card-kicker {
      color: var(--accent-2);
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .chip {
      color: #d8ccff;
      background: rgba(124, 58, 237, 0.14);
      border: 1px solid rgba(124, 58, 237, 0.35);
      border-radius: 999px;
      padding: 6px 10px;
    }
    .mode-row {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    .mode-btn {
      flex: 1;
      padding: 0.9rem 0.8rem;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--bg-3);
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--muted);
      transition: border-color .15s, background .15s, color .15s, transform .15s;
    }
    .mode-btn.active {
      border-color: rgba(124, 58, 237, 0.55);
      background: rgba(124, 58, 237, 0.14);
      color: var(--text);
    }
    .drop-zone {
      border: 1px dashed rgba(157, 92, 246, 0.45);
      border-radius: 18px;
      padding: 2.8rem 1rem;
      text-align: center;
      cursor: pointer;
      color: var(--muted);
      transition: border-color .15s, background .15s, transform .15s;
      position: relative;
      margin-bottom: 1rem;
      background: rgba(20, 22, 37, 0.76);
    }
    .drop-zone.drag-over {
      border-color: rgba(196, 181, 253, 0.7);
      background: rgba(124, 58, 237, 0.14);
      color: var(--text);
      transform: translateY(-1px);
    }
    .drop-zone input[type=file] {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
      width: 100%;
      height: 100%;
    }
    .drop-zone .icon { font-size: 2rem; margin-bottom: .5rem; }
    .drop-zone .hint { font-size: 0.85rem; margin-top: .25rem; color: var(--faint); }
    .file-name {
      font-size: 0.9rem;
      color: var(--muted);
      margin-bottom: 1rem;
      min-height: 1.2em;
      word-break: break-all;
    }
    .convert-btn {
      width: 100%;
      padding: 0.95rem;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: #fff;
      border: none;
      border-radius: 14px;
      font-size: 1rem;
      font-weight: 800;
      cursor: pointer;
      transition: transform .15s;
      box-shadow: 0 10px 28px rgba(124, 58, 237, 0.28);
    }
    .convert-btn:hover { transform: translateY(-1px); }
    .convert-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .status {
      margin-top: 1rem;
      font-size: 0.95rem;
      min-height: 1.4em;
      color: var(--muted);
      line-height: 1.6;
    }
    .status.error { color: var(--danger); }
    .status.success { color: var(--success); }
    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(196, 181, 253, 0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin .7s linear infinite;
      vertical-align: middle;
      margin-right: 6px;
    }
    .side-text, .feature-list { color: var(--muted); line-height: 1.7; }
    .feature-list {
      margin-top: 16px;
      padding-left: 18px;
      display: grid;
      gap: 10px;
    }
    .feature-list strong { color: var(--text); }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 860px) {
      .layout { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .site-nav, .shell { width: calc(100% - 24px); }
      .site-nav { padding: 16px 0; }
      .nav-links { display: none; }
      .mode-row { flex-direction: column; }
      .card { padding: 22px; }
    }
  </style>
</head>
<body>
  <nav class="site-nav">
    <a href="https://inxs.live" class="nav-logo">INXS</a>
    <div class="nav-links">
      <a href="https://inxs.live">Home</a>
      <a href="https://convert.inxs.live">Video Converter</a>
      <a href="https://download.inxs.live">Downloader</a>
    </div>
  </nav>

  <main class="shell">
    <section class="hero">
      <div class="eyebrow">Documents</div>
      <h1>Convert PDF and DOCX without extra steps.</h1>
      <p class="subtitle">Switch directions instantly, drag in a file, and download the converted output directly from the browser.</p>
    </section>

    <section class="layout">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-kicker">PDF and DOCX</div>
            <h2>Run a document conversion</h2>
          </div>
          <div class="chip">Live</div>
        </div>
        <div class="mode-row">
          <button type="button" class="mode-btn active" id="btn-pdf2docx" onclick="setMode('pdf2docx')">PDF → DOCX</button>
          <button type="button" class="mode-btn" id="btn-docx2pdf" onclick="setMode('docx2pdf')">DOCX → PDF</button>
        </div>
        <form id="form" method="post" action="/convert" enctype="multipart/form-data">
          <input type="hidden" name="mode" id="mode" value="pdf2docx" />
          <div class="drop-zone" id="drop-zone">
            <input type="file" name="file" id="file-input" accept=".pdf" required />
            <div class="icon">📄</div>
            <div>Drop a file here or click to browse</div>
            <div class="hint" id="accept-hint">Accepts .pdf files</div>
          </div>
          <div class="file-name" id="file-name"></div>
          <button type="submit" class="convert-btn" id="convert-btn">Convert File</button>
        </form>
        <div class="status" id="status"></div>
      </div>

      <aside class="card">
        <div class="card-kicker">Modes</div>
        <h2>Two-way document flow</h2>
        <p class="side-text">This service uses `pdf2docx` for PDF to DOCX and LibreOffice headless conversion for DOCX back to PDF.</p>
        <ul class="feature-list">
          <li><strong>PDF → DOCX:</strong> turns a PDF into an editable Word document.</li>
          <li><strong>DOCX → PDF:</strong> generates a portable PDF from Word input.</li>
          <li><strong>Browser flow:</strong> upload, convert, and download in one pass.</li>
        </ul>
      </aside>
    </section>
  </main>
  <script>
    const modeInput   = document.getElementById('mode');
    const fileInput   = document.getElementById('file-input');
    const fileNameEl  = document.getElementById('file-name');
    const statusEl    = document.getElementById('status');
    const convertBtn  = document.getElementById('convert-btn');
    const acceptHint  = document.getElementById('accept-hint');
    const dropZone    = document.getElementById('drop-zone');

    function setMode(m) {
      modeInput.value = m;
      document.getElementById('btn-pdf2docx').classList.toggle('active', m === 'pdf2docx');
      document.getElementById('btn-docx2pdf').classList.toggle('active', m === 'docx2pdf');
      const ext = m === 'pdf2docx' ? '.pdf' : '.docx';
      fileInput.accept = ext;
      acceptHint.textContent = 'Accepts ' + ext + ' files';
      fileInput.value = '';
      fileNameEl.textContent = '';
      statusEl.textContent = '';
      statusEl.className = 'status';
    }

    fileInput.addEventListener('change', () => {
      fileNameEl.textContent = fileInput.files[0] ? '📎 ' + fileInput.files[0].name : '';
    });

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) {
        const dt = new DataTransfer();
        dt.items.add(e.dataTransfer.files[0]);
        fileInput.files = dt.files;
        fileNameEl.textContent = '📎 ' + fileInput.files[0].name;
      }
    });

    document.getElementById('form').addEventListener('submit', async function(e) {
      e.preventDefault();
      if (!fileInput.files.length) return;
      statusEl.className = 'status';
      statusEl.innerHTML = '<span class="spinner"></span> Converting…';
      convertBtn.disabled = true;

      try {
        const fd = new FormData(this);
        const resp = await fetch('/convert', { method: 'POST', body: fd });
        if (resp.ok) {
          const blob = await resp.blob();
          const cd = resp.headers.get('Content-Disposition') || '';
          const match = cd.match(/filename="([^"]+)"/);
          const name = match ? match[1] : 'converted_file';
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = name;
          a.click();
          URL.revokeObjectURL(a.href);
          statusEl.className = 'status success';
          statusEl.textContent = '✓ Converted: ' + name;
        } else {
          const txt = await resp.text();
          statusEl.className = 'status error';
          statusEl.textContent = '✗ Error: ' + txt;
        }
      } catch (err) {
        statusEl.className = 'status error';
        statusEl.textContent = '✗ Request failed: ' + err.message;
      } finally {
        convertBtn.disabled = false;
      }
    });
  </script>
</body>
</html>
"""


def _parse_multipart(headers: dict, rfile: io.RawIOBase) -> dict[str, dict]:
    """Parse multipart/form-data without the deprecated cgi module."""
    content_length = int(headers.get("Content-Length") or 0)
    body = rfile.read(content_length)
    content_type = headers.get("Content-Type", "")

    # Build a minimal email message so Python's email parser handles the boundary
    raw = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + body
    msg = email.message_from_bytes(raw)

    fields: dict[str, dict] = {}
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        cd = part.get("Content-Disposition", "")
        if not cd:
            continue
        params: dict[str, str] = {}
        for segment in cd.split(";"):
            segment = segment.strip()
            if "=" in segment:
                k, v = segment.split("=", 1)
                params[k.strip()] = v.strip().strip('"')
        name = params.get("name", "")
        if name:
            fields[name] = {
                "data": part.get_payload(decode=True) or b"",
                "filename": params.get("filename", ""),
            }
    return fields


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/healthz":
            body = b'{"status":"ok"}'
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path != "/":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        body = HTML.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/convert":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        try:
            form = _parse_multipart(self.headers, self.rfile)
        except Exception as exc:
            log.warning("Failed to parse form data: %s", exc)
            self.send_error(HTTPStatus.BAD_REQUEST, "Could not parse form data")
            return

        mode = (form.get("mode") or {}).get("data", b"").decode()
        upload = form.get("file")
        if not upload or not upload.get("filename"):
            self.send_error(HTTPStatus.BAD_REQUEST, "Missing file")
            return

        input_name = Path(upload["filename"]).name
        input_suffix = Path(input_name).suffix.lower()
        if mode == "pdf2docx" and input_suffix != ".pdf":
            self.send_error(HTTPStatus.BAD_REQUEST, "Expected a .pdf file for PDF → DOCX mode")
            return
        if mode == "docx2pdf" and input_suffix != ".docx":
            self.send_error(HTTPStatus.BAD_REQUEST, "Expected a .docx file for DOCX → PDF mode")
            return
        if mode not in ("pdf2docx", "docx2pdf"):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid mode")
            return

        with tempfile.TemporaryDirectory(prefix="pdfdocx_web_") as temp_dir:
            temp = Path(temp_dir)
            src = temp / input_name
            src.write_bytes(upload["data"])

            try:
                if mode == "pdf2docx":
                    dst = src.with_suffix(".docx")
                    pdf_to_docx(src, dst)
                    out_name = f"{src.stem}.docx"
                    content_type = (
                        "application/vnd.openxmlformats-officedocument"
                        ".wordprocessingml.document"
                    )
                else:
                    dst = src.with_suffix(".pdf")
                    docx_to_pdf(src, dst)
                    out_name = f"{src.stem}.pdf"
                    content_type = "application/pdf"
            except Exception as exc:
                log.error("Conversion failed for %s (%s): %s", input_name, mode, exc)
                self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))
                return

            log.info("Converted %s -> %s", input_name, out_name)
            out_bytes = dst.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header(
                "Content-Disposition", f'attachment; filename="{out_name}"'
            )
            self.send_header("Content-Length", str(len(out_bytes)))
            self.end_headers()
            self.wfile.write(out_bytes)

    def log_message(self, fmt: str, *args: object) -> None:
        log.debug(fmt, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Local web app for PDF/DOCX conversion")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    log.info("Server running at http://%s:%s", args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down.")


if __name__ == "__main__":
    main()
