/**
 * p5.js sketch renderer MCP App
 */
import {
  App,
  type McpUiHostContext,
  applyHostStyleVariables,
  applyDocumentTheme,
} from "@modelcontextprotocol/ext-apps";
import p5 from "p5";
import "./global.css";
import "./mcp-app.css";

interface SketchInput {
  sketch: string;
}

function isSketchInput(value: unknown): value is SketchInput {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).sketch === "string"
  );
}

const log = {
  info: console.log.bind(console, "[APP]"),
  warn: console.warn.bind(console, "[APP]"),
  error: console.error.bind(console, "[APP]"),
};

// Get element references
const mainEl = document.querySelector(".main") as HTMLElement;
const sketchContainer = document.getElementById(
  "sketch-container",
) as HTMLElement;
const codePreview = document.getElementById("code-preview") as HTMLPreElement;
const fullscreenBtn = document.getElementById(
  "fullscreen-btn",
) as HTMLButtonElement;

// Display mode state
let currentDisplayMode: "inline" | "fullscreen" = "inline";

// p5.js instance
let p5Instance: p5 | null = null;
let isVisible = true;

// Handle host context changes (display mode, styling)
function handleHostContextChanged(ctx: McpUiHostContext) {
  // Apply host styling
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);

  // Show fullscreen button if available (only update if field is present)
  if (ctx.availableDisplayModes !== undefined) {
    if (ctx.availableDisplayModes.includes("fullscreen")) {
      fullscreenBtn.classList.add("available");
    } else {
      fullscreenBtn.classList.remove("available");
    }
  }

  // Update display mode state and UI
  if (ctx.displayMode) {
    currentDisplayMode = ctx.displayMode as "inline" | "fullscreen";
    if (currentDisplayMode === "fullscreen") {
      mainEl.classList.add("fullscreen");
    } else {
      mainEl.classList.remove("fullscreen");
    }
    // Trigger resize to update canvas
    if (p5Instance) {
      p5Instance.windowResized?.();
    }
  }
}

// Handle Escape key to exit fullscreen
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && currentDisplayMode === "fullscreen") {
    toggleFullscreen();
  }
});

// Toggle fullscreen mode
async function toggleFullscreen() {
  const newMode = currentDisplayMode === "fullscreen" ? "inline" : "fullscreen";
  try {
    const result = await app.requestDisplayMode({ mode: newMode });
    currentDisplayMode = result.mode as "inline" | "fullscreen";
    if (currentDisplayMode === "fullscreen") {
      mainEl.classList.add("fullscreen");
    } else {
      mainEl.classList.remove("fullscreen");
    }
    // Trigger resize to update canvas
    if (p5Instance) {
      p5Instance.windowResized?.();
    }
  } catch (err) {
    log.error("Failed to change display mode:", err);
  }
}

fullscreenBtn.addEventListener("click", toggleFullscreen);

/**
 * Creates a p5.js sketch from user code.
 * Wraps the code in a function that returns a p5 instance mode sketch.
 */
function createSketch(sketchCode: string): (p: p5) => void {
  return (p: p5) => {
    // Create a sandboxed environment with p5 functions available
    const sketchFn = new Function(
      "p",
      `
      // Expose p5 instance methods and properties
      const {
        // Structure
        setup, draw, preload, remove,
        // Environment
        frameCount, deltaTime, focused, cursor, frameRate, noCursor,
        displayWidth, displayHeight, windowWidth, windowHeight, width, height,
        fullscreen, pixelDensity, displayDensity, getURL, getURLPath, getURLParams,
        // Color
        background, clear, colorMode, fill, noFill, noStroke, stroke,
        alpha, blue, brightness, color, green, hue, lerpColor, lightness, red, saturation,
        // Shape
        arc, ellipse, circle, line, point, quad, rect, square, triangle,
        ellipseMode, rectMode, strokeCap, strokeJoin, strokeWeight,
        // Curves
        bezier, bezierDetail, bezierPoint, bezierTangent,
        curve, curveDetail, curveTightness, curvePoint, curveTangent,
        // Vertex
        beginContour, beginShape, bezierVertex, curveVertex, endContour, endShape,
        quadraticVertex, vertex,
        // 3D
        plane, box, sphere, cylinder, cone, ellipsoid, torus,
        orbitControl, debugMode, noDebugMode,
        // Lights Camera
        ambientLight, directionalLight, pointLight, lights, lightFalloff,
        spotLight, noLights,
        camera, perspective, ortho, frustum, createCamera, setCamera,
        // Transform
        applyMatrix, resetMatrix, rotate, rotateX, rotateY, rotateZ,
        scale, shearX, shearY, translate,
        // Text
        textAlign, textLeading, textSize, textStyle, textWidth, textAscent, textDescent, textWrap,
        loadFont, text, textFont,
        // Image
        createImage, saveCanvas, saveFrames,
        image, imageMode, tint, noTint, loadImage,
        // Pixels
        blend, copy, filter, get, loadPixels, set, updatePixels, pixels,
        // Math
        abs, ceil, constrain, dist, exp, floor, lerp, log, mag, map, max, min,
        norm, pow, round, sq, sqrt, fract,
        createVector, Vector: p.constructor.Vector,
        noise, noiseDetail, noiseSeed,
        randomSeed, random, randomGaussian,
        acos, asin, atan, atan2, cos, sin, tan, degrees, radians, angleMode,
        // Typography
        HALF_PI, PI, QUARTER_PI, TAU, TWO_PI,
        // Constants
        ARROW, CROSS, HAND, MOVE, TEXT, WAIT,
        LEFT, RIGHT, TOP, BOTTOM, CENTER, BASELINE,
        RADIUS, CORNER, CORNERS,
        POINTS, LINES, TRIANGLES, TRIANGLE_FAN, TRIANGLE_STRIP, QUADS, QUAD_STRIP,
        CLOSE, OPEN,
        CHORD, PIE,
        SQUARE, ROUND, PROJECT, MITER, BEVEL,
        RGB, HSB, HSL,
        BLEND, ADD, DARKEST, LIGHTEST, DIFFERENCE, EXCLUSION, MULTIPLY, SCREEN,
        REPLACE, OVERLAY, HARD_LIGHT, SOFT_LIGHT, DODGE, BURN,
        WEBGL, P2D,
        // Input
        mouseX, mouseY, pmouseX, pmouseY, winMouseX, winMouseY, pwinMouseX, pwinMouseY,
        mouseButton, mouseIsPressed,
        movedX, movedY,
        key, keyCode, keyIsPressed,
        touches,
        LEFT_ARROW, RIGHT_ARROW, UP_ARROW, DOWN_ARROW, SHIFT, CONTROL, OPTION, ALT, RETURN, ENTER, ESCAPE, BACKSPACE, DELETE, TAB,
        // Events (these get called if defined)
        mousePressed, mouseReleased, mouseClicked, mouseMoved, mouseDragged, mouseWheel,
        keyPressed, keyReleased, keyTyped,
        touchStarted, touchMoved, touchEnded,
        deviceMoved, deviceTurned, deviceShaken,
        windowResized,
        // Time
        millis, day, hour, minute, month, second, year,
        // Data
        createStringDict, createNumberDict,
        append, arrayCopy, concat, reverse, shorten, shuffle, sort, splice, subset,
        float, int, str, boolean, byte, char, unchar, hex, unhex,
        join, match, matchAll, nf, nfc, nfp, nfs, split, splitTokens, trim,
        // Structure
        push, pop,
        loop, noLoop, isLooping,
        redraw,
        // Rendering
        createCanvas, resizeCanvas,
        createGraphics, blendMode,
        // DOM
        select, selectAll, removeElements,
        createDiv, createP, createSpan, createImg, createA, createSlider, createButton,
        createCheckbox, createSelect, createRadio, createColorPicker, createInput, createFileInput,
        createVideo, createAudio, createCapture, createElement
      } = p;

      // Make these getters work properly
      Object.defineProperties(this, {
        mouseX: { get: () => p.mouseX },
        mouseY: { get: () => p.mouseY },
        pmouseX: { get: () => p.pmouseX },
        pmouseY: { get: () => p.pmouseY },
        winMouseX: { get: () => p.winMouseX },
        winMouseY: { get: () => p.winMouseY },
        pwinMouseX: { get: () => p.pwinMouseX },
        pwinMouseY: { get: () => p.pwinMouseY },
        mouseButton: { get: () => p.mouseButton },
        mouseIsPressed: { get: () => p.mouseIsPressed },
        movedX: { get: () => p.movedX },
        movedY: { get: () => p.movedY },
        key: { get: () => p.key },
        keyCode: { get: () => p.keyCode },
        keyIsPressed: { get: () => p.keyIsPressed },
        touches: { get: () => p.touches },
        frameCount: { get: () => p.frameCount },
        deltaTime: { get: () => p.deltaTime },
        focused: { get: () => p.focused },
        displayWidth: { get: () => p.displayWidth },
        displayHeight: { get: () => p.displayHeight },
        windowWidth: { get: () => p.windowWidth },
        windowHeight: { get: () => p.windowHeight },
        width: { get: () => p.width },
        height: { get: () => p.height },
        pixels: { get: () => p.pixels }
      });

      // User's sketch code
      ${sketchCode}

      // Return functions that were defined
      return {
        preload: typeof preload === 'function' ? preload : undefined,
        setup: typeof setup === 'function' ? setup : undefined,
        draw: typeof draw === 'function' ? draw : undefined,
        mousePressed: typeof mousePressed === 'function' ? mousePressed : undefined,
        mouseReleased: typeof mouseReleased === 'function' ? mouseReleased : undefined,
        mouseClicked: typeof mouseClicked === 'function' ? mouseClicked : undefined,
        mouseMoved: typeof mouseMoved === 'function' ? mouseMoved : undefined,
        mouseDragged: typeof mouseDragged === 'function' ? mouseDragged : undefined,
        mouseWheel: typeof mouseWheel === 'function' ? mouseWheel : undefined,
        keyPressed: typeof keyPressed === 'function' ? keyPressed : undefined,
        keyReleased: typeof keyReleased === 'function' ? keyReleased : undefined,
        keyTyped: typeof keyTyped === 'function' ? keyTyped : undefined,
        touchStarted: typeof touchStarted === 'function' ? touchStarted : undefined,
        touchMoved: typeof touchMoved === 'function' ? touchMoved : undefined,
        touchEnded: typeof touchEnded === 'function' ? touchEnded : undefined,
        windowResized: typeof windowResized === 'function' ? windowResized : undefined
      };
    `,
    );

    try {
      const fns = sketchFn.call({}, p);

      // Bind the p5 functions from user code
      if (fns.preload) p.preload = fns.preload.bind(p);
      if (fns.setup) p.setup = fns.setup.bind(p);
      if (fns.draw) {
        const userDraw = fns.draw.bind(p);
        p.draw = () => {
          if (isVisible) {
            userDraw();
          }
        };
      }
      if (fns.mousePressed) p.mousePressed = fns.mousePressed.bind(p);
      if (fns.mouseReleased) p.mouseReleased = fns.mouseReleased.bind(p);
      if (fns.mouseClicked) p.mouseClicked = fns.mouseClicked.bind(p);
      if (fns.mouseMoved) p.mouseMoved = fns.mouseMoved.bind(p);
      if (fns.mouseDragged) p.mouseDragged = fns.mouseDragged.bind(p);
      if (fns.mouseWheel) p.mouseWheel = fns.mouseWheel.bind(p);
      if (fns.keyPressed) p.keyPressed = fns.keyPressed.bind(p);
      if (fns.keyReleased) p.keyReleased = fns.keyReleased.bind(p);
      if (fns.keyTyped) p.keyTyped = fns.keyTyped.bind(p);
      if (fns.touchStarted) p.touchStarted = fns.touchStarted.bind(p);
      if (fns.touchMoved) p.touchMoved = fns.touchMoved.bind(p);
      if (fns.touchEnded) p.touchEnded = fns.touchEnded.bind(p);
      if (fns.windowResized) p.windowResized = fns.windowResized.bind(p);
    } catch (err) {
      log.error("Error creating sketch:", err);
      // Show error on canvas
      p.setup = () => {
        p.createCanvas(400, 200);
        p.background(40);
        p.fill(255, 100, 100);
        p.textSize(14);
        p.textAlign(p.CENTER, p.CENTER);
        p.text(`Error: ${err instanceof Error ? err.message : String(err)}`, p.width / 2, p.height / 2);
      };
    }
  };
}

// Create app instance
const app = new App({ name: "p5.js Renderer", version: "1.0.0" });

app.onteardown = async () => {
  log.info("App is being torn down");
  if (p5Instance) {
    p5Instance.remove();
    p5Instance = null;
  }
  return {};
};

app.ontoolinputpartial = (params) => {
  // Show code preview, hide sketch
  codePreview.classList.add("visible");
  sketchContainer.classList.add("hidden");
  const code = params.arguments?.sketch;
  codePreview.textContent = typeof code === "string" ? code : "";
  codePreview.scrollTop = codePreview.scrollHeight;
};

app.ontoolinput = (params) => {
  log.info("Received sketch input");

  // Hide code preview, show sketch container
  codePreview.classList.remove("visible");
  sketchContainer.classList.remove("hidden");

  if (!isSketchInput(params.arguments)) {
    log.error("Invalid tool input");
    return;
  }

  const { sketch } = params.arguments;

  // Remove previous p5 instance if exists
  if (p5Instance) {
    p5Instance.remove();
    p5Instance = null;
  }

  // Clear the container
  sketchContainer.innerHTML = "";

  // Create new p5 instance
  try {
    p5Instance = new p5(createSketch(sketch), sketchContainer);
    log.info("Sketch created successfully");
  } catch (err) {
    log.error("Failed to create sketch:", err);
  }
};

app.onerror = log.error;

app.onhostcontextchanged = handleHostContextChanged;

// Pause/resume sketch based on visibility
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    isVisible = entry.isIntersecting;
    if (p5Instance) {
      if (isVisible) {
        p5Instance.loop();
      } else {
        p5Instance.noLoop();
      }
    }
  });
});
observer.observe(mainEl);

// Connect to host
app.connect().then(() => {
  log.info("Connected to host");
  const ctx = app.getHostContext();
  if (ctx) {
    handleHostContextChanged(ctx);
  }
});
