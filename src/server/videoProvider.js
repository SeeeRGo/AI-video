import crypto from "node:crypto";

import { buildProviderPrompt } from "./promptHelpers.js";

const mockJobs = new Map();

function dataUriFromFile(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

function parseExtraInput() {
  const raw = process.env.VIDEO_EXTRA_INPUT_JSON || "{}";
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseAllowedDurations(model) {
  const raw =
    process.env.VIDEO_ALLOWED_DURATIONS ||
    (model && model.toLowerCase().startsWith("kwaivgi/kling-") ? "5,10" : "");

  return raw
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function closestDuration(duration, allowedDurations) {
  if (allowedDurations.length === 0) return Number(duration);

  return allowedDurations.reduce((best, candidate) => {
    const bestDistance = Math.abs(best - duration);
    const candidateDistance = Math.abs(candidate - duration);
    return candidateDistance < bestDistance ? candidate : best;
  }, allowedDurations[0]);
}

function defaultImageField(model) {
  if (model && model.toLowerCase().startsWith("kwaivgi/kling-")) {
    return "start_image";
  }

  return "image";
}

function resolveImageField(model) {
  const configuredField = process.env.VIDEO_IMAGE_FIELD?.trim();
  const isKlingModel = model && model.toLowerCase().startsWith("kwaivgi/kling-");

  if (configuredField && !(isKlingModel && configuredField === "image")) {
    return configuredField;
  }

  return defaultImageField(model);
}

function normalizeReplicateInput(input, model) {
  const allowedDurations = parseAllowedDurations(model);
  return {
    ...input,
    duration: closestDuration(Number(input.duration), allowedDurations)
  };
}

function findVideoUrl(output) {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    return output.find((item) => typeof item === "string" && /^https?:\/\//.test(item)) || null;
  }
  if (output && typeof output === "object") {
    return output.video || output.url || output.output || null;
  }
  return null;
}

function createMockJob({ file, prompt, variant, duration }) {
  const id = `mock_${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();

  const job = {
    id,
    provider: "mock",
    status: "starting",
    variant,
    duration,
    prompt,
    filename: file.originalname,
    createdAt,
    output: null,
    message: "Mock mode is enabled. Add provider credentials in Railway to generate real videos."
  };

  mockJobs.set(id, job);

  setTimeout(() => {
    const current = mockJobs.get(id);
    if (current) mockJobs.set(id, { ...current, status: "processing" });
  }, 1200);

  setTimeout(() => {
    const current = mockJobs.get(id);
    if (current) {
      mockJobs.set(id, {
        ...current,
        status: "succeeded",
        output: null,
        message: "Mock job completed. Switch AI_VIDEO_PROVIDER to replicate for real output."
      });
    }
  }, 4200);

  return job;
}

async function createReplicateJob({ file, input }) {
  const token = process.env.REPLICATE_API_TOKEN;
  const model = process.env.REPLICATE_MODEL;
  const version = process.env.REPLICATE_VERSION;

  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is required when AI_VIDEO_PROVIDER=replicate.");
  }

  if (!model && !version) {
    throw new Error("Set either REPLICATE_MODEL or REPLICATE_VERSION for Replicate video generation.");
  }

  const normalizedInput = normalizeReplicateInput(input, model);
  const prompt = buildProviderPrompt(normalizedInput);
  const promptField = process.env.VIDEO_PROMPT_FIELD || "prompt";
  const imageField = resolveImageField(model);
  const durationField = process.env.VIDEO_DURATION_FIELD || "duration";

  const providerInput = {
    ...parseExtraInput(),
    [promptField]: prompt,
    [imageField]: dataUriFromFile(file)
  };

  if (durationField) {
    providerInput[durationField] = normalizedInput.duration;
  }

  const webhook = process.env.REPLICATE_WEBHOOK_URL;
  const usingModelEndpoint = Boolean(model);
  const url = usingModelEndpoint
    ? `https://api.replicate.com/v1/models/${model}/predictions`
    : "https://api.replicate.com/v1/predictions";

  const body = usingModelEndpoint
    ? { input: providerInput, ...(webhook ? { webhook } : {}) }
    : { version, input: providerInput, ...(webhook ? { webhook } : {}) };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = payload.detail || payload.error || response.statusText;
    throw new Error(`Replicate request failed: ${detail}`);
  }

  return {
    id: payload.id,
    provider: "replicate",
    status: payload.status || "starting",
    variant: normalizedInput.variant,
    duration: normalizedInput.duration,
    prompt,
    output: findVideoUrl(payload.output),
    raw: payload
  };
}

async function getReplicateJob(id) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is required to read Replicate job status.");
  }

  const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = payload.detail || payload.error || response.statusText;
    throw new Error(`Replicate status request failed: ${detail}`);
  }

  return {
    id: payload.id,
    provider: "replicate",
    status: payload.status,
    output: findVideoUrl(payload.output),
    raw: payload
  };
}

export async function createVideoJob({ file, input }) {
  const prompt = buildProviderPrompt(input);
  const provider = process.env.AI_VIDEO_PROVIDER || "mock";

  if (provider === "replicate") {
    return createReplicateJob({ file, input });
  }

  return createMockJob({
    file,
    prompt,
    variant: input.variant,
    duration: input.duration
  });
}

export async function getVideoJob(id) {
  if (id.startsWith("mock_")) {
    const job = mockJobs.get(id);
    if (!job) {
      const error = new Error("Video job was not found.");
      error.status = 404;
      throw error;
    }
    return job;
  }

  return getReplicateJob(id);
}
