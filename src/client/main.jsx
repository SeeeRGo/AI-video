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
  Sparkles,
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

function statusLabel(status) {
  if (!status) return "Waiting";
  return status.charAt(0).toUpperCase() + status.slice(1);
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
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [prompts, setPrompts] = useState(null);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
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
    setPhoto(file);
    setJob(null);
    setError("");
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

            <button type="button" className="generate-button" onClick={createJob} disabled={busy}>
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
