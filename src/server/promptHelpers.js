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
    duration: Number.isFinite(duration) ? Math.min(10, Math.max(5, duration)) : 5
  };
}

export function createVideoPrompts(input = {}) {
  const { subject, motion, style, duration } = normalizePromptInput(input);

  const shared =
    `Animate the still photo into a ${duration}-second image-to-video clip. ` +
    `Preserve the exact identity, clothing, composition, lighting, and background from the source image. ` +
    `Use smooth temporal consistency, realistic physics, no morphing, no new objects, no text, and no cuts.`;
  const funnyShared =
    `Animate the still photo into a ${duration}-second vertical-friendly image-to-video clip. ` +
    `Preserve the exact identity, clothing, main subject, lighting, and recognizable source image. ` +
    `Use smooth temporal consistency, coherent physics, no grotesque distortion, no captions, no logos, and no watermarks.`;

  return {
    serious:
      `${shared} Create a polished ${style} shot where ${subject} comes to life through ${motion}. ` +
      `Use gentle camera drift, subtle parallax, controlled focus breathing, and believable environmental movement. ` +
      `The result should feel like a high-end editorial or film insert.`,
    funny:
      `${funnyShared} Create a ridiculous reaction-meme style clip where ${subject} comes to life as if the joke lands in front of an unseen room. ` +
      `Use tiny overconfident poses, smug micro-expressions, awkward dance or performance beats, sudden dramatic confidence, comedic zooms, and quick handheld reaction energy. ` +
      `If the source image already contains bystanders, let them laugh, turn, clap, or react playfully; otherwise imply the reaction through timing, camera movement, and the subject's performance. ` +
      `Keep the joke visual and shareable without adding text.`
  };
}

export function buildProviderPrompt(input = {}) {
  const variant = input.variant === "funny" ? "funny" : "serious";
  return createVideoPrompts(input)[variant];
}
