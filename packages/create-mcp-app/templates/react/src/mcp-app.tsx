import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import styles from "./mcp-app.module.css";

function McpApp() {
  const [message, setMessage] = useState("Connecting...");

  const { app, error } = useApp({
    appInfo: { name: "MCP App", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = (result: CallToolResult) => {
        const text = result.content?.find((c) => c.type === "text");
        setMessage(text && "text" in text ? text.text : "[no result]");
      };
    },
  });

  const handleCall = useCallback(async () => {
    if (!app) return;
    const result = await app.callServerTool({
      name: "hello",
      arguments: {},
    });
    const text = result.content?.find((c) => c.type === "text");
    setMessage(text && "text" in text ? text.text : "[no result]");
  }, [app]);

  useEffect(() => {
    if (app) setMessage("Connected");
  }, [app]);

  if (error) return <div>Error: {error.message}</div>;

  return (
    <main className={styles.main}>
      <p>{message}</p>
      <button onClick={handleCall} disabled={!app}>
        Call Server
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <McpApp />
  </StrictMode>,
);
