/**
 * token-mapper.ts
 * Extracts DesignTokens from a FigmaNode tree.
 * Maps Figma raw values (colors, font sizes, spacing, radii, shadows)
 * to structured token objects ready for the Codegen Agent to consume.
 * Pure transformation — no side effects, no I/O, no framework imports.
 */

import type { FigmaNode, FigmaColor, DesignTokens } from '../types/index.js';

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function toHex(v: number): string {
  return Math.round(clamp(v) * 255)
    .toString(16)
    .padStart(2, '0');
}

function colorToHex(c: FigmaColor): string {
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

function colorToRgba(c: FigmaColor): string {
  const r = Math.round(clamp(c.r) * 255);
  const g = Math.round(clamp(c.g) * 255);
  const b = Math.round(clamp(c.b) * 255);
  const a = Math.round(clamp(c.a) * 100) / 100;
  return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
}

// ---------------------------------------------------------------------------
// Slug helper — converts node names to valid token keys
// ---------------------------------------------------------------------------

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function uniqueKey(record: Record<string, string>, base: string): string {
  let key = base;
  let i = 2;
  while (key in record) {
    key = `${base}-${i++}`;
  }
  return key;
}

// ---------------------------------------------------------------------------
// Recursive tree walker
// ---------------------------------------------------------------------------

interface Accumulator {
  colors: Record<string, string>;
  fontSizes: Record<string, string>;
  spacing: Record<string, string>;
  radii: Record<string, string>;
  shadows: Record<string, string>;
}

function walkNode(node: FigmaNode, acc: Accumulator): void {
  // --- Colors from fills ---
  if (node.fills) {
    for (const fill of node.fills) {
      if (fill.color && fill.type === 'SOLID') {
        const hex = colorToHex(fill.color);
        const slug = toSlug(node.name) || 'color';
        const key = uniqueKey(acc.colors, slug);
        acc.colors[key] = hex;
      }
    }
  }

  // --- Font sizes ---
  if (node.fontSize && node.fontSize > 0) {
    const px = `${node.fontSize}px`;
    // Deduplicate by value
    const alreadyExists = Object.values(acc.fontSizes).includes(px);
    if (!alreadyExists) {
      const slug = `text-${node.fontSize}`;
      acc.fontSizes[slug] = px;
    }
  }

  // --- Spacing (padding & item spacing) ---
  const spacingValues: number[] = [];
  if (node.paddingTop != null) spacingValues.push(node.paddingTop);
  if (node.paddingBottom != null) spacingValues.push(node.paddingBottom);
  if (node.paddingLeft != null) spacingValues.push(node.paddingLeft);
  if (node.paddingRight != null) spacingValues.push(node.paddingRight);
  if (node.itemSpacing != null) spacingValues.push(node.itemSpacing);

  for (const v of spacingValues) {
    const px = `${v}px`;
    const alreadyExists = Object.values(acc.spacing).includes(px);
    if (!alreadyExists) {
      const slug = `space-${v}`;
      acc.spacing[slug] = px;
    }
  }

  // --- Border radii ---
  if (node.cornerRadius != null && node.cornerRadius > 0) {
    const px = `${node.cornerRadius}px`;
    const alreadyExists = Object.values(acc.radii).includes(px);
    if (!alreadyExists) {
      const slug = `rounded-${node.cornerRadius}`;
      acc.radii[slug] = px;
    }
  }

  // --- Box shadows from effects ---
  if (node.effects) {
    for (const effect of node.effects) {
      if (!effect.visible) continue;
      if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
        const color = effect.color ? colorToRgba(effect.color) : 'rgba(0,0,0,0.25)';
        const x = effect.offset?.x ?? 0;
        const y = effect.offset?.y ?? 4;
        const blur = effect.radius ?? 8;
        const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : '';
        const css = `${inset}${x}px ${y}px ${blur}px ${color}`;
        const slug = toSlug(node.name) || 'shadow';
        const key = uniqueKey(acc.shadows, slug);
        acc.shadows[key] = css;
      }
    }
  }

  // --- Recurse ---
  if (node.children) {
    for (const child of node.children) {
      walkNode(child, acc);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Walk the FigmaNode tree and extract all design tokens.
 * Returns a DesignTokens object with deduplicated values.
 */
export function extractTokens(nodes: FigmaNode[]): DesignTokens {
  const acc: Accumulator = {
    colors: {},
    fontSizes: {},
    spacing: {},
    radii: {},
    shadows: {},
  };

  for (const node of nodes) {
    walkNode(node, acc);
  }

  return acc;
}
