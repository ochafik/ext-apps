import {
  type McpUiToolInputNotification,
  type McpUiToolResultNotification,
  type McpUiInitializedNotification,
  type McpUiInitializeRequest,
  type McpUiMessageRequest,
  type McpUiMessageResult,
  type McpUiOpenLinkRequest,
  type McpUiOpenLinkResult,
  App,
  LATEST_PROTOCOL_VERSION,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps";
import {
  type CallToolRequest,
  type CallToolResult,
  CallToolResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  API,
  CallToolResponse,
  DeviceType,
  DisplayMode,
  OpenAiGlobals,
  SafeArea,
  SafeAreaInsets,
  Theme,
  UserAgent,
} from "./openai-types.js";

type WidgetState = Record<string, unknown>;
window.openai = (() => {
  const app = new App(
    {
      name: "OpenAI Apps SDK Client Compatibility Shim",
      version: "1.0.0",
    },
    {},
    { autoResize: true },
  );

  let callToolInput: CallToolRequest["params"]["arguments"] | undefined;
  let callToolResult: CallToolResult | undefined;

  app.ontoolinput = async (params) => {
    callToolInput = params.arguments;
  };
  app.ontoolresult = async (params) => {
    callToolResult = params;
  };

  const init = app.connect(
    new PostMessageTransport(window.parent, window.parent),
  );

  return <
    API &
      OpenAiGlobals<
        CallToolRequest["params"]["arguments"],
        CallToolResult["structuredContent"],
        CallToolResult["_meta"],
        object
      >
  >{
    async callTool(name: string, args: Record<string, unknown>) {
      await init;
      const result = await app.request(
        <CallToolRequest>{
          method: "tools/call",
          params: { name, arguments: args },
        },
        CallToolResultSchema,
      );
      return result;
    },
    async sendFollowUpMessage(args: { prompt: string }) {
      await init;
      await app.sendMessage({
        role: "user",
        content: [
          {
            type: "text",
            text: args.prompt,
          },
        ],
      });
    },

    async openExternal(payload: { href: string }) {
      await init;
      // Note: unlinke mcp-views, window.openai doesn't provide a way to know if we failed.
      await app.sendOpenLink({
        url: payload.href,
      });
    },
    async requestDisplayMode(args: { mode: DisplayMode }) {
      return {
        mode: "inline",
      };
    },

    theme: "light" as Theme,

    get userAgent() {
      if (typeof window === "undefined" || typeof navigator === "undefined") {
        return {
          device: { type: "unknown" },
          capabilities: { hover: false, touch: false },
        };
      }

      const ua = navigator.userAgent.toLowerCase();

      // Detect device type using existing patterns from browser.ts
      const isMobileDevice = /(iphone|ipad|ipod|android|mobile|webos)/i.test(
        ua,
      );
      const isTabletDevice = /(ipad|android(?!.*mobile))/i.test(ua);

      let deviceType: DeviceType;
      if (isTabletDevice) {
        deviceType = "tablet";
      } else if (isMobileDevice) {
        deviceType = "mobile";
      } else if (
        ua.includes("mac") ||
        ua.includes("win") ||
        ua.includes("linux")
      ) {
        deviceType = "desktop";
      } else {
        deviceType = "unknown";
      }

      // Hover: true for desktop/laptop with mouse (not touch-only devices)
      const hasHover =
        !isMobileDevice && window.matchMedia("(hover: hover)").matches;

      // Touch: check if touch events are supported
      const hasTouch =
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        (navigator as any).msMaxTouchPoints > 0;

      return <UserAgent>{
        device: { type: deviceType },
        capabilities: {
          hover: hasHover,
          touch: hasTouch,
        },
      };
    },

    get locale() {
      return (
        (typeof navigator !== "undefined" ? navigator.language : undefined) ??
        "en-US"
      );
    },

    // layout
    maxHeight: -1 as number,
    displayMode: "inline" as DisplayMode,
    safeArea: <SafeArea>{
      insets: <SafeAreaInsets>{
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
    },

    get toolInput() {
      return callToolInput;
    },
    get toolOutput() {
      return callToolResult?.structuredContent;
    },
    get toolResponseMetadata() {
      return callToolResult?._meta;
    },
    get widgetState() {
      const value = localStorage.getItem("widgetState");
      return value !== null ? (JSON.parse(value) as WidgetState) : null;
    },
    async setWidgetState(state: WidgetState) {
      localStorage.setItem("widgetState", JSON.stringify(state));
    },
  };
})() as any;
