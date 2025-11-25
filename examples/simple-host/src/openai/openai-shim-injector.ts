const openAiCompat = fetch("openai-shim.js").then((res) => res.text());

function injectScriptIntoHtml(html: string, scriptContent: string) {
  // insertion index
  let i;
  // Try to find </head>, or <body>, or else insert at start
  i = html.indexOf("<head>");
  if (i >= 0) {
    i += "<head>".length;
  } else {
    i = html.indexOf("<body>");
    if (i === -1) {
      i = 0;
    }
  }
  return (
    html.slice(0, i) +
    `<script>${scriptContent.replaceAll("</" + "script>", "<\\/script>")}</${""}script>` +
    html.slice(i)
  );
}

export async function injectOpenAiShimIntoHtml(html: string): Promise<string> {
  const shim = await openAiCompat;
  return injectScriptIntoHtml(html, shim);
}
