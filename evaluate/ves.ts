/**
 * Visual Embedding Similarity (VES) — semantic visual fidelity metric.
 *
 * Reference: Figma2Code (arXiv:2604.13648), Section 4.1 / Appendix E.1.
 *
 * Assisted with Claude Code
 */

import {
  pipeline,
  RawImage,
  type ImageFeatureExtractionPipeline,
  type Tensor,
} from "@huggingface/transformers";

const MODEL_ID = "Xenova/dinov2-base";

let extractorPromise: Promise<ImageFeatureExtractionPipeline> | null = null;

/**
 * Return (and lazily create) the singleton feature-extraction pipeline.
 * The promise is cached so concurrent callers all await the same load.
 */
function getExtractor(): Promise<ImageFeatureExtractionPipeline> {
  if (!extractorPromise) {
    // The transformers.js pipeline type for "image-feature-extraction" is not
    // perfectly typed for our usage, so we cast through `unknown`.
    extractorPromise = pipeline(
      "image-feature-extraction",
      MODEL_ID,
    ) as unknown as Promise<ImageFeatureExtractionPipeline>;
  }
  return extractorPromise;
}

// Accept either a raw Buffer or a base64/data-URI string so callers don't
// need to pre-decode PNG data before passing it in.
function toBuffer(input: string | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input;
  // Strip the optional "data:image/<type>;base64," prefix before decoding.
  const stripped = input.replace(/^data:image\/[a-z]+;base64,/, "");
  return Buffer.from(stripped, "base64");
}

/**
 * Cosine similarity between two equal-length embedding vectors.
 *
 * Returns 0 when either vector is the zero vector (degenerate case) rather
 * than producing NaN from a divide-by-zero.
 */
function cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`embedding length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0,
    na = 0, // squared norm of a
    nb = 0; // squared norm of b
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  // Guard against zero-norm vectors to avoid NaN.
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Run a single PNG buffer through DINOv2 and return its CLS token embedding.
 *
 * DINOv2 processes images as patches plus one prepended CLS (class) token.
 * The CLS token's hidden state is a global image representation commonly used
 * for retrieval / similarity tasks — this is what figma2code compares.
 */
async function embed(buf: Buffer): Promise<Float32Array> {
  const ext = await getExtractor();
  // transformers.js requires a RawImage; wrap the PNG buffer in a Blob first.
  const image = await RawImage.fromBlob(new Blob([buf]) as Blob);
  // Without `pool`, the pipeline returns raw hidden states with shape
  // [1, num_tokens, hidden_dim]. The CLS token is at index 0 along the token
  // axis — we slice it out to match figma2code's `last_hidden_state[:, 0, :]`.
  const result = await (ext as unknown as (img: RawImage) => Promise<Tensor>)(
    image,
  );
  const dims = result.dims as readonly number[];
  if (dims.length !== 3 || dims[0] !== 1) {
    throw new Error(`unexpected DINOv2 output shape: [${dims.join(", ")}]`);
  }
  const hiddenDim = dims[2]; // 768 for dinov2-base
  const data = result.data as Float32Array;
  // The flat buffer is laid out as [CLS, patch_0, patch_1, ...] × hiddenDim.
  // Slicing the first hiddenDim values extracts just the CLS token.
  return data.slice(0, hiddenDim);
}

export interface VesResult {
  /** Cosine similarity in [-1, 1]; in practice ~[0, 1] for natural images. Higher = closer. */
  ves: number;
  /** Embedding dimensionality (768 for dinov2-base). */
  embeddingDim: number;
}

/**
 * Compute VES between a Figma design screenshot and a rendered component
 * screenshot.
 *
 * Both images are embedded in parallel to minimise wall-clock time.
 *
 * @param designPng   Reference design PNG as a Buffer or base64 string.
 * @param renderedPng Rendered component PNG as a Buffer or base64 string.
 * @returns           Cosine similarity score and embedding dimensionality.
 */
export async function computeVes(
  designPng: string | Buffer,
  renderedPng: string | Buffer,
): Promise<VesResult> {
  // Embed both images concurrently — the model is already loaded at this point
  // so the two inference calls can overlap on the ONNX runtime thread pool.
  const [a, b] = await Promise.all([
    embed(toBuffer(designPng)),
    embed(toBuffer(renderedPng)),
  ]);
  return { ves: cosineSim(a, b), embeddingDim: a.length };
}

/** Force the DINOv2 model to load now. Useful to surface load latency upfront. */
export async function preloadVes(): Promise<void> {
  await getExtractor();
}
