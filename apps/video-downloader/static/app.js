const urlInput = document.getElementById("urlInput");
const formatSelect = document.getElementById("formatSelect");
const downloadBtn = document.getElementById("downloadBtn");
const openFolderBtn = document.getElementById("openFolderBtn");
const progressBar = document.getElementById("progressBar");
const statusText = document.getElementById("statusText");
const metaText = document.getElementById("metaText");
const pathText = document.getElementById("pathText");
const fileLinkWrap = document.getElementById("fileLinkWrap");
const downloadsUri = document.body.dataset.downloadsUri || "";
const downloadsPath = document.body.dataset.downloadsPath || "~/Downloads";

let pollTimer = null;

function setProgress(percent) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  progressBar.style.width = `${safe}%`;
}

function setStatus(text) {
  statusText.textContent = text;
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollStatus(jobId) {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/status/${jobId}`);
      const data = await res.json();

      if (!res.ok) {
        stopPolling();
        setStatus(data.error || "Status failed");
        downloadBtn.disabled = false;
        return;
      }

      setProgress(data.progress);
      const speed = data.speed ? ` | Speed: ${data.speed}` : "";
      const eta = data.eta ? ` | ETA: ${data.eta}s` : "";
      setStatus(`${data.message || data.status}${speed}${eta}`);

      if (data.status === "completed") {
        stopPolling();
        downloadBtn.disabled = false;
        setProgress(100);
        const label = (data.selected_format || "best_quality").replace("_", " ").toUpperCase();
        metaText.textContent = `Done: ${data.title || "Video"} (${data.extractor || "Unknown site"}) | Format: ${label}`;
        pathText.textContent = `Saved to: ${data.file_path || downloadsPath}`;
        fileLinkWrap.innerHTML = `<a class="download-link" href="/api/file/${jobId}">Download file</a>`;
      } else if (data.status === "error") {
        stopPolling();
        downloadBtn.disabled = false;
        metaText.textContent = data.error || "Unknown error";
        pathText.textContent = "";
        fileLinkWrap.textContent = "";
      }
    } catch (err) {
      stopPolling();
      downloadBtn.disabled = false;
      setStatus("Connection lost while polling status");
      metaText.textContent = err.message;
    }
  }, 900);
}

async function startDownload() {
  const url = urlInput.value.trim();
  const format = formatSelect.value;

  if (!url) {
    setStatus("Please enter a URL");
    return;
  }

  downloadBtn.disabled = true;
  setProgress(0);
  setStatus("Submitting download...");
  metaText.textContent = "";
  pathText.textContent = "";
  fileLinkWrap.textContent = "";

  try {
    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, format }),
    });

    const data = await res.json();

    if (!res.ok) {
      downloadBtn.disabled = false;
      setStatus(data.error || "Failed to start");
      return;
    }

    setStatus("Queued...");
    pollStatus(data.job_id);
  } catch (err) {
    downloadBtn.disabled = false;
    setStatus("Failed to start download");
    metaText.textContent = err.message;
  }
}

function openDownloadsFolder() {
  fetch("/api/open-downloads", { method: "POST" })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || `Open this folder manually: ${downloadsPath}`);
        return;
      }
      setStatus(`Opened folder: ${data.path}`);
    })
    .catch(() => {
      if (!downloadsUri) {
        setStatus(`Open this folder manually: ${downloadsPath}`);
        return;
      }
      window.open(downloadsUri, "_blank");
    });
}

downloadBtn.addEventListener("click", startDownload);
if (openFolderBtn) {
  openFolderBtn.addEventListener("click", openDownloadsFolder);
}
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    startDownload();
  }
});
