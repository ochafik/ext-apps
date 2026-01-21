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

const TOOL_DESCRIPTION = `Renders a p5.js creative coding sketch in real-time.

p5.js is a JavaScript library for creative coding, with a focus on making coding accessible for artists, designers, educators, and beginners.

SKETCH FORMAT:
Write your sketch using p5.js global mode functions. The main functions are:

  function setup() {
    createCanvas(400, 400);
  }

  function draw() {
    background(220);
    ellipse(mouseX, mouseY, 50, 50);
  }

AVAILABLE FUNCTIONS:
- setup(): Called once at start - use createCanvas() here
- draw(): Called continuously - main animation loop
- mousePressed(), mouseReleased(), mouseMoved(), mouseDragged()
- keyPressed(), keyReleased(), keyTyped()
- windowResized(): Called when window size changes

DRAWING PRIMITIVES:
- Shapes: ellipse(), rect(), line(), triangle(), arc(), point(), quad(), bezier()
- 3D: box(), sphere(), cylinder(), cone(), torus() (use WEBGL mode)
- Text: text(), textSize(), textAlign(), textFont()

STYLING:
- Colors: fill(), stroke(), noFill(), noStroke(), background()
- Color modes: colorMode(RGB) or colorMode(HSB)
- Stroke: strokeWeight(), strokeCap(), strokeJoin()

TRANSFORMATIONS:
- translate(), rotate(), scale(), push(), pop()
- For 3D: rotateX(), rotateY(), rotateZ()

MATH & ANIMATION:
- sin(), cos(), tan(), map(), lerp(), constrain()
- random(), noise() (Perlin noise)
- millis(), frameCount, frameRate()

MOUSE & KEYBOARD:
- mouseX, mouseY: current mouse position
- pmouseX, pmouseY: previous mouse position
- mouseIsPressed, mouseButton
- key, keyCode, keyIsPressed

CANVAS MODES:
- createCanvas(w, h): 2D canvas
- createCanvas(w, h, WEBGL): 3D WebGL canvas
- Use windowWidth, windowHeight for responsive sizing

EXAMPLES:

Simple animation:
  function setup() {
    createCanvas(windowWidth, windowHeight);
  }
  function draw() {
    background(0);
    fill(255);
    ellipse(width/2 + sin(frameCount * 0.05) * 100, height/2, 50, 50);
  }

Interactive drawing:
  function setup() {
    createCanvas(windowWidth, windowHeight);
    background(255);
  }
  function draw() {
    if (mouseIsPressed) {
      stroke(0);
      strokeWeight(4);
      line(pmouseX, pmouseY, mouseX, mouseY);
    }
  }

3D scene:
  function setup() {
    createCanvas(windowWidth, windowHeight, WEBGL);
  }
  function draw() {
    background(200);
    rotateX(frameCount * 0.01);
    rotateY(frameCount * 0.01);
    box(100);
  }

TIPS:
- Use windowWidth and windowHeight for responsive full-size canvas
- The draw() function runs at ~60fps by default
- Use noLoop() to stop animation, loop() to restart
- Use frameRate(n) to change animation speed
- Use clear() instead of background() for transparent canvas (blends with host theme)`;

const DEFAULT_SKETCH = `function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB);
}

function draw() {
  clear(); // Transparent background - blends with host theme

  // Create flowing particles
  for (let i = 0; i < 5; i++) {
    let x = width/2 + sin(frameCount * 0.02 + i) * 150;
    let y = height/2 + cos(frameCount * 0.03 + i * 0.5) * 100;
    let hue = (frameCount + i * 30) % 360;

    fill(hue, 80, 100);
    noStroke();
    ellipse(x, y, 30 + sin(frameCount * 0.1 + i) * 10);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}`;

/**
 * Creates a new MCP server instance with tools and resources registered.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "p5.js Server",
    version: "1.0.0",
  });

  const resourceUri = "ui://p5js/mcp-app.html";

  // Register the render-p5js tool with UI metadata
  registerAppTool(
    server,
    "render-p5js",
    {
      title: "p5.js Sketch",
      description: TOOL_DESCRIPTION,
      inputSchema: z.object({
        sketch: z
          .string()
          .default(DEFAULT_SKETCH)
          .describe(
            "p5.js sketch code containing setup() and draw() functions",
          ),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (): Promise<CallToolResult> => {
      // Tool execution returns success - actual rendering happens in the UI
      return {
        content: [{ type: "text", text: "Sketch rendered successfully" }],
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
