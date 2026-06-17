# Photo Liftoff

Photo Liftoff turns still photos into short 5-10 second video-generation jobs. It includes:

- a drag-and-drop photo workspace
- serious and funny prompt helpers
- duration controls for 5-10 second clips
- local mock generation for development
- a configurable Replicate-compatible AI video provider
- Railway deployment config

## Run Locally

```bash
npm install
npm run dev
```

In another terminal, run the API:

```bash
npm run dev:api
```

Open `http://127.0.0.1:5173`.

## Real AI Video Generation

The app works without secrets in `AI_VIDEO_PROVIDER=mock` mode. To call a real provider, set:

```bash
AI_VIDEO_PROVIDER=replicate
REPLICATE_API_TOKEN=your_token
REPLICATE_MODEL=owner/model-name
```

Some image-to-video models use different input names, so configure them without code changes:

```bash
VIDEO_PROMPT_FIELD=prompt
VIDEO_IMAGE_FIELD=start_image
VIDEO_DURATION_FIELD=duration
VIDEO_ALLOWED_DURATIONS=5,10
VIDEO_EXTRA_INPUT_JSON={"aspect_ratio":"16:9"}
```

For `kwaivgi/kling-v2.1`, the app automatically uses `start_image` and valid durations `5,10` if you leave `VIDEO_IMAGE_FIELD` unset. Other models may require different field names.

You can also use `REPLICATE_VERSION` instead of `REPLICATE_MODEL` for version-based predictions.

## Deploy To Railway

1. Create a new Railway service from this GitHub repo.
2. Add the environment variables from `.env.example`.
3. Keep `AI_VIDEO_PROVIDER=mock` for smoke tests, or set `AI_VIDEO_PROVIDER=replicate` plus provider credentials.
4. Railway will run `npm run build` and `npm start`.

## API

`POST /api/prompts`

Returns generated serious and funny prompts.

`POST /api/videos`

Multipart form fields:

- `photo`: image file
- `variant`: `serious` or `funny`
- `duration`: number from `5` to `10`
- `subject`: optional subject hint
- `motion`: optional motion hint
- `style`: optional style hint

`GET /api/videos/:id`

Returns a mock job or the provider prediction status.
