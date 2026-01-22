import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// Works both from source (server.ts) and compiled (dist/server.js)
const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

const TOOL_DESCRIPTION = `Creates and plays live-coded music patterns using Strudel, a JavaScript port of TidalCycles.

MINI-NOTATION SYNTAX:
Strudel uses a concise pattern language to describe rhythmic sequences:

- Sequences: "c3 e3 g3 b3" - space-separated notes play in order over one cycle
- Rests: "~ c3 ~ e3" - tilde (~) creates silence
- Subdivision: "[c3 e3] g3" - brackets subdivide time equally
- Alternation: "<c3 e3 g3>" - angle brackets cycle through items
- Multiplication: "c3*4" - repeat note 4 times per cycle
- Division: "c3/2" - stretch note over 2 cycles
- Chords: "[c3,e3,g3]" - comma creates simultaneous notes
- Euclidean: "c3(3,8)" - distribute 3 notes over 8 steps

PATTERN FUNCTIONS:
- note("c3 e3 g3") - define pitch pattern
- s("bd sd hh") - select samples (kick, snare, hihat)
- sound("piano") - alias for s()
- n("0 1 2 3") - sample/note index variation
- gain(0.8) - volume control
- pan("<0 1>") - stereo panning
- speed(2) - playback speed
- delay(0.5) - echo effect
- room(0.8) - reverb
- lpf(2000) - low-pass filter
- hpf(200) - high-pass filter
- crush(4) - bit crusher

PATTERN MODIFIERS:
- .fast(2) - double speed
- .slow(2) - half speed
- .rev() - reverse pattern
- .palindrome() - play forward then backward
- .sometimes(fn) - randomly apply function
- .every(4, fn) - apply function every N cycles
- .stack(pattern2) - layer patterns
- .cat(pattern2) - sequence patterns

EXAMPLES:

// Simple melody
note("c4 e4 g4 b4").s("piano")

// Drum pattern with variations
s("bd sd [~ bd] sd").sometimes(x => x.speed(2))

// Arpeggiated synth with filter sweep
note("c3 [e3 g3] a3 [g3 e3]")
  .s("sawtooth")
  .lpf(sine.range(200, 4000).slow(8))
  .room(0.5)

// Layered percussion
stack(
  s("bd*4").gain(0.8),
  s("~ sd ~ sd"),
  s("hh*8").gain(0.5)
)

// Generative pattern
n(irand(8)).s("numbers").slow(2)

AVAILABLE SOUNDS:
Drums: bd, sd, hh, oh, cp, cb, tom, rim
Synths: sine, saw, square, triangle, sawtooth
Instruments: piano, casio, gm_acoustic_grand_piano
Samples: numbers, alphabet, and many more

Note: Audio requires user interaction to start (click play button in the UI).`;

const DEFAULT_PATTERN = `note("c3 e3 g3 b3").s("piano")`;

/**
 * Creates a new MCP server instance with tools and resources registered.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "Strudel Server",
    version: "1.0.0",
  });

  const resourceUri = "ui://strudel/mcp-app.html";

  // Register the play-strudel tool with UI metadata
  registerAppTool(
    server,
    "play-strudel",
    {
      title: "Strudel Music",
      description: TOOL_DESCRIPTION,
      inputSchema: z.object({
        code: z
          .string()
          .default(DEFAULT_PATTERN)
          .describe("Strudel pattern code using mini-notation and pattern functions"),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (): Promise<CallToolResult> => {
      return {
        content: [{ type: "text", text: "Strudel pattern loaded" }],
      };
    },
  );

  // Register the resource which returns the bundled HTML/JavaScript for the UI
  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8",
      );

      return {
        contents: [
          { uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html },
        ],
      };
    },
  );

  return server;
}
