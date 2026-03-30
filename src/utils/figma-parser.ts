/**
 * figma-parser.ts
 * Converts raw Figma MCP response data into a typed FigmaNode tree.
 * Pure transformation — no side effects, no I/O, no framework imports.
 */

import type { FigmaNode, FigmaFill, FigmaEffect, FigmaColor } from '../types/index.js';

// ---------------------------------------------------------------------------
// Raw Figma API shapes (untyped data from MCP)
// ---------------------------------------------------------------------------

type RawColor = {
  r?: unknown;
  g?: unknown;
  b?: unknown;
  a?: unknown;
};

type RawFill = {
  type?: unknown;
  color?: unknown;
  opacity?: unknown;
};

type RawEffect = {
  type?: unknown;
  visible?: unknown;
  radius?: unknown;
  color?: unknown;
  offset?: unknown;
};

type RawNode = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  x?: unknown;
  y?: unknown;
  absoluteBoundingBox?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  width?: unknown;
  height?: unknown;
  children?: unknown;
  fills?: unknown;
  strokes?: unknown;
  effects?: unknown;
  style?: unknown;
  fontName?: unknown;
  fontSize?: unknown;
  characters?: unknown;
  layoutMode?: unknown;
  paddingLeft?: unknown;
  paddingRight?: unknown;
  paddingTop?: unknown;
  paddingBottom?: unknown;
  itemSpacing?: unknown;
  cornerRadius?: unknown;
  opacity?: unknown;
  document?: unknown;
};

// ---------------------------------------------------------------------------
// Coercion helpers
// ---------------------------------------------------------------------------

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function toString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function parseColor(raw: unknown): FigmaColor | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as RawColor;
  return {
    r: toNumber(c.r),
    g: toNumber(c.g),
    b: toNumber(c.b),
    a: typeof c.a === 'number' ? c.a : 1,
  };
}

function parseFills(raw: unknown): FigmaFill[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: unknown): FigmaFill => {
    const f = (item ?? {}) as RawFill;
    const fill: FigmaFill = { type: toString(f.type, 'SOLID') };
    const color = parseColor(f.color);
    if (color) fill.color = color;
    if (typeof f.opacity === 'number') fill.opacity = f.opacity;
    return fill;
  });
}

function parseEffects(raw: unknown): FigmaEffect[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: unknown): FigmaEffect => {
    const e = (item ?? {}) as RawEffect;
    const effect: FigmaEffect = {
      type: toString(e.type, 'DROP_SHADOW'),
      visible: e.visible !== false,
    };
    if (typeof e.radius === 'number') effect.radius = e.radius;
    const color = parseColor(e.color);
    if (color) effect.color = color;
    if (e.offset && typeof e.offset === 'object') {
      const off = e.offset as { x?: unknown; y?: unknown };
      effect.offset = { x: toNumber(off.x), y: toNumber(off.y) };
    }
    return effect;
  });
}

// ---------------------------------------------------------------------------
// Core recursive parser
// ---------------------------------------------------------------------------

function parseNode(raw: RawNode): FigmaNode {
  // Figma MCP may return bounding box in absoluteBoundingBox
  const bbox = raw.absoluteBoundingBox ?? {};
  const bboxObj = (bbox && typeof bbox === 'object') ? bbox as { x?: unknown; y?: unknown; width?: unknown; height?: unknown } : {};

  const node: FigmaNode = {
    id: toString(raw.id, 'unknown'),
    name: toString(raw.name, 'Untitled'),
    type: toString(raw.type, 'FRAME'),
    x: toNumber(raw.x ?? bboxObj.x),
    y: toNumber(raw.y ?? bboxObj.y),
    width: toNumber(raw.width ?? bboxObj.width),
    height: toNumber(raw.height ?? bboxObj.height),
  };

  // Children
  if (Array.isArray(raw.children)) {
    node.children = raw.children.map((c: unknown) => parseNode(c as RawNode));
  }

  // Fills / strokes
  const fills = parseFills(raw.fills);
  if (fills.length > 0) node.fills = fills;

  const strokes = parseFills(raw.strokes);
  if (strokes.length > 0) node.strokes = strokes;

  // Effects
  const effects = parseEffects(raw.effects);
  if (effects.length > 0) node.effects = effects;

  // Typography — may live on raw.style (Figma REST) or directly on the node (MCP)
  const style = (raw.style && typeof raw.style === 'object') ? raw.style as Record<string, unknown> : {};
  const fontFamily = toString(style['fontFamily'] ?? style['fontName'] ?? (raw.fontName as Record<string, unknown> | undefined)?.['family'] ?? '', '');
  const fontStyle = toString(style['fontStyle'] ?? (raw.fontName as Record<string, unknown> | undefined)?.['style'] ?? '', 'Regular');
  if (fontFamily) node.fontName = { family: fontFamily, style: fontStyle };

  const fontSize = toNumber(style['fontSize'] ?? raw.fontSize, 0);
  if (fontSize > 0) node.fontSize = fontSize;

  if (typeof raw.characters === 'string') node.characters = raw.characters;

  // Auto-layout
  const lm = raw.layoutMode;
  if (lm === 'HORIZONTAL' || lm === 'VERTICAL') node.layoutMode = lm;
  else if (typeof lm === 'string') node.layoutMode = 'NONE';

  if (typeof raw.paddingLeft === 'number') node.paddingLeft = raw.paddingLeft;
  if (typeof raw.paddingRight === 'number') node.paddingRight = raw.paddingRight;
  if (typeof raw.paddingTop === 'number') node.paddingTop = raw.paddingTop;
  if (typeof raw.paddingBottom === 'number') node.paddingBottom = raw.paddingBottom;
  if (typeof raw.itemSpacing === 'number') node.itemSpacing = raw.itemSpacing;
  if (typeof raw.cornerRadius === 'number') node.cornerRadius = raw.cornerRadius;
  if (typeof raw.opacity === 'number') node.opacity = raw.opacity;

  return node;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a raw Figma MCP response into a typed FigmaNode array.
 *
 * The MCP response structure varies:
 *   - get_figma_data may return { document: { children: [...] } }
 *   - or { nodes: { [nodeId]: { document: {...} } } }
 *   - or a direct node object
 *
 * This function handles all three shapes.
 */
export function parseFigmaResponse(raw: unknown): FigmaNode[] {
  if (!raw || typeof raw !== 'object') return [];

  const obj = raw as Record<string, unknown>;

  // Shape: { nodes: { [id]: { document: {...} } } }
  if (obj['nodes'] && typeof obj['nodes'] === 'object') {
    const nodes = obj['nodes'] as Record<string, unknown>;
    const entries = Object.values(nodes);
    return entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const e = entry as Record<string, unknown>;
      const doc = e['document'] ?? entry;
      return [parseNode(doc as RawNode)];
    });
  }

  // Shape: { document: { children: [...] } }
  if (obj['document'] && typeof obj['document'] === 'object') {
    const doc = obj['document'] as Record<string, unknown>;
    if (Array.isArray(doc['children'])) {
      return (doc['children'] as unknown[]).map((c) => parseNode(c as RawNode));
    }
    return [parseNode(doc as RawNode)];
  }

  // Shape: direct node or array of nodes
  if (Array.isArray(raw)) {
    return raw.map((c) => parseNode(c as RawNode));
  }

  return [parseNode(obj as RawNode)];
}
