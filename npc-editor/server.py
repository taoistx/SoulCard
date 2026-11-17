from http.server import ThreadingHTTPServer
from pathlib import Path
import argparse
import errno
import sys
import webbrowser

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dialogue_editor_server import DialogueEditorHandler

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--settings-file", type=Path)
    parser.add_argument("--open", action="store_true", help="Open the editor after its server has bound a port")
    args = parser.parse_args()
    if args.settings_file:
        DialogueEditorHandler.settings_file = args.settings_file.resolve()
    ThreadingHTTPServer.request_queue_size = 128
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), DialogueEditorHandler)
    except OSError as error:
        # Windows reports WSAEACCES for a port exclusively owned by another process.
        if error.errno not in (errno.EADDRINUSE, 10048) and getattr(error, "winerror", None) != 10013:
            raise
        # An old static server can still own port 8000. Always open this process's URL.
        server = ThreadingHTTPServer(("127.0.0.1", 0), DialogueEditorHandler)
    url = f"http://127.0.0.1:{server.server_port}/npc-editor/index.html"
    print(f"Dialogue editor: {url}", flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
