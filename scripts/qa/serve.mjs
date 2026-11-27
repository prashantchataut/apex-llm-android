import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = process.argv[2]; const PORT = +process.argv[3] || 4173; const BASE = "/apex-llm-android";
const types = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".wasm":"application/wasm",".txt":"text/plain",".woff2":"font/woff2",".png":"image/png",".mjs":"text/javascript"};
http.createServer((req,res)=>{
  let u = decodeURIComponent(req.url.split("?")[0]);
  if (!u.startsWith(BASE)) { res.writeHead(302,{Location:BASE+"/"}); return res.end(); }
  let p = path.join(ROOT, u.slice(BASE.length)); if (p.endsWith("/")) p += "index.html";
  if (!fs.existsSync(p) && fs.existsSync(p+"/index.html")) p += "/index.html";
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200,{"Content-Type":types[path.extname(p)]||"application/octet-stream","Cache-Control":"no-store"}); fs.createReadStream(p).pipe(res);
}).listen(PORT,()=>console.log("serving",ROOT,PORT));
