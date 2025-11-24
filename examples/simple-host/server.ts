#!/usr/bin/env npx tsx
/**
 * Simple HTTP server to serve the host and sandbox html files with appropriate
 * Content Security Policy (CSP) headers.
 */

import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || "8080", 10);
const DIRECTORY = join(__dirname, "dist");

const app = express();

// CORS middleware for all routes
app.use(cors());

// Custom middleware for sandbox.html and root
app.use((req, res, next) => {
  if (req.path === "/sandbox.html" || req.path === "/") {
    // Permissive CSP to allow external resources (images, styles, scripts)
    const csp = [
      "default-src 'self'",
      "img-src * data: blob: 'unsafe-inline'",
      "style-src * blob: data: 'unsafe-inline'",
      "script-src * blob: data: 'unsafe-inline' 'unsafe-eval'",
      "connect-src *",
      "font-src * blob: data:",
      "media-src * blob: data:",
      "frame-src * blob: data:",
    ].join("; ");
    res.setHeader("Content-Security-Policy", csp);

    // Disable caching to ensure fresh content on every request
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

// Serve static files from dist directory
app.use(express.static(DIRECTORY));

// Redirect root to example-host.html
app.get("/", (_req, res) => {
  res.redirect("/example-host-react.html");
});

app.listen(PORT, () => {
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop the server\n");
});
