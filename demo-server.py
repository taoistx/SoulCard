from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import time
import webbrowser
from dialogue_editor_server import DialogueEditorHandler


ROOT = Path(__file__).resolve().parent


class NoCacheHandler(DialogueEditorHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument("--action-editor", action="store_true", help="Start on the action event text editor")
    args = parser.parse_args()

    server = ThreadingHTTPServer(("127.0.0.1", 0), NoCacheHandler)
    host, port = server.server_address
    page = "action-event-editor/index.html" if args.action_editor else "index.html"
    url = f"http://{host}:{port}/{page}?launch={int(time.time())}"
    label = "Action event editor" if args.action_editor else "Demo server"
    print(f"{label}: {url}", flush=True)
    print("Close this window to stop the server.", flush=True)
    if not args.no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
