// 固定 IP 的 HTTPS CONNECT 代理。
//
// 用途：某些网络下 github.com 的 DNS 会被解析到已被阻断的 IP（例如 20.205.243.166），
// 于是 `git push` 一直 "Could not connect to server"，而 GitHub 的美国 IP 其实是通的。
// 这个代理把 github.com:443 的 CONNECT 请求强行转到可用的 IP 上，
// TLS 仍是端到端（SNI 依然是 github.com），证书校验不受影响。
//
//   node _transfer/pin-proxy.mjs                       # 默认监听 127.0.0.1:9443
//   git -c http.proxy=http://127.0.0.1:9443 push origin main
import http from "node:http";
import net from "node:net";

const PORT = Number(process.env.PROXY_PORT || 9443);

// 按顺序尝试，第一个连上的就用
const PINS = {
  "github.com:443": ["140.82.113.3", "140.82.112.3", "140.82.114.3", "140.82.116.3"],
  "api.github.com:443": ["140.82.113.6", "140.82.112.6", "140.82.114.6"],
  "codeload.github.com:443": ["140.82.113.10", "140.82.112.10", "140.82.114.10"],
  "ssh.github.com:443": ["140.82.113.35", "140.82.112.35"],
};

function attempt(targets, index, cb) {
  if (index >= targets.length) return cb(new Error("所有候选 IP 都连不上"));
  const sock = net.connect({ host: targets[index], port: 443 });
  const onErr = (e) => {
    sock.destroy();
    if (index + 1 < targets.length) attempt(targets, index + 1, cb);
    else cb(e);
  };
  sock.once("error", onErr);
  sock.once("connect", () => {
    sock.removeListener("error", onErr);
    cb(null, sock, targets[index]);
  });
}

const server = http.createServer((req, res) => {
  res.writeHead(405, { "Content-Type": "text/plain" });
  res.end("只支持 HTTPS CONNECT\n");
});

server.on("connect", (req, clientSocket, head) => {
  const key = String(req.url || "").toLowerCase();
  const host = key.split(":")[0];
  const targets = PINS[key] || PINS[host + ":443"] || [host];

  attempt(targets, 0, (err, targetSocket, used) => {
    if (err) {
      console.log(`✗ ${key} -> ${err.message}`);
      clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      return;
    }
    console.log(`→ ${key} via ${used}`);
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head && head.length) targetSocket.write(head);
    targetSocket.pipe(clientSocket);
    clientSocket.pipe(targetSocket);
    const bye = () => { targetSocket.destroy(); clientSocket.destroy(); };
    targetSocket.on("error", bye);
    clientSocket.on("error", bye);
    targetSocket.on("close", () => clientSocket.destroy());
    clientSocket.on("close", () => targetSocket.destroy());
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`pin-proxy 监听 http://127.0.0.1:${PORT}`);
  for (const [k, v] of Object.entries(PINS)) console.log(`  ${k} -> ${v.join(", ")}`);
});
