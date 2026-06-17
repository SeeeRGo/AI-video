import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { z } from "zod";

import { createVideoPrompts, normalizePromptInput } from "./promptHelpers.js";
import { createVideoJob, getVideoJob } from "./videoProvider.js";

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024
  },
  fileFilter(_req, file, cb) {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image uploads are supported."));
  }
});

const videoInputSchema = z.object({
  variant: z.enum(["serious", "funny"]).default("serious"),
  duration: z.coerce.number().min(5).max(10).default(7),
  subject: z.string().optional(),
  motion: z.string().optional(),
  style: z.string().optional()
});

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: process.env.AI_VIDEO_PROVIDER || "mock"
  });
});

app.post("/api/prompts", (req, res) => {
  const input = normalizePromptInput(req.body);
  res.json({
    input,
    prompts: createVideoPrompts(input)
  });
});

app.post("/api/videos", upload.single("photo"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Upload a photo in the `photo` field." });
      return;
    }

    const input = videoInputSchema.parse(req.body);
    const job = await createVideoJob({ file: req.file, input });
    res.status(202).json({ job });
  } catch (error) {
    next(error);
  }
});

app.get("/api/videos/:id", async (req, res, next) => {
  try {
    const job = await getVideoJob(req.params.id);
    res.json({ job });
  } catch (error) {
    next(error);
  }
});

const clientDir = path.resolve(__dirname, "../../dist/client");
app.use(express.static(clientDir));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  const status = error.status || (error.name === "ZodError" ? 400 : 500);
  const message = error.name === "ZodError" ? "Invalid request fields." : error.message;
  res.status(status).json({
    error: message,
    details: error.issues || undefined
  });
});

const port = Number(process.env.PORT || 3000);
let listenErrorLogged = false;
const server = app.listen(port, "0.0.0.0", (error) => {
  if (error) {
    listenErrorLogged = true;
    console.error(`Photo Liftoff failed to listen on ${port}:`, error);
    process.exitCode = 1;
    return;
  }
  console.log(`Photo Liftoff listening on ${port}`);
});

server.on("error", (error) => {
  if (listenErrorLogged) return;
  console.error(`Photo Liftoff server error on ${port}:`, error);
  process.exitCode = 1;
});
