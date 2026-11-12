// 调试：只解析不转发，打印 handler 会构造出的目标 URL
"use strict";
const cases = [
  "/api/proxy?__path=openai/v1/chat/completions",
  "/api/proxy?__path=admin/secret",
  "/api/proxy",
];
for (const raw of cases) {
  const url = new URL(raw, "http://placeholder.local");
  const sub = String(
    url.searchParams.get("__path") || url.searchParams.get("path") || ""
  ).replace(/^\/+/, "");
  console.log(JSON.stringify({ raw, got___path: url.searchParams.get("__path"), sub, pass: sub.startsWith("openai/v1/") }));
}
