// Execute the real Windows batch from another working directory. Browser opening is
// intercepted only inside the child Python process, so this check opens no user tabs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dialogue-launcher-"));
  const batch = path.resolve(__dirname, "../npc-editor/启动剧情编辑器.cmd");
  fs.writeFileSync(path.join(temporary, "sitecustomize.py"), `
import json
import sys
import threading
import webbrowser
from http.server import ThreadingHTTPServer

def capture_browser(url):
    print("LAUNCHER_ARGS=" + json.dumps(sys.argv), flush=True)
    print("LAUNCHER_URL=" + url, flush=True)
    return True

webbrowser.open = capture_browser
original_serve = ThreadingHTTPServer.serve_forever
def bounded_serve(server, *args, **kwargs):
    timer = threading.Timer(5, server.shutdown)
    timer.daemon = True
    timer.start()
    return original_serve(server, *args, **kwargs)
ThreadingHTTPServer.serve_forever = bounded_serve
`, "utf8");
  let child, timeout;
  try {
    const bytes = fs.readFileSync(batch);
    assert.equal(bytes.includes(Buffer.from("\r\n")), true, "Windows batch must use CRLF");
    child = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/c", batch], {
      cwd: temporary, windowsHide: true,
      env: { ...process.env, PYTHONPATH: temporary, PYTHONIOENCODING: "utf-8" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end("\r\n");
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    const done = once(child, "exit");
    const started = new Promise((resolve, reject) => {
      child.stdout.on("data", () => {
        const match = output.match(/LAUNCHER_URL=(http:\/\/127\.0\.0\.1:\d+\/npc-editor\/index.html)/);
        if (match) resolve(match[1]);
      });
      child.on("exit", () => reject(new Error(`Batch exited before opening its server: ${output}`)));
      timeout = setTimeout(() => reject(new Error(`Batch startup timed out: ${output}`)), 20000);
    });
    const url = await started;
    clearTimeout(timeout);
    const origin = new URL(url).origin;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const settings = await fetch(`${origin}/__dialogue_editor/settings`);
    assert.equal(settings.status, 200);
    assert.equal(typeof (await settings.json()).directory, "string");
    const documents = await fetch(`${origin}/__dialogue_editor/documents`);
    assert.equal(documents.status, 200);
    assert.ok(Array.isArray((await documents.json()).files));
    const args = JSON.parse(output.match(/LAUNCHER_ARGS=(.*)/)[1]);
    assert.equal(path.resolve(args[0]), path.resolve(__dirname, "../npc-editor/server.py"));
    assert.deepEqual(args.slice(1), ["--port", "0", "--open"]);
    assert.equal((await done)[0], 0, output);
    console.log("PASS: real batch launches the JSON read/write service from another directory, selects a new port, opens the matching URL and exits cleanly");
  } finally {
    clearTimeout(timeout);
    if (child && child.exitCode === null) child.kill();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
