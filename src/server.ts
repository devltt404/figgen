/**
 * figgen API server
 * Exposes the pipeline as an SSE endpoint so the UI can stream progress.
 */

import "dotenv/config";
import http from "node:http";
import { runPipeline, type PipelineEvent } from "./pipeline-runner.js";

const PORT = parseInt(process.env.SERVER_PORT ?? "4111", 10);

function cors(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  cors(res);

  // CORS preflight — the UI dev server lives on a different port (5174)
  // than the API (4111), so browsers send OPTIONS before the real POST.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/run") {
    let body: { figmaUrl?: string; maxIter?: number };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const { figmaUrl, maxIter } = body;
    if (!figmaUrl) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "figmaUrl is required" }));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    const emit = (event: PipelineEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await runPipeline(figmaUrl, { maxIter }, emit);
    } catch (err) {
      emit({ type: "error", message: String(err) });
    }

    res.end();
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`figgen server listening on http://localhost:${PORT}`);
});
