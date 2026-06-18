import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BadgeCheck,
  Camera,
  Clapperboard,
  Clock3,
  Film,
  ImagePlus,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ScanLine,
  Sparkles,
  Undo2,
  Wand2
} from "lucide-react";

import "./styles.css";

const DEFAULT_FORM = {
  variant: "serious",
  duration: 5,
  subject: "",
  motion: "",
  style: ""
};

const MAX_PREPARED_EDGE = 1536;

function statusLabel(status) {
  if (!status) return "Waiting";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function preparedFileName(file, suffix = "prepared") {
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return `${baseName}.${suffix}.jpg`;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the selected image."));
    };
    image.src = url;
  });
}

function canvasToFile(canvas, sourceFile, suffix) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not prepare the image."));
          return;
        }
        resolve(new File([blob], preparedFileName(sourceFile, suffix), { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  });
}

function drawImageToCanvas(image, maxEdge = MAX_PREPARED_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function findTrimBounds(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);
  const rowThreshold = Math.max(4, Math.floor(width * 0.005));
  const columnThreshold = Math.max(4, Math.floor(height * 0.005));

  function isContentAt(x, y) {
    const index = (y * width + x) * 4;
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3];
    return alpha > 16 && (red < 242 || green < 242 || blue < 242) && red + green + blue < 720;
  }

  function rowHasContent(y) {
    let count = 0;
    for (let x = 0; x < width; x += 1) {
      if (isContentAt(x, y)) count += 1;
      if (count >= rowThreshold) return true;
    }
    return false;
  }

  function columnHasContent(x) {
    let count = 0;
    for (let y = 0; y < height; y += 1) {
      if (isContentAt(x, y)) count += 1;
      if (count >= columnThreshold) return true;
    }
    return false;
  }

  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;

  while (top < bottom && !rowHasContent(top)) top += 1;
  while (bottom > top && !rowHasContent(bottom)) bottom -= 1;
  while (left < right && !columnHasContent(left)) left += 1;
  while (right > left && !columnHasContent(right)) right -= 1;

  const padding = Math.max(8, Math.round(Math.min(width, height) * 0.015));
  return {
    x: Math.max(0, left - padding),
    y: Math.max(0, top - padding),
    width: Math.min(width, right - left + 1 + padding * 2),
    height: Math.min(height, bottom - top + 1 + padding * 2)
  };
}

async function autoTrimFile(file) {
  const image = await loadImage(file);
  const sourceCanvas = drawImageToCanvas(image);
  const bounds = findTrimBounds(sourceCanvas);
  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = bounds.width;
  trimmedCanvas.height = bounds.height;
  const context = trimmedCanvas.getContext("2d");
  context.drawImage(
    sourceCanvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height
  );
  return canvasToFile(trimmedCanvas, file, "trimmed");
}

async function rotateFile(file, degrees) {
  const image = await loadImage(file);
  const sourceCanvas = drawImageToCanvas(image);
  const rotatedCanvas = document.createElement("canvas");
  const quarterTurn = Math.abs(degrees) % 180 === 90;
  rotatedCanvas.width = quarterTurn ? sourceCanvas.height : sourceCanvas.width;
  rotatedCanvas.height = quarterTurn ? sourceCanvas.width : sourceCanvas.height;

  const context = rotatedCanvas.getContext("2d");
  context.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
  return canvasToFile(rotatedCanvas, file, degrees > 0 ? "rotated-right" : "rotated-left");
}

function useObjectUrl(file) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setUrl("");
      return undefined;
    }

    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url;
}

function App() {
  const [photo, setPhoto] = useState(null);
  const [originalPhoto, setOriginalPhoto] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [prompts, setPrompts] = useState(null);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [prepBusy, setPrepBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const previewUrl = useObjectUrl(photo);

  const activePrompt = useMemo(() => {
    if (!prompts) return "";
    return form.variant === "funny" ? prompts.funny : prompts.serious;
  }, [form.variant, prompts]);

  async function refreshPrompts(nextForm = form) {
    const response = await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextForm)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not generate prompts.");
    setPrompts(payload.prompts);
  }

  useEffect(() => {
    refreshPrompts().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!job?.id || ["succeeded", "failed", "canceled"].includes(job.status)) return undefined;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/videos/${job.id}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not refresh video status.");
        setJob(payload.job);
      } catch (err) {
        setError(err.message);
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  function updateForm(name, value) {
    const nextForm = { ...form, [name]: value };
    setForm(nextForm);
    refreshPrompts(nextForm).catch((err) => setError(err.message));
  }

  function acceptFiles(files) {
    const file = Array.from(files || []).find((item) => item.type.startsWith("image/"));
    if (!file) return;
    setOriginalPhoto(file);
    setPhoto(file);
    setJob(null);
    setError("");
  }

  async function preparePhoto(action) {
    if (!photo) return;
    setPrepBusy(true);
    setError("");

    try {
      if (action === "reset") {
        setPhoto(originalPhoto);
        setJob(null);
        return;
      }

      const nextPhoto = action === "trim" ? await autoTrimFile(photo) : await rotateFile(photo, action);
      setPhoto(nextPhoto);
      setJob(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setPrepBusy(false);
    }
  }

  async function createJob() {
    if (!photo) {
      setError("Add a photo first.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const body = new FormData();
      body.append("photo", photo);
      body.append("variant", form.variant);
      body.append("duration", String(form.duration));
      body.append("subject", form.subject);
      body.append("motion", form.motion);
      body.append("style", form.style);

      const response = await fetch("/api/videos", {
        method: "POST",
        body
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create video job.");
      setJob(payload.job);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="title-row">
          <div>
            <p className="eyebrow">Photo Liftoff</p>
            <h1>Bring one photo to life</h1>
          </div>
          <button className="icon-button" type="button" title="Regenerate prompts" onClick={() => refreshPrompts()}>
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="primary-grid">
          <section className="panel media-panel">
            <div
              className={`drop-zone ${dragging ? "dragging" : ""} ${previewUrl ? "has-photo" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                acceptFiles(event.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex="0"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
              }}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="Uploaded preview" />
              ) : (
                <div className="empty-upload">
                  <ImagePlus size={42} />
                  <span>Drop a photo</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(event) => acceptFiles(event.target.files)}
              />
            </div>

            <div className="media-footer">
              <div>
                <Camera size={18} />
                <span>{photo ? photo.name : "No photo selected"}</span>
              </div>
              <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
                Replace
              </button>
            </div>

            <div className="prep-toolbar" aria-label="Photo preparation tools">
              <button type="button" onClick={() => preparePhoto("trim")} disabled={!photo || prepBusy}>
                {prepBusy ? <Loader2 size={16} className="spin" /> : <ScanLine size={16} />}
                Auto trim
              </button>
              <button type="button" onClick={() => preparePhoto(-90)} disabled={!photo || prepBusy}>
                <RotateCcw size={16} />
                Left
              </button>
              <button type="button" onClick={() => preparePhoto(90)} disabled={!photo || prepBusy}>
                <RotateCw size={16} />
                Right
              </button>
              <button type="button" onClick={() => preparePhoto("reset")} disabled={!originalPhoto || prepBusy}>
                <Undo2 size={16} />
                Reset
              </button>
            </div>
          </section>

          <section className="panel controls-panel">
            <div className="control-block">
              <label>Variant</label>
              <div className="segmented" role="group" aria-label="Prompt variant">
                <button
                  type="button"
                  className={form.variant === "serious" ? "active" : ""}
                  onClick={() => updateForm("variant", "serious")}
                >
                  <Film size={16} />
                  Serious
                </button>
                <button
                  type="button"
                  className={form.variant === "funny" ? "active" : ""}
                  onClick={() => updateForm("variant", "funny")}
                >
                  <Sparkles size={16} />
                  Ridiculous
                </button>
              </div>
            </div>

            <div className="control-block duration-row">
              <label>Duration</label>
              <div className="duration-value">
                <Clock3 size={16} />
                <span>{form.duration}s</span>
              </div>
              <div className="duration-options" role="group" aria-label="Video duration">
                {[5, 10].map((duration) => (
                  <button
                    key={duration}
                    type="button"
                    className={form.duration === duration ? "active" : ""}
                    onClick={() => updateForm("duration", duration)}
                  >
                    {duration}s
                  </button>
                ))}
              </div>
            </div>

            <div className="field-grid">
              <label>
                Subject hint
                <input
                  value={form.subject}
                  placeholder="person in a studio portrait"
                  onChange={(event) => updateForm("subject", event.target.value)}
                />
              </label>
              <label>
                Motion hint
                <input
                  value={form.motion}
                  placeholder="hair movement and slow camera push"
                  onChange={(event) => updateForm("motion", event.target.value)}
                />
              </label>
              <label>
                Visual style
                <input
                  value={form.style}
                  placeholder="photoreal cinematic video"
                  onChange={(event) => updateForm("style", event.target.value)}
                />
              </label>
            </div>

            <button type="button" className="generate-button" onClick={createJob} disabled={busy || prepBusy}>
              {busy ? <Loader2 size={18} className="spin" /> : <Play size={18} />}
              Generate clip
            </button>
          </section>
        </div>

        {error ? <div className="error-strip">{error}</div> : null}

        <section className="lower-grid">
          <div className="panel prompt-panel">
            <div className="panel-heading">
              <Wand2 size={18} />
              <h2>Prompt</h2>
            </div>
            <textarea value={activePrompt} readOnly rows="9" />
          </div>

          <div className="panel result-panel">
            <div className="panel-heading">
              <Clapperboard size={18} />
              <h2>Video job</h2>
            </div>

            {job ? (
              <div className="job-stack">
                <div className="job-status">
                  <BadgeCheck size={18} />
                  <span>{statusLabel(job.status)}</span>
                </div>
                <code>{job.id}</code>
                {job.output ? (
                  <video controls src={job.output} />
                ) : (
                  <div className="pending-output">
                    {["starting", "processing"].includes(job.status) ? <Loader2 className="spin" size={26} /> : null}
                    <span>{job.message || "Waiting for provider output."}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="pending-output idle">
                <Clapperboard size={30} />
                <span>No job started</span>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
