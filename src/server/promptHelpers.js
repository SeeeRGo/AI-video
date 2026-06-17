const DEFAULT_SUBJECT = "the main subject in the uploaded photo";
const DEFAULT_MOTION = "small natural motion, depth, and atmosphere";
const DEFAULT_STYLE = "photoreal cinematic video";

function clean(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function normalizePromptInput(input = {}) {
  const duration = Number(input.duration);

  return {
    subject: clean(input.subject, DEFAULT_SUBJECT),
    motion: clean(input.motion, DEFAULT_MOTION),
    style: clean(input.style, DEFAULT_STYLE),
    duration: Number.isFinite(duration) ? Math.min(10, Math.max(5, duration)) : 7
  };
}

export function createVideoPrompts(input = {}) {
  const { subject, motion, style, duration } = normalizePromptInput(input);

  const shared =
    `Animate the still photo into a ${duration}-second image-to-video clip. ` +
    `Preserve the exact identity, clothing, composition, lighting, and background from the source image. ` +
    `Use smooth temporal consistency, realistic physics, no morphing, no new objects, no text, and no cuts.`;

  return {
    serious:
      `${shared} Create a polished ${style} shot where ${subject} comes to life through ${motion}. ` +
      `Use gentle camera drift, subtle parallax, controlled focus breathing, and believable environmental movement. ` +
      `The result should feel like a high-end editorial or film insert.`,
    funny:
      `${shared} Create a ridiculous but still coherent clip where ${subject} comes to life in an absurd way: ` +
      `micro-expressions, tiny overconfident poses, dramatic slow-motion confidence, and playful background reactions. ` +
      `Keep the original photo recognizable, avoid grotesque distortion, and make the joke visual rather than adding text.`
  };
}

export function buildProviderPrompt(input = {}) {
  const variant = input.variant === "funny" ? "funny" : "serious";
  return createVideoPrompts(input)[variant];
}
