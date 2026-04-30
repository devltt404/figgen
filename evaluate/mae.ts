/**
 * Normalized Mean Absolute Error (MAE) — pixel-level visual fidelity metric.
 *
 * Reference: Figma2Code (arXiv:2604.13648), Section 4.1 / Appendix E.1.
 *
 * Assisted with Claude Code
 */

import { PNG } from "pngjs";

export interface MaeResult {
  /** Normalized MAE in [0, 1]. Lower = closer to design. */
  mae: number;
  /** Reference (design) width in px — also the comparison canvas width. */
  width: number;
  /** Reference (design) height in px — also the comparison canvas height. */
  height: number;
  /** Number of channel samples compared (= width × height × 3). */
  pixelsCompared: number;
}

// Accept either a raw Buffer or a base64/data-URI string so callers don't
// need to pre-decode PNG data before passing it in.
function toBuffer(input: string | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input;
  // Strip the optional "data:image/<type>;base64," prefix before decoding.
  const stripped = input.replace(/^data:image\/[a-z]+;base64,/, "");
  return Buffer.from(stripped, "base64");
}

// pngjs exposes raw pixel data as RGBA (4 bytes per pixel). MAE compares only
// the visible color channels, so we strip the alpha channel here.
function dropAlpha(rgba: Buffer, width: number, height: number): Buffer {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i]; // R
    rgb[j + 1] = rgba[i + 1]; // G
    rgb[j + 2] = rgba[i + 2]; // B
  }
  return rgb;
}

/**
 * Aspect-preserving bilinear resize, then center the result on a white canvas
 * sized refW × refH. Mirrors figma2code's `resize_to_ref` (which uses bicubic +
 * white pad). Input/output buffers are RGB (3 bytes per pixel).
 */
function resizeToRef(
  src: Buffer,
  srcW: number,
  srcH: number,
  refW: number,
  refH: number,
): Buffer {
  // Uniform scale factor that fits the source inside the reference canvas
  // without distorting the aspect ratio (letterbox / pillarbox style).
  const scale = Math.min(refW / srcW, refH / srcH);
  const newW = Math.max(1, Math.round(srcW * scale)); // clamp to ≥ 1 to avoid empty buffers
  const newH = Math.max(1, Math.round(srcH * scale));

  const resized = Buffer.alloc(newW * newH * 3);
  // Mapping ratios from destination pixel coords → source pixel coords.
  // Special-cased to 0 when the dimension is 1 pixel to avoid division by zero.
  const xRatio = newW <= 1 ? 0 : (srcW - 1) / (newW - 1);
  const yRatio = newH <= 1 ? 0 : (srcH - 1) / (newH - 1);

  for (let y = 0; y < newH; y++) {
    const sy = y * yRatio;
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const fy = sy - y0;

    for (let x = 0; x < newW; x++) {
      const sx = x * xRatio;
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const fx = sx - x0;

      // Byte offsets for the four surrounding source pixels (2×2 neighborhood).
      const i00 = (y0 * srcW + x0) * 3; // top-left
      const i10 = (y0 * srcW + x1) * 3; // top-right
      const i01 = (y1 * srcW + x0) * 3; // bottom-left
      const i11 = (y1 * srcW + x1) * 3; // bottom-right
      const dst = (y * newW + x) * 3;

      // Bilinear interpolation: lerp horizontally, then vertically.
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bot = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        resized[dst + c] = Math.round(top * (1 - fy) + bot * fy);
      }
    }
  }

  // Buffer.alloc(size, 255) fills every byte with 255 → fully white RGB canvas.
  const canvas = Buffer.alloc(refW * refH * 3, 255);
  // Center the scaled image on the white canvas (padding is already white).
  const offX = Math.floor((refW - newW) / 2);
  const offY = Math.floor((refH - newH) / 2);

  for (let y = 0; y < newH; y++) {
    const dstRow = (y + offY) * refW;
    const srcRow = y * newW;
    for (let x = 0; x < newW; x++) {
      const srcIdx = (srcRow + x) * 3;
      const dstIdx = (dstRow + (x + offX)) * 3;
      canvas[dstIdx] = resized[srcIdx];
      canvas[dstIdx + 1] = resized[srcIdx + 1];
      canvas[dstIdx + 2] = resized[srcIdx + 2];
    }
  }

  return canvas;
}

/**
 * Compute normalized MAE between a Figma design screenshot and a rendered
 * component screenshot.
 *
 * Steps:
 *   1. Decode both PNGs and strip alpha → RGB.
 *   2. Resize + center the rendered image onto a canvas matching the design
 *      dimensions (so both buffers are exactly the same length).
 *   3. Sum absolute per-channel differences and normalise to [0, 1].
 *
 * @param designPng   Reference design PNG as a Buffer or base64 string.
 * @param renderedPng Rendered component PNG as a Buffer or base64 string.
 * @returns           MAE score and metadata about the comparison canvas.
 */
export function computeMae(
  designPng: string | Buffer,
  renderedPng: string | Buffer,
): MaeResult {
  const design = PNG.sync.read(toBuffer(designPng));
  const rendered = PNG.sync.read(toBuffer(renderedPng));

  // Drop alpha from both images so we compare only RGB channels.
  const designRgb = dropAlpha(design.data, design.width, design.height);
  const renderedRgb = dropAlpha(rendered.data, rendered.width, rendered.height);

  // Scale + pad the rendered image to match the design canvas dimensions.
  const renderedAligned = resizeToRef(
    renderedRgb,
    rendered.width,
    rendered.height,
    design.width,
    design.height,
  );

  // Sum absolute per-channel (R/G/B) differences over all pixels.
  let sum = 0;
  for (let i = 0; i < designRgb.length; i++) {
    sum += Math.abs(designRgb[i] - renderedAligned[i]);
  }

  return {
    // Divide by channel count then by 255 to normalise into [0, 1].
    mae: sum / designRgb.length / 255,
    width: design.width,
    height: design.height,
    pixelsCompared: designRgb.length,
  };
}
