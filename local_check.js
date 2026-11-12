// 本地校验：用 Node 原生 http 模拟 Vercel Node 运行时的 req/res 约定，
// 直接挂载 api/proxy.js，验证路径解析、404 拦截、body 透传是否正常。
// 用法：node local_check.js   然后另开终端 curl 或跑 test_groq.py 指向 127.0.0.1
"use strict";

const http = require("http");
const handler = require("./api/proxy.js");

const PORT = Number(process.env.PORT || process.argv[2] || 8799);

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);

  // Vercel 运行时提供的 helper，这里补上
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(obj));
  };
  res.send = (text) => res.end(text);

  // Vercel 会先把 JSON body 解析好挂到 req.body；这里模拟这一行为
  if (raw.length) {
    try {
      req.body = JSON.parse(raw.toString("utf8"));
    } catch {
      req.body = raw.toString("utf8");
    }
  }

  try {
    await handler(req, res);
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ local_harness_error: String(err && err.message) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`local harness ready: http://127.0.0.1:${PORT}`);
});
