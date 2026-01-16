/**
 * E2E tests for OpenAI transport integration.
 *
 * These tests verify that the App class correctly auto-detects the OpenAI
 * environment and uses OpenAITransport when window.openai is present.
 */
import { test, expect, type Page } from "@playwright/test";

/**
 * Mock window.openai object that simulates the ChatGPT environment.
 * This is injected into the page before the app loads.
 */
interface MockOpenAI {
  theme: "light" | "dark";
  locale: string;
  displayMode: "inline" | "pip" | "fullscreen";
  maxHeight: number;
  safeArea: { top: number; right: number; bottom: number; left: number };
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  toolResponseMetadata?: Record<string, unknown>;
  widgetState?: unknown;
  // Track method calls for assertions
  _calls: {
    callTool: Array<{ name: string; args?: Record<string, unknown> }>;
    sendFollowUpMessage: Array<{ prompt: string }>;
    openExternal: Array<{ href: string }>;
    notifyIntrinsicHeight: number[];
    requestDisplayMode: Array<{ mode: string }>;
    setWidgetState: unknown[];
  };
  callTool: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ content: unknown }>;
  sendFollowUpMessage: (options: { prompt: string }) => Promise<void>;
  openExternal: (options: { href: string }) => Promise<void>;
  notifyIntrinsicHeight: (height: number) => void;
  requestDisplayMode: (options: { mode: string }) => Promise<void>;
  setWidgetState: (state: unknown) => void;
}

/**
 * Create a mock window.openai object for testing.
 */
function createMockOpenAI(overrides: Partial<MockOpenAI> = {}): string {
  // This function is serialized and executed in the browser context
  return `
    window.openai = {
      theme: "${overrides.theme ?? "dark"}",
      locale: "${overrides.locale ?? "en-US"}",
      displayMode: "${overrides.displayMode ?? "inline"}",
      maxHeight: ${overrides.maxHeight ?? 600},
      safeArea: ${JSON.stringify(overrides.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 })},
      toolInput: ${JSON.stringify(overrides.toolInput ?? { testArg: "testValue" })},
      toolOutput: ${JSON.stringify(overrides.toolOutput ?? { result: "success" })},
      toolResponseMetadata: ${JSON.stringify(overrides.toolResponseMetadata ?? { widgetId: "test-123" })},
      widgetState: ${JSON.stringify(overrides.widgetState ?? null)},

      // Track method calls
      _calls: {
        callTool: [],
        sendFollowUpMessage: [],
        openExternal: [],
        notifyIntrinsicHeight: [],
        requestDisplayMode: [],
        setWidgetState: [],
      },

      callTool: function(name, args) {
        this._calls.callTool.push({ name, args });
        return Promise.resolve({ content: [{ type: "text", text: "Tool result for " + name }] });
      },

      sendFollowUpMessage: function(options) {
        this._calls.sendFollowUpMessage.push(options);
        return Promise.resolve();
      },

      openExternal: function(options) {
        this._calls.openExternal.push(options);
        return Promise.resolve();
      },

      notifyIntrinsicHeight: function(height) {
        this._calls.notifyIntrinsicHeight.push(height);
      },

      requestDisplayMode: function(options) {
        this._calls.requestDisplayMode.push(options);
        return Promise.resolve();
      },

      setWidgetState: function(state) {
        this._calls.setWidgetState.push(state);
        this.widgetState = state;
      },
    };

    // Expose a way to check if OpenAI transport is used
    window.__openaiTransportUsed = false;
    window.__mcpAppReady = false;
    window.__toolInput = null;
    window.__toolResult = null;
    window.__hostContext = null;
  `;
}

/**
 * Create a test page that uses the MCP App SDK with OpenAI transport.
 */
async function setupOpenAITestPage(
  page: Page,
  mockConfig: Partial<MockOpenAI> = {},
): Promise<void> {
  // Inject the mock before any scripts run
  await page.addInitScript(createMockOpenAI(mockConfig));

  // Add a script to capture App events for testing
  await page.addInitScript(`
    // Override console.log to capture transport detection
    const originalLog = console.log;
    console.log = function(...args) {
      if (args[0] === '[MCP App Log]') {
        // Capture MCP logs
      }
      originalLog.apply(console, args);
    };
  `);
}

test.describe("OpenAI Transport E2E", () => {
  test("App auto-detects OpenAI environment and uses OpenAITransport", async ({
    page,
  }) => {
    await setupOpenAITestPage(page);

    // Navigate to a test page that uses the App SDK
    // We'll use the basic-server-vanillajs example's app HTML directly
    // but we need to serve it without the host wrapper

    // For this test, we create a minimal test page inline
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <script type="module">
          import { App, isOpenAIEnvironment } from '/dist/index.js';

          window.__isOpenAI = isOpenAIEnvironment();

          const app = new App(
            { name: "TestApp", version: "1.0.0" },
            {}
          );

          app.ontoolinput = (args) => {
            window.__toolInput = args;
          };

          app.ontoolresult = (result) => {
            window.__toolResult = result;
          };

          app.connect().then(() => {
            window.__mcpAppReady = true;
            window.__hostContext = app.getHostContext();
            // Check if we're using OpenAI transport by seeing if hostInfo is ChatGPT
            window.__hostInfo = app.getHostInfo();
          }).catch(err => {
            window.__mcpAppError = err.message;
          });
        </script>
      </head>
      <body>
        <div id="app">OpenAI Transport Test</div>
      </body>
      </html>
    `);

    // Wait for the app to be ready
    await page.waitForFunction(() => window.__mcpAppReady === true, {
      timeout: 5000,
    });

    // Verify OpenAI environment was detected
    const isOpenAI = await page.evaluate(() => window.__isOpenAI);
    expect(isOpenAI).toBe(true);

    // Verify host info indicates ChatGPT
    const hostInfo = await page.evaluate(() => window.__hostInfo);
    expect(hostInfo).toMatchObject({
      name: "ChatGPT",
      version: "1.0.0",
    });

    // Verify host context was extracted from window.openai
    const hostContext = await page.evaluate(() => window.__hostContext);
    expect(hostContext).toMatchObject({
      theme: "dark",
      locale: "en-US",
      displayMode: "inline",
    });

    // Verify tool input was delivered
    const toolInput = await page.evaluate(() => window.__toolInput);
    expect(toolInput).toEqual({ testArg: "testValue" });

    // Verify tool result was delivered
    const toolResult = await page.evaluate(() => window.__toolResult) as { content?: unknown } | null;
    expect(toolResult).toBeDefined();
    expect(toolResult?.content).toBeDefined();
  });

  test("App falls back to PostMessageTransport when window.openai is absent", async ({
    page,
  }) => {
    // Don't inject window.openai mock
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <script type="module">
          import { App, isOpenAIEnvironment } from '/dist/index.js';

          window.__isOpenAI = isOpenAIEnvironment();
          window.__mcpAppReady = false;

          // In non-OpenAI mode without a host, connect will fail
          // but we can still verify detection
        </script>
      </head>
      <body>
        <div id="app">PostMessage Transport Test</div>
      </body>
      </html>
    `);

    // Wait for detection to complete
    await page.waitForFunction(() => window.__isOpenAI !== undefined);

    // Verify OpenAI environment was NOT detected
    const isOpenAI = await page.evaluate(() => window.__isOpenAI);
    expect(isOpenAI).toBe(false);
  });

  test("callServerTool delegates to window.openai.callTool", async ({
    page,
  }) => {
    await setupOpenAITestPage(page);

    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <script type="module">
          import { App } from '/dist/index.js';

          const app = new App(
            { name: "TestApp", version: "1.0.0" },
            {}
          );

          app.connect().then(async () => {
            window.__mcpAppReady = true;

            // Call a server tool
            try {
              const result = await app.callServerTool("test_tool", { arg1: "value1" });
              window.__callToolResult = result;
            } catch (e) {
              window.__callToolError = e.message;
            }
          });
        </script>
      </head>
      <body>Test</body>
      </html>
    `);

    await page.waitForFunction(() => window.__mcpAppReady === true);
    await page.waitForFunction(
      () => window.__callToolResult !== undefined || window.__callToolError !== undefined,
      { timeout: 5000 },
    );

    // Verify the tool call was made
    const calls = await page.evaluate(() => window.openai._calls.callTool);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ name: "test_tool", args: { arg1: "value1" } });

    // Verify we got a result
    const result = await page.evaluate(() => window.__callToolResult);
    expect(result).toBeDefined();
  });

  test("sendMessage delegates to window.openai.sendFollowUpMessage", async ({
    page,
  }) => {
    await setupOpenAITestPage(page);

    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <script type="module">
          import { App } from '/dist/index.js';

          const app = new App(
            { name: "TestApp", version: "1.0.0" },
            {}
          );

          app.connect().then(async () => {
            window.__mcpAppReady = true;

            try {
              await app.sendMessage("Hello from test!");
              window.__messageSent = true;
            } catch (e) {
              window.__messageError = e.message;
            }
          });
        </script>
      </head>
      <body>Test</body>
      </html>
    `);

    await page.waitForFunction(() => window.__mcpAppReady === true);
    await page.waitForFunction(
      () => window.__messageSent === true || window.__messageError !== undefined,
      { timeout: 5000 },
    );

    // Verify the message was sent
    const calls = await page.evaluate(
      () => window.openai._calls.sendFollowUpMessage,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ prompt: "Hello from test!" });
  });

  test("openLink delegates to window.openai.openExternal", async ({ page }) => {
    await setupOpenAITestPage(page);

    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <script type="module">
          import { App } from '/dist/index.js';

          const app = new App(
            { name: "TestApp", version: "1.0.0" },
            {}
          );

          app.connect().then(async () => {
            window.__mcpAppReady = true;

            try {
              await app.openLink("https://example.com");
              window.__linkOpened = true;
            } catch (e) {
              window.__linkError = e.message;
            }
          });
        </script>
      </head>
      <body>Test</body>
      </html>
    `);

    await page.waitForFunction(() => window.__mcpAppReady === true);
    await page.waitForFunction(
      () => window.__linkOpened === true || window.__linkError !== undefined,
      { timeout: 5000 },
    );

    // Verify the link was opened
    const calls = await page.evaluate(() => window.openai._calls.openExternal);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ href: "https://example.com" });
  });

  test("sendSizeChanged delegates to window.openai.notifyIntrinsicHeight", async ({
    page,
  }) => {
    await setupOpenAITestPage(page);

    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <script type="module">
          import { App } from '/dist/index.js';

          const app = new App(
            { name: "TestApp", version: "1.0.0" },
            { autoResize: false } // Disable auto-resize to control manually
          );

          app.connect().then(async () => {
            window.__mcpAppReady = true;

            // Manually report size
            app.sendSizeChanged({ width: 400, height: 300 });
            window.__sizeSent = true;
          });
        </script>
      </head>
      <body>Test</body>
      </html>
    `);

    await page.waitForFunction(() => window.__mcpAppReady === true);
    await page.waitForFunction(() => window.__sizeSent === true, {
      timeout: 5000,
    });

    // Verify the height was reported (width is ignored in OpenAI mode)
    const calls = await page.evaluate(
      () => window.openai._calls.notifyIntrinsicHeight,
    );
    expect(calls).toContain(300);
  });

  test("experimentalOAICompatibility=false forces PostMessageTransport", async ({
    page,
  }) => {
    await setupOpenAITestPage(page);

    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <script type="module">
          import { App, isOpenAIEnvironment } from '/dist/index.js';

          window.__isOpenAI = isOpenAIEnvironment();

          const app = new App(
            { name: "TestApp", version: "1.0.0" },
            {},
            { experimentalOAICompatibility: false }
          );

          // Try to connect - will fail because there's no parent frame
          // but we can detect which transport it tried to use
          app.connect().then(() => {
            window.__mcpAppReady = true;
            window.__hostInfo = app.getHostInfo();
          }).catch(err => {
            window.__connectError = err.message;
            // Even if connect fails, the transport was selected
          });
        </script>
      </head>
      <body>Test</body>
      </html>
    `);

    // Wait for either success or error
    await page.waitForFunction(
      () => window.__mcpAppReady === true || window.__connectError !== undefined,
      { timeout: 5000 },
    );

    // Even though window.openai exists, it should NOT be ChatGPT host
    // because we disabled OAI compatibility
    const isOpenAI = await page.evaluate(() => window.__isOpenAI);
    expect(isOpenAI).toBe(true); // Detection still works

    // The host info should NOT be ChatGPT (or connection failed due to no host)
    const hostInfo = await page.evaluate(() => window.__hostInfo) as { name?: string } | null;
    const error = await page.evaluate(() => window.__connectError);

    // Either we didn't connect (no host), or host is not ChatGPT
    if (hostInfo) {
      expect(hostInfo.name).not.toBe("ChatGPT");
    } else {
      // Connection failed because PostMessageTransport has no parent frame
      expect(error).toBeDefined();
    }
  });

  test("handles null toolOutput gracefully", async ({ page }) => {
    await setupOpenAITestPage(page, {
      toolInput: { test: true },
      toolOutput: null as unknown as undefined, // Simulate null from JSON
    });

    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <script type="module">
          import { App } from '/dist/index.js';

          const app = new App(
            { name: "TestApp", version: "1.0.0" },
            {}
          );

          app.ontoolinput = (args) => {
            window.__toolInput = args;
          };

          app.ontoolresult = (result) => {
            window.__toolResult = result;
          };

          app.connect().then(() => {
            window.__mcpAppReady = true;
          });
        </script>
      </head>
      <body>Test</body>
      </html>
    `);

    await page.waitForFunction(() => window.__mcpAppReady === true, {
      timeout: 5000,
    });

    // Tool input should be delivered
    const toolInput = await page.evaluate(() => window.__toolInput);
    expect(toolInput).toEqual({ test: true });

    // Tool result should NOT be delivered (null means no output)
    const toolResult = await page.evaluate(() => window.__toolResult);
    expect(toolResult).toBeNull();
  });
});

// TypeScript declarations for test globals
declare global {
  interface Window {
    openai: MockOpenAI;
    __isOpenAI: boolean;
    __mcpAppReady: boolean;
    __mcpAppError?: string;
    __toolInput: unknown;
    __toolResult: unknown;
    __hostContext: unknown;
    __hostInfo: unknown;
    __callToolResult: unknown;
    __callToolError?: string;
    __messageSent: boolean;
    __messageError?: string;
    __linkOpened: boolean;
    __linkError?: string;
    __sizeSent: boolean;
    __connectError?: string;
  }
}
