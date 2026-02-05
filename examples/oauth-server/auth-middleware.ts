/**
 * Auth Middleware for MCP demo
 *
 * DEMO ONLY - NOT FOR PRODUCTION
 *
 * Bearer auth middleware that validates tokens via the auth server.
 */

import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "./auth-server.js";

export interface RequireBearerAuthOptions {
  resourceMetadataUrl?: URL;
}

/**
 * Express middleware that requires a valid Bearer token.
 * Sets `req.app.locals.auth` on success.
 */
export function requireBearerAuth(
  options: RequireBearerAuthOptions = {},
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const { resourceMetadataUrl } = options;

  const buildWwwAuthHeader = (
    errorCode: string,
    message: string,
  ): string => {
    let header = `Bearer error="${errorCode}", error_description="${message}"`;
    if (resourceMetadataUrl) {
      header += `, resource_metadata="${resourceMetadataUrl.toString()}"`;
    }
    return header;
  };

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.set(
        "WWW-Authenticate",
        buildWwwAuthHeader("invalid_token", "Missing Authorization header"),
      );
      res.status(401).json({
        error: "invalid_token",
        error_description: "Missing Authorization header",
      });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const authInfo = await verifyAccessToken(token);
      req.app.locals.auth = authInfo;
      next();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid token";
      res.set(
        "WWW-Authenticate",
        buildWwwAuthHeader("invalid_token", message),
      );
      res.status(401).json({
        error: "invalid_token",
        error_description: message,
      });
    }
  };
}

export function getOAuthProtectedResourceMetadataUrl(serverUrl: URL): URL {
  const metadataUrl = new URL(serverUrl);
  metadataUrl.pathname = `/.well-known/oauth-protected-resource${serverUrl.pathname}`;
  return metadataUrl;
}
