import { useState, useEffect, useRef } from "react";

const fmtSize = (bytes) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

export default function FileUpload({ ownerType, ownerId, accept, label }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!ownerType || !ownerId) return;
    fetchFiles();
  }, [ownerType, ownerId]);

  async function fetchFiles() {
    try {
      const res = await fetch(`/api/attachments?owner_type=${encodeURIComponent(ownerType)}&owner_id=${encodeURIComponent(ownerId)}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch { /* ignore */ }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("owner_type", ownerType);
      formData.append("owner_id", ownerId);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/attachments");
      xhr.withCredentials = true;

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
      };

      await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            try {
              const d = JSON.parse(xhr.responseText);
              reject(new Error(d.error || `Upload failed (${xhr.status})`));
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      await fetchFiles();
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div style={{ marginTop: 8 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>}

      {/* Upload button */}
      <label style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 14px",
        background: "var(--bg)", color: "var(--charcoal)",
        border: "1px dashed var(--line)", borderRadius: "var(--r-card)",
        fontSize: 12, fontWeight: 600, cursor: uploading ? "wait" : "pointer",
        opacity: uploading ? 0.6 : 1,
        transition: "border-color .2s",
      }}>
        <span style={{ fontSize: 14 }}>+</span>
        {uploading ? `Uploading ${progress}%` : "Upload file"}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleUpload}
          disabled={uploading}
          style={{ display: "none" }}
        />
      </label>

      {/* Progress bar */}
      {uploading && (
        <div style={{ marginTop: 6, height: 3, background: "var(--line)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: "var(--lime)", transition: "width .2s" }} />
        </div>
      )}

      {error && <div style={{ marginTop: 6, fontSize: 12, color: "var(--danger)" }}>{error}</div>}

      {/* File list */}
      {files.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {files.map(f => (
            <div key={f.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 10px",
              background: "var(--bg)", borderRadius: "var(--r-card)",
              fontSize: 12,
            }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                {f.filename}
              </span>
              <span style={{ color: "var(--text-faint)", flexShrink: 0 }}>{fmtSize(f.size)}</span>
              <a
                href={`/api/attachments/${f.id}/download`}
                style={{ color: "var(--lime)", textDecoration: "none", fontWeight: 600, flexShrink: 0 }}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
