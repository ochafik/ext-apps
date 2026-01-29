import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import "./global.css";
import "./mcp-app.css";

const messageEl = document.getElementById("message")!;
const callBtn = document.getElementById("call-btn")!;

function handleHostContextChanged(ctx: McpUiHostContext) {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

const app = new App({ name: "MCP App", version: "1.0.0" });

app.ontoolresult = (result) => {
  const text = result.content?.find((c) => c.type === "text");
  messageEl.textContent = text && "text" in text ? text.text : "[no result]";
};

app.onhostcontextchanged = handleHostContextChanged;

callBtn.addEventListener("click", async () => {
  const result = await app.callServerTool({
    name: "hello",
    arguments: {},
  });
  const text = result.content?.find((c) => c.type === "text");
  messageEl.textContent = text && "text" in text ? text.text : "[no result]";
});

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) handleHostContextChanged(ctx);
});
