from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json


ROOT = Path(__file__).resolve().parent.parent
WORLD_MAP = ROOT / "world-map.js"
WORLD_EVENTS = ROOT / "world-events.js"
PORT = 8765


class NodeEditorHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        targets = {
            "/__node_editor/save_world_map": (WORLD_MAP, "window.WORLD_MAP_BUNDLE"),
            "/__node_editor/save_world_events": (WORLD_EVENTS, "window.WORLD_EVENT_SET_BUNDLE"),
        }
        if self.path not in targets:
            self.send_error(404, "Unknown endpoint")
            return
        try:
            target, marker = targets[self.path]
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            source = payload.get("source")
            if not isinstance(source, str) or marker not in source:
                raise ValueError(f"source must contain {marker}")
            target.write_text(source, encoding="utf-8", newline="\n")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "path": str(target)}).encode("utf-8"))
        except Exception as error:
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), NodeEditorHandler)
    print(f"Node editor server: http://127.0.0.1:{PORT}/node-editor/index.html")
    print("Saving exports to:", WORLD_MAP)
    print("Saving event sets to:", WORLD_EVENTS)
    server.serve_forever()
