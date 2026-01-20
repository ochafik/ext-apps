import { describe, it, expect, mock } from "bun:test";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_URI_META_KEY,
  RESOURCE_MIME_TYPE,
  hasUiSupport,
  getUiCapability,
  EXTENSION_ID,
} from "./index";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("registerAppTool", () => {
  it("should pass through config to server.registerTool", () => {
    let capturedName: string | undefined;
    let capturedConfig: Record<string, unknown> | undefined;
    let capturedHandler: unknown;

    const mockServer = {
      registerTool: mock(
        (name: string, config: Record<string, unknown>, handler: unknown) => {
          capturedName = name;
          capturedConfig = config;
          capturedHandler = handler;
        },
      ),
      registerResource: mock(() => {}),
    };

    const handler = async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    });

    registerAppTool(
      mockServer as unknown as Pick<McpServer, "registerTool">,
      "my-tool",
      {
        title: "My Tool",
        description: "A test tool",
        _meta: {
          [RESOURCE_URI_META_KEY]: "ui://test/widget.html",
        },
      },
      handler,
    );

    expect(mockServer.registerTool).toHaveBeenCalledTimes(1);
    expect(capturedName).toBe("my-tool");
    expect(capturedConfig?.title).toBe("My Tool");
    expect(capturedConfig?.description).toBe("A test tool");
    expect(
      (capturedConfig?._meta as Record<string, unknown>)?.[
        RESOURCE_URI_META_KEY
      ],
    ).toBe("ui://test/widget.html");
    expect(capturedHandler).toBe(handler);
  });

  describe("backward compatibility", () => {
    it("should set legacy key when _meta.ui.resourceUri is provided", () => {
      let capturedConfig: Record<string, unknown> | undefined;

      const mockServer = {
        registerTool: mock(
          (
            _name: string,
            config: Record<string, unknown>,
            _handler: unknown,
          ) => {
            capturedConfig = config;
          },
        ),
      };

      registerAppTool(
        mockServer as unknown as Pick<McpServer, "registerTool">,
        "my-tool",
        {
          _meta: {
            ui: { resourceUri: "ui://test/widget.html" },
          },
        },
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      );

      const meta = capturedConfig?._meta as Record<string, unknown>;
      // New format should be preserved
      expect((meta.ui as { resourceUri: string }).resourceUri).toBe(
        "ui://test/widget.html",
      );
      // Legacy key should also be set
      expect(meta[RESOURCE_URI_META_KEY]).toBe("ui://test/widget.html");
    });

    it("should set _meta.ui.resourceUri when legacy key is provided", () => {
      let capturedConfig: Record<string, unknown> | undefined;

      const mockServer = {
        registerTool: mock(
          (
            _name: string,
            config: Record<string, unknown>,
            _handler: unknown,
          ) => {
            capturedConfig = config;
          },
        ),
      };

      registerAppTool(
        mockServer as unknown as Pick<McpServer, "registerTool">,
        "my-tool",
        {
          _meta: {
            [RESOURCE_URI_META_KEY]: "ui://test/widget.html",
          },
        },
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      );

      const meta = capturedConfig?._meta as Record<string, unknown>;
      // Legacy key should be preserved
      expect(meta[RESOURCE_URI_META_KEY]).toBe("ui://test/widget.html");
      // New format should also be set
      expect((meta.ui as { resourceUri: string }).resourceUri).toBe(
        "ui://test/widget.html",
      );
    });

    it("should preserve visibility when converting from legacy format", () => {
      let capturedConfig: Record<string, unknown> | undefined;

      const mockServer = {
        registerTool: mock(
          (
            _name: string,
            config: Record<string, unknown>,
            _handler: unknown,
          ) => {
            capturedConfig = config;
          },
        ),
      };

      registerAppTool(
        mockServer as unknown as Pick<McpServer, "registerTool">,
        "my-tool",
        {
          _meta: {
            ui: { visibility: ["app"] },
            [RESOURCE_URI_META_KEY]: "ui://test/widget.html",
          },
        } as any,
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      );

      const meta = capturedConfig?._meta as Record<string, unknown>;
      const ui = meta.ui as { resourceUri: string; visibility: string[] };
      // Should have merged resourceUri into existing ui object
      expect(ui.resourceUri).toBe("ui://test/widget.html");
      expect(ui.visibility).toEqual(["app"]);
    });

    it("should not overwrite if both formats are already set", () => {
      let capturedConfig: Record<string, unknown> | undefined;

      const mockServer = {
        registerTool: mock(
          (
            _name: string,
            config: Record<string, unknown>,
            _handler: unknown,
          ) => {
            capturedConfig = config;
          },
        ),
      };

      registerAppTool(
        mockServer as unknown as Pick<McpServer, "registerTool">,
        "my-tool",
        {
          _meta: {
            ui: { resourceUri: "ui://new/widget.html" },
            [RESOURCE_URI_META_KEY]: "ui://old/widget.html",
          },
        } as any,
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      );

      const meta = capturedConfig?._meta as Record<string, unknown>;
      // Both should remain unchanged
      expect((meta.ui as { resourceUri: string }).resourceUri).toBe(
        "ui://new/widget.html",
      );
      expect(meta[RESOURCE_URI_META_KEY]).toBe("ui://old/widget.html");
    });
  });
});

describe("registerAppResource", () => {
  it("should register a resource with default MIME type", () => {
    let capturedName: string | undefined;
    let capturedUri: string | undefined;
    let capturedConfig: Record<string, unknown> | undefined;

    const mockServer = {
      registerTool: mock(() => {}),
      registerResource: mock(
        (name: string, uri: string, config: Record<string, unknown>) => {
          capturedName = name;
          capturedUri = uri;
          capturedConfig = config;
        },
      ),
    };

    const callback = async () => ({
      contents: [
        {
          uri: "ui://test/widget.html",
          mimeType: RESOURCE_MIME_TYPE,
          text: "<html/>",
        },
      ],
    });

    registerAppResource(
      mockServer as unknown as Pick<McpServer, "registerResource">,
      "My Resource",
      "ui://test/widget.html",
      {
        description: "A test resource",
        _meta: { ui: {} },
      },
      callback,
    );

    expect(mockServer.registerResource).toHaveBeenCalledTimes(1);
    expect(capturedName).toBe("My Resource");
    expect(capturedUri).toBe("ui://test/widget.html");
    expect(capturedConfig?.mimeType).toBe(RESOURCE_MIME_TYPE);
    expect(capturedConfig?.description).toBe("A test resource");
  });

  it("should allow custom MIME type to override default", () => {
    let capturedConfig: Record<string, unknown> | undefined;

    const mockServer = {
      registerTool: mock(() => {}),
      registerResource: mock(
        (_name: string, _uri: string, config: Record<string, unknown>) => {
          capturedConfig = config;
        },
      ),
    };

    registerAppResource(
      mockServer as unknown as Pick<McpServer, "registerResource">,
      "My Resource",
      "ui://test/widget.html",
      {
        mimeType: "text/html",
        _meta: { ui: {} },
      },
      async () => ({
        contents: [
          {
            uri: "ui://test/widget.html",
            mimeType: "text/html",
            text: "<html/>",
          },
        ],
      }),
    );

    // Custom mimeType should override the default
    expect(capturedConfig?.mimeType).toBe("text/html");
  });

  it("should call the callback when handler is invoked", async () => {
    let capturedHandler: (() => Promise<unknown>) | undefined;

    const mockServer = {
      registerTool: mock(() => {}),
      registerResource: mock(
        (
          _name: string,
          _uri: string,
          _config: unknown,
          handler: () => Promise<unknown>,
        ) => {
          capturedHandler = handler;
        },
      ),
    };

    const expectedResult = {
      contents: [
        {
          uri: "ui://test/widget.html",
          mimeType: RESOURCE_MIME_TYPE,
          text: "<html>content</html>",
        },
      ],
    };
    const callback = mock(async () => expectedResult);

    registerAppResource(
      mockServer as unknown as Pick<McpServer, "registerResource">,
      "My Resource",
      "ui://test/widget.html",
      { _meta: { ui: {} } },
      callback,
    );

    expect(capturedHandler).toBeDefined();
    const result = await capturedHandler!();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expectedResult);
  });
});

describe("hasUiSupport", () => {
  const MIME_TYPE = "text/html;profile=mcp-app";

  it("should return false for null/undefined capabilities", () => {
    expect(hasUiSupport(null)).toBe(false);
    expect(hasUiSupport(undefined)).toBe(false);
  });

  it("should return false for empty capabilities", () => {
    expect(hasUiSupport({})).toBe(false);
  });

  it("should detect support in experimental field", () => {
    const caps = {
      experimental: {
        [EXTENSION_ID]: {
          mimeTypes: [MIME_TYPE],
        },
      },
    };
    expect(hasUiSupport(caps)).toBe(true);
  });

  it("should detect support in extensions field", () => {
    const caps = {
      extensions: {
        [EXTENSION_ID]: {
          mimeTypes: [MIME_TYPE],
        },
      },
    };
    expect(hasUiSupport(caps)).toBe(true);
  });

  it("should detect support when both fields are present", () => {
    const caps = {
      experimental: {
        [EXTENSION_ID]: {
          mimeTypes: [MIME_TYPE],
        },
      },
      extensions: {
        [EXTENSION_ID]: {
          mimeTypes: [MIME_TYPE],
        },
      },
    };
    expect(hasUiSupport(caps)).toBe(true);
  });

  it("should return false if MIME type is not in the list", () => {
    const caps = {
      experimental: {
        [EXTENSION_ID]: {
          mimeTypes: ["text/plain"],
        },
      },
    };
    expect(hasUiSupport(caps)).toBe(false);
  });

  it("should check for custom MIME type when specified", () => {
    const caps = {
      experimental: {
        [EXTENSION_ID]: {
          mimeTypes: ["application/x-custom"],
        },
      },
    };
    expect(hasUiSupport(caps, "application/x-custom")).toBe(true);
    expect(hasUiSupport(caps, MIME_TYPE)).toBe(false);
  });

  it("should return false when extension ID is missing", () => {
    const caps = {
      experimental: {
        "some-other-extension": {
          mimeTypes: [MIME_TYPE],
        },
      },
    };
    expect(hasUiSupport(caps)).toBe(false);
  });

  it("should return false when mimeTypes is missing", () => {
    const caps = {
      experimental: {
        [EXTENSION_ID]: {},
      },
    };
    expect(hasUiSupport(caps)).toBe(false);
  });
});

describe("getUiCapability", () => {
  const MIME_TYPE = "text/html;profile=mcp-app";

  it("should return undefined for null/undefined capabilities", () => {
    expect(getUiCapability(null)).toBeUndefined();
    expect(getUiCapability(undefined)).toBeUndefined();
  });

  it("should return undefined for empty capabilities", () => {
    expect(getUiCapability({})).toBeUndefined();
  });

  it("should return capability from experimental field", () => {
    const caps = {
      experimental: {
        [EXTENSION_ID]: {
          mimeTypes: [MIME_TYPE],
        },
      },
    };
    const result = getUiCapability(caps);
    expect(result).toEqual({ mimeTypes: [MIME_TYPE] });
  });

  it("should return capability from extensions field", () => {
    const caps = {
      extensions: {
        [EXTENSION_ID]: {
          mimeTypes: [MIME_TYPE],
        },
      },
    };
    const result = getUiCapability(caps);
    expect(result).toEqual({ mimeTypes: [MIME_TYPE] });
  });

  it("should prefer extensions over experimental when both are present", () => {
    const caps = {
      experimental: {
        [EXTENSION_ID]: {
          mimeTypes: ["text/plain"],
        },
      },
      extensions: {
        [EXTENSION_ID]: {
          mimeTypes: [MIME_TYPE],
        },
      },
    };
    const result = getUiCapability(caps);
    expect(result).toEqual({ mimeTypes: [MIME_TYPE] });
  });

  it("should return undefined when extension ID is missing", () => {
    const caps = {
      experimental: {
        "some-other-extension": {
          mimeTypes: [MIME_TYPE],
        },
      },
    };
    expect(getUiCapability(caps)).toBeUndefined();
  });
});
