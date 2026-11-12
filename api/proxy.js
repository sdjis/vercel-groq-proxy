// Vercel Serverless 反向代理：只把请求转发到 Groq 官方 API。
// 客户端地址形如： https://<project>.vercel.app/api/openai/v1/chat/completions
// vercel.json 会把它改写成 /api/proxy?__path=openai/v1/chat/completions
"use strict";

const UPSTREAM = "https://api.groq.com";

// 只透传与上游鉴权/内容相关的头，避免把 vercel 的 x-forwarded-* 带过去
const KEEP_HEADERS = ["authorization", "content-type", "accept", "user-agent"];

function pickHeaders(headers) {
  const out = {};
  for (const name of KEEP_HEADERS) {
    if (headers[name] !== undefined) out[name] = headers[name];
  }
  return out;
}

async function readRawBody(req) {
  // Vercel 运行时可能已经把 JSON body 解析掉了，两种情况都要处理
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === "string") return req.body;
    return JSON.stringify(req.body);
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://placeholder.local");

  // 原始子路径由 rewrite 注入为 __path；同时兼容直接调用 /api/proxy?path=...
  const sub = String(
    url.searchParams.get("__path") || url.searchParams.get("path") || ""
  ).replace(/^\/+/, "");

  // 只放行 Groq 的 OpenAI 兼容路径，避免变成任意接口的开放代理
  if (!sub.startsWith("openai/v1/")) {
    res.status(404).json({
      error: "Not Found",
      hint: "只允许 /api/openai/v1/... 转发到 api.groq.com",
      received_path: sub || null,
    });
    return;
  }

  // 保留原始查询参数（去掉内部用的 __path / path）
  const extra = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (key !== "__path" && key !== "path") extra.append(key, value);
  }
  const qs = extra.toString() ? `?${extra.toString()}` : "";

  const target = `${UPSTREAM}/${sub}${qs}`;
  const method = req.method || "POST";
  const hasBody = !(method === "GET" || method === "HEAD");
  const body = hasBody ? await readRawBody(req) : undefined;

  let upstream;
  try {
    upstream = await fetch(target, {
      method,
      headers: pickHeaders(req.headers),
      body,
      redirect: "follow",
    });
  } catch (err) {
    res.status(502).json({ error: "upstream_unreachable", detail: String(err && err.message) });
    return;
  }

  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
  res.send(text);
};
