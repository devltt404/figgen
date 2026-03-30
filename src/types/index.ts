/**
 * Shared message contracts between agents in the Figma-to-code multi-agent system.
 * All agent inputs and outputs are defined here as Zod schemas with inferred TypeScript types.
 * No agent imports from this file directly — the orchestrator manages these contracts.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitive design value schemas
// ---------------------------------------------------------------------------

export const FigmaColorSchema = z.object({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  a: z.number().min(0).max(1),
});
export type FigmaColor = z.infer<typeof FigmaColorSchema>;

export const FigmaFillSchema = z.object({
  type: z.string(),
  color: FigmaColorSchema.optional(),
  opacity: z.number().optional(),
});
export type FigmaFill = z.infer<typeof FigmaFillSchema>;

export const FigmaEffectSchema = z.object({
  type: z.string(),
  visible: z.boolean(),
  radius: z.number().optional(),
  color: FigmaColorSchema.optional(),
  offset: z.object({ x: z.number(), y: z.number() }).optional(),
});
export type FigmaEffect = z.infer<typeof FigmaEffectSchema>;

// ---------------------------------------------------------------------------
// Node tree schema (recursive)
// ---------------------------------------------------------------------------

export type FigmaNode = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children?: FigmaNode[];
  fills?: FigmaFill[];
  strokes?: FigmaFill[];
  effects?: FigmaEffect[];
  fontName?: { family: string; style: string };
  fontSize?: number;
  characters?: string;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  cornerRadius?: number;
  opacity?: number;
};

export const FigmaNodeSchema: z.ZodType<FigmaNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    children: z.array(FigmaNodeSchema).optional(),
    fills: z.array(FigmaFillSchema).optional(),
    strokes: z.array(FigmaFillSchema).optional(),
    effects: z.array(FigmaEffectSchema).optional(),
    fontName: z.object({ family: z.string(), style: z.string() }).optional(),
    fontSize: z.number().optional(),
    characters: z.string().optional(),
    layoutMode: z.enum(['NONE', 'HORIZONTAL', 'VERTICAL']).optional(),
    paddingLeft: z.number().optional(),
    paddingRight: z.number().optional(),
    paddingTop: z.number().optional(),
    paddingBottom: z.number().optional(),
    itemSpacing: z.number().optional(),
    cornerRadius: z.number().optional(),
    opacity: z.number().optional(),
  })
);

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

export const DesignTokensSchema = z.object({
  colors: z.record(z.string(), z.string()),
  fontSizes: z.record(z.string(), z.string()),
  spacing: z.record(z.string(), z.string()),
  radii: z.record(z.string(), z.string()),
  shadows: z.record(z.string(), z.string()),
});
export type DesignTokens = z.infer<typeof DesignTokensSchema>;

// ---------------------------------------------------------------------------
// Asset (images, icons)
// ---------------------------------------------------------------------------

export const AssetSchema = z.object({
  nodeId: z.string(),
  name: z.string(),
  base64: z.string(),
  mimeType: z.string(),
});
export type Asset = z.infer<typeof AssetSchema>;

// ---------------------------------------------------------------------------
// Ingestion Agent output / Codegen Agent input
// ---------------------------------------------------------------------------

export const FigmaContextSchema = z.object({
  frameId: z.string(),
  frameName: z.string(),
  frameWidth: z.number(),
  frameHeight: z.number(),
  screenshot: z.string(),       // base64 PNG of the Figma frame
  nodeTree: z.array(FigmaNodeSchema),
  tokens: DesignTokensSchema,
  assets: z.array(AssetSchema),
});
export type FigmaContext = z.infer<typeof FigmaContextSchema>;

// ---------------------------------------------------------------------------
// Codegen Agent output / Render Agent input (Phase 2)
// ---------------------------------------------------------------------------

export const GeneratedComponentSchema = z.object({
  tsx: z.string(),              // full TSX file content
  componentName: z.string(),
  dependencies: z.array(z.string()),
  tailwindConfigPatch: z.string().nullable(),
});
export type GeneratedComponent = z.infer<typeof GeneratedComponentSchema>;

// ---------------------------------------------------------------------------
// Phase 2 agent message contracts — placeholder schemas
// Implement fully when Phase 2 begins
// ---------------------------------------------------------------------------

// PHASE 2: DiffIssue — a single visual discrepancy between the Figma design
// and the rendered component (e.g. wrong color, wrong spacing, missing element)
export const DiffIssueSchema = z.object({});
export type DiffIssue = z.infer<typeof DiffIssueSchema>;

// PHASE 2: DiffReport — the full set of diff issues + an overall fidelity score
export const DiffReportSchema = z.object({});
export type DiffReport = z.infer<typeof DiffReportSchema>;

// PHASE 2: RefinementResult — the patched component after applying diff fixes
export const RefinementResultSchema = z.object({});
export type RefinementResult = z.infer<typeof RefinementResultSchema>;
