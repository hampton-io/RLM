#!/usr/bin/env node

/**
 * RLM Metrics Server
 * Standalone server for metrics API
 * 
 * Usage:
 *   npx tsx src/metrics/server.ts --port 3001
 *   RLM_METRICS_API_KEY=secret npx tsx src/metrics/server.ts
 */

import express from "express";
import cors from "cors";
import { metricsRouter, metricsCollector } from "./index.js";

const app = express();

// Parse command line arguments
const args = process.argv.slice(2);
let port = 3001;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" || args[i] === "-p") {
    port = parseInt(args[++i], 10);
  }
}

// Configure metrics
metricsCollector.configure({
  enabled: true,
  apiKey: process.env.RLM_METRICS_API_KEY,
  redactQueries: process.env.RLM_REDACT_QUERIES === "true",
  maxHistory: parseInt(process.env.RLM_MAX_HISTORY || "10000", 10),
});

// Middleware
app.use(cors());
app.use(express.json());

// Mount metrics API
app.use("/api/metrics", metricsRouter);

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    name: "RLM Metrics Server",
    version: "0.5.0",
    endpoints: [
      "GET /api/metrics/health",
      "GET /api/metrics/stats",
      "GET /api/metrics/queries",
      "GET /api/metrics/queries/:id",
      "GET /api/metrics/content",
    ],
  });
});

// Health check (unauthenticated)
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Start server
app.listen(port, () => {
  console.log(`RLM Metrics Server running on http://localhost:${port}`);
  console.log(`API endpoints available at http://localhost:${port}/api/metrics/*`);
  if (process.env.RLM_METRICS_API_KEY) {
    console.log("API key authentication enabled");
  } else {
    console.log("Warning: No API key configured (RLM_METRICS_API_KEY)");
  }
});

export { app };
