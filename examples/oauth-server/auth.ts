/**
 * Better Auth configuration for MCP OAuth demo
 *
 * DEMO ONLY - NOT FOR PRODUCTION
 *
 * Uses in-memory SQLite and auto-approves all logins.
 * Adapted from @modelcontextprotocol/examples-shared in the MCP TypeScript SDK.
 */

import { randomBytes } from "node:crypto";

import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { mcp } from "better-auth/plugins";
import Database from "better-sqlite3";

// Generate a random password for the demo user (new each time the server starts)
const DEMO_PASSWORD = randomBytes(16).toString("base64url");

let _db: InstanceType<typeof Database> | null = null;

function getDatabase(): InstanceType<typeof Database> {
  if (!_db) {
    _db = new Database(":memory:");
    initializeSchema(_db);
  }
  return _db;
}

function initializeSchema(db: InstanceType<typeof Database>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      expiresAt TEXT NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      userId TEXT NOT NULL REFERENCES user(id),
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      userId TEXT NOT NULL REFERENCES user(id),
      accessToken TEXT,
      refreshToken TEXT,
      idToken TEXT,
      accessTokenExpiresAt TEXT,
      refreshTokenExpiresAt TEXT,
      scope TEXT,
      password TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS oauthApplication (
      id TEXT PRIMARY KEY,
      name TEXT,
      icon TEXT,
      metadata TEXT,
      clientId TEXT NOT NULL UNIQUE,
      clientSecret TEXT,
      redirectUrls TEXT NOT NULL,
      type TEXT NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      userId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauthAccessToken (
      id TEXT PRIMARY KEY,
      accessToken TEXT NOT NULL UNIQUE,
      refreshToken TEXT UNIQUE,
      accessTokenExpiresAt TEXT NOT NULL,
      refreshTokenExpiresAt TEXT,
      clientId TEXT NOT NULL,
      userId TEXT,
      scopes TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauthRefreshToken (
      id TEXT PRIMARY KEY,
      refreshToken TEXT NOT NULL UNIQUE,
      accessTokenId TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauthAuthorizationCode (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      clientId TEXT NOT NULL,
      userId TEXT,
      scopes TEXT NOT NULL,
      redirectURI TEXT NOT NULL,
      codeChallenge TEXT,
      codeChallengeMethod TEXT,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauthConsent (
      id TEXT PRIMARY KEY,
      clientId TEXT NOT NULL,
      userId TEXT NOT NULL,
      scopes TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      consentGiven INTEGER NOT NULL DEFAULT 0
    );
  `);

  console.log("[Auth] In-memory database schema initialized");
  console.log("[Auth] ========================================");
  console.log("[Auth] Demo user credentials (auto-login):");
  console.log(`[Auth]   Email:    ${DEMO_USER_CREDENTIALS.email}`);
  console.log(`[Auth]   Password: ${DEMO_USER_CREDENTIALS.password}`);
  console.log("[Auth] ========================================");
}

export const DEMO_USER_CREDENTIALS = {
  email: "demo@example.com",
  password: DEMO_PASSWORD,
  name: "Demo User",
};

export interface CreateDemoAuthOptions {
  baseURL: string;
  resource?: string;
  loginPage?: string;
}

export function createDemoAuth(options: CreateDemoAuthOptions) {
  const { baseURL, resource, loginPage = "/sign-in" } = options;
  const db = getDatabase();

  const mcpPlugin = mcp({
    loginPage,
    resource,
    oidcConfig: {
      loginPage,
      codeExpiresIn: 600,
      accessTokenExpiresIn: 3600,
      refreshTokenExpiresIn: 604_800,
      defaultScope: "openid",
      scopes: ["openid", "profile", "email", "offline_access"],
      allowDynamicClientRegistration: true,
      metadata: {
        scopes_supported: ["openid", "profile", "email", "offline_access"],
      },
    },
  });

  return betterAuth({
    baseURL,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    database: db as any,
    trustedOrigins: [baseURL.toString()],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [mcpPlugin],
  } satisfies BetterAuthOptions);
}

export type DemoAuth = ReturnType<typeof createDemoAuth>;
