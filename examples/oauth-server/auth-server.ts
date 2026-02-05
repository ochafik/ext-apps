/**
 * OAuth Authorization Server setup for MCP demo
 *
 * DEMO ONLY - NOT FOR PRODUCTION
 *
 * Adapted from @modelcontextprotocol/examples-shared in the MCP TypeScript SDK.
 */

import { toNodeHandler } from "better-auth/node";
import {
  oAuthDiscoveryMetadata,
  oAuthProtectedResourceMetadata,
} from "better-auth/plugins";
import cors from "cors";
import type { Request, Response as ExpressResponse, Router } from "express";
import express from "express";

import type { DemoAuth } from "./auth.js";
import { createDemoAuth, DEMO_USER_CREDENTIALS } from "./auth.js";

let globalAuth: DemoAuth | null = null;
let demoUserCreated = false;

export function getAuth(): DemoAuth {
  if (!globalAuth) {
    throw new Error("Auth not initialized. Call setupAuthServer first.");
  }
  return globalAuth;
}

async function ensureDemoUserExists(auth: DemoAuth): Promise<void> {
  if (demoUserCreated) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (auth.api as any).signUpEmail({
      body: {
        email: DEMO_USER_CREDENTIALS.email,
        password: DEMO_USER_CREDENTIALS.password,
        name: DEMO_USER_CREDENTIALS.name,
      },
    });
    console.log("[Auth] Demo user created via signUpEmail");
    demoUserCreated = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("already") ||
      message.includes("exists") ||
      message.includes("unique")
    ) {
      console.log("[Auth] Demo user already exists");
      demoUserCreated = true;
    } else {
      console.error("[Auth] Failed to create demo user:", error);
      throw error;
    }
  }
}

export interface SetupAuthServerOptions {
  authServerUrl: URL;
  mcpServerUrl: URL;
}

export function setupAuthServer(options: SetupAuthServerOptions): void {
  const { authServerUrl, mcpServerUrl } = options;

  const auth = createDemoAuth({
    baseURL: authServerUrl.toString().replace(/\/$/, ""),
    resource: mcpServerUrl.toString(),
    loginPage: "/sign-in",
  });

  globalAuth = auth;

  const authApp = express();
  authApp.use(cors({ origin: "*" }));

  authApp.all("/api/auth/{*splat}", toNodeHandler(auth));

  authApp.options("/.well-known/oauth-authorization-server", cors());
  authApp.get(
    "/.well-known/oauth-authorization-server",
    cors(),
    toNodeHandler(oAuthDiscoveryMetadata(auth)),
  );

  authApp.use(express.json());
  authApp.use(express.urlencoded({ extended: true }));

  // Auto-login page: creates a demo session and redirects to OAuth authorize
  authApp.get("/sign-in", async (req: Request, res: ExpressResponse) => {
    const queryParams = new URLSearchParams(
      req.query as Record<string, string>,
    );
    const redirectUri = queryParams.get("redirect_uri");
    const clientId = queryParams.get("client_id");

    if (!redirectUri || !clientId) {
      res.status(400).send(`
        <!DOCTYPE html>
        <html><head><title>Demo Login</title></head>
        <body>
          <h1>Demo OAuth Server</h1>
          <p>Missing required OAuth parameters. This page should be accessed via OAuth flow.</p>
        </body></html>
      `);
      return;
    }

    try {
      await ensureDemoUserExists(auth);

      const signInResponse = await auth.api.signInEmail({
        body: {
          email: DEMO_USER_CREDENTIALS.email,
          password: DEMO_USER_CREDENTIALS.password,
        },
        asResponse: true,
      });

      const setCookieHeaders = signInResponse.headers.getSetCookie();
      for (const cookie of setCookieHeaders) {
        res.append("Set-Cookie", cookie);
      }

      const authorizeUrl = new URL("/api/auth/mcp/authorize", authServerUrl);
      authorizeUrl.search = queryParams.toString();

      res.redirect(authorizeUrl.toString());
    } catch (error) {
      console.error("[Auth Server] Failed to create session:", error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html><head><title>Demo Login Error</title></head>
        <body>
          <h1>Demo OAuth Server - Error</h1>
          <p>Failed to create demo session: ${error instanceof Error ? error.message : "Unknown error"}</p>
        </body></html>
      `);
    }
  });

  const authPort = Number.parseInt(authServerUrl.port, 10);
  authApp.listen(authPort, (error?: Error) => {
    if (error) {
      console.error("Failed to start auth server:", error);
      process.exit(1);
    }
    console.log(`OAuth Authorization Server listening on port ${authPort}`);
    console.log(`  Authorization: ${authServerUrl}api/auth/mcp/authorize`);
    console.log(`  Token: ${authServerUrl}api/auth/mcp/token`);
    console.log(
      `  Metadata: ${authServerUrl}.well-known/oauth-authorization-server`,
    );
  });
}

export function createProtectedResourceMetadataRouter(
  resourcePath = "/mcp",
): Router {
  const auth = getAuth();
  const router = express.Router();
  const metadataPath = `/.well-known/oauth-protected-resource${resourcePath}`;

  router.options(metadataPath, cors());
  router.get(
    metadataPath,
    cors(),
    toNodeHandler(oAuthProtectedResourceMetadata(auth)),
  );

  return router;
}

export async function verifyAccessToken(token: string): Promise<{
  token: string;
  clientId: string;
  scopes: string[];
  userId: string;
}> {
  const auth = getAuth();

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (auth.api as any).getMcpSession({ headers });

  if (!session) {
    throw new Error("Invalid token");
  }

  const scopes =
    typeof session.scopes === "string"
      ? session.scopes.split(" ")
      : ["openid"];

  return {
    token,
    clientId: session.clientId,
    scopes,
    userId: session.userId ?? "unknown",
  };
}
