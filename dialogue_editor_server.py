"""Local dialogue authoring endpoints shared by the demo and editor launchers."""
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import hashlib
import json
import os
import re
import tempfile
import threading

ROOT = Path(__file__).resolve().parent
SETTINGS = ROOT / ".npc-editor-settings.json"
ACTION_SETTINGS = ROOT / ".action-event-editor-settings.json"
LOCK = threading.RLock()
FLAG_ALIASES_FILE = "flag-mappings.json"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def validate_aliases(aliases):
    if not isinstance(aliases, dict) or any(
        not name or name != name.strip() or not isinstance(key, str) or not key.strip()
        for name, key in aliases.items()
    ):
        raise ValueError("Flag 映射必须是名称到非空字段的 JSON 对象，名称首尾不能有空格")
    if len(set(aliases.values())) != len(aliases):
        raise ValueError("一个 Flag 字段只能对应一个名称")
    return aliases


def read_aliases(folder):
    path = folder / FLAG_ALIASES_FILE
    if path.is_symlink():
        raise ValueError(f"{FLAG_ALIASES_FILE} 必须是当前文件夹内的普通文件")
    if not path.exists():
        return {"aliases": {}, "revision": None}
    raw = path.read_bytes()
    try:
        aliases = validate_aliases(json.loads(raw.decode("utf-8-sig")))
    except ValueError as error:
        raise ValueError(f"{FLAG_ALIASES_FILE}：{error}") from error
    return {"aliases": aliases, "revision": digest(raw)}


def write_json(target, value):
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    with tempfile.NamedTemporaryFile(dir=target.parent, prefix=f".{target.name}.", suffix=".tmp", delete=False) as stream:
        temporary = Path(stream.name)
    try:
        temporary.write_bytes(raw)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    return digest(raw)


def action_event_kind(data):
    if not isinstance(data, dict):
        return None
    if data.get("kind") == "action-event-sandbox" and isinstance(data.get("source"), str) and "config" in data:
        return "sandbox"
    if isinstance(data.get("id"), str) and isinstance(data.get("slots"), list) and isinstance(data.get("stages"), dict):
        return "event"
    return None


class DialogueEditorHandler(SimpleHTTPRequestHandler):
    settings_file = SETTINGS
    action_settings_file = ACTION_SETTINGS

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def folder(self):
        if self.settings_file.exists():
            return Path(json.loads(self.settings_file.read_text(encoding="utf-8"))["directory"]).resolve()
        return ROOT / "npc-editor" / "examples"

    def reply_json(self, value, status=200):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def action_folder(self):
        if self.action_settings_file.exists():
            return Path(json.loads(self.action_settings_file.read_text(encoding="utf-8"))["directory"]).resolve()
        return ROOT / "action-events"

    def list_action_documents(self, folder):
        if not folder.is_dir():
            raise ValueError(f"事件 JSON 文件夹不存在：{folder}。请在设置中更换文件夹。")
        files, skipped = [], []
        for path in sorted(folder.iterdir(), key=lambda path: path.name.casefold()):
            if path.suffix.lower() != ".json" or path.is_symlink() or not path.is_file():
                continue
            try:
                data = json.loads(path.read_text(encoding="utf-8-sig"))
                kind = action_event_kind(data)
                if kind:
                    name = data.get("name") if kind == "event" else data.get("filename")
                    files.append({"file": path.name, "kind": kind, "name": name if isinstance(name, str) else ""})
            except (ValueError, OSError) as error:
                skipped.append(f"{path.name}：{error}")
        return {"directory": str(folder), "files": files, "skipped": skipped}

    def action_request(self, request, payload=None):
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        if not re.fullmatch(r"(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?", host, re.IGNORECASE) or (
            origin and origin != f"http://{host}"
        ) or self.headers.get("Sec-Fetch-Site") == "cross-site":
            return self.reply_json({"error": "只允许本机编辑器读取事件文件"}, 403)
        route = request.path.rsplit("/", 1)[-1]
        try:
            with LOCK:
                if self.command == "POST" and route == "settings":
                    value = payload.get("directory") if isinstance(payload, dict) else None
                    if not isinstance(value, str) or not value.strip():
                        raise ValueError("请填写事件 JSON 所在文件夹。")
                    folder = (ROOT / Path(value.strip()).expanduser()).resolve()
                    documents = self.list_action_documents(folder)
                    write_json(self.action_settings_file, {"directory": str(folder)})
                    return self.reply_json(documents)
                folder = self.action_folder()
                if self.command == "GET" and route == "settings":
                    return self.reply_json({"directory": str(folder)})
                if self.command == "GET" and route == "documents":
                    return self.reply_json(self.list_action_documents(folder))
                if self.command == "GET" and route == "document":
                    query = parse_qs(request.query)
                    if query.get("directory") != [str(folder)]:
                        return self.reply_json({"error": "文件夹设置已变化，请刷新文件列表。"}, 409)
                    name = query.get("file", [""])[0]
                    if not re.fullmatch(r'[^/\\<>:"|?*\x00-\x1f]+\.json', name, re.IGNORECASE):
                        raise ValueError("无效的事件 JSON 文件名。")
                    path = folder / name
                    if path.is_symlink() or path.resolve().parent != folder or not path.is_file():
                        raise ValueError("事件文件不存在或不在设置的文件夹内。")
                    raw = path.read_text(encoding="utf-8-sig")
                    kind = action_event_kind(json.loads(raw))
                    if not kind:
                        raise ValueError("该文件不是行动事件或沙盒 JSON。")
                    return self.reply_json({"kind": kind, "file": name, "source": raw})
                return self.reply_json({"error": "Unknown endpoint"}, 404)
        except (ValueError, OSError, KeyError) as error:
            return self.reply_json({"error": str(error)}, 400)

    def do_GET(self):
        request = urlparse(self.path)
        route = request.path
        if route.startswith("/__action_event_editor/"):
            return self.action_request(request)
        if not route.startswith("/__dialogue_editor/"):
            return super().do_GET()
        try:
            with LOCK:
                folder = self.folder()
                if route == "/__dialogue_editor/settings":
                    return self.reply_json({"directory": str(folder)})
                if route != "/__dialogue_editor/documents":
                    return self.reply_json({"error": "Unknown endpoint"}, 404)
                if not folder.is_dir():
                    raise ValueError(f"对话文件夹不存在：{folder}。请在设置中更换文件夹。")
                files, skipped = [], []
                for path in sorted(folder.iterdir()):
                    if path.name.casefold() == FLAG_ALIASES_FILE or path.suffix.lower() != ".json" or not path.is_file() or path.is_symlink():
                        continue
                    try:
                        raw = path.read_bytes()
                        data = json.loads(raw.decode("utf-8-sig"))
                        if not isinstance(data, dict) or not isinstance(data.get("nodes"), dict) or not data.get("id"):
                            continue
                        files.append({"file": path.name, "revision": digest(raw), "dialogue": data})
                    except (ValueError, OSError) as error:
                        skipped.append(f"{path.name}：{error}")
                return self.reply_json({"directory": str(folder), "files": files, "skipped": skipped, "flagMappings": read_aliases(folder)})
        except Exception as error:
            self.reply_json({"error": str(error)}, 400)

    def do_POST(self):
        request = urlparse(self.path)
        route = request.path
        action = route.startswith("/__action_event_editor/")
        if not action and not route.startswith("/__dialogue_editor/"):
            return self.send_error(404, "Unknown endpoint")
        # A different website must not be able to change local authoring files.
        origin = self.headers.get("Origin")
        if (origin and origin != f"http://{self.headers.get('Host')}") or self.headers.get("Sec-Fetch-Site") == "cross-site":
            return self.reply_json({"error": "只允许本地编辑器保存"}, 403)
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self.reply_json({"error": "需要 application/json"}, 415)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 8 * 1024 * 1024:
                raise ValueError("保存内容为空或超过 8 MB")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if action:
                return self.action_request(request, payload)
            with LOCK:
                if route == "/__dialogue_editor/settings":
                    value = payload.get("directory", "").strip()
                    if not value:
                        raise ValueError("请填写对话 JSON 所在文件夹")
                    folder = Path(value).expanduser()
                    folder = (ROOT / folder).resolve() if not folder.is_absolute() else folder.resolve()
                    if not folder.is_dir():
                        raise ValueError("文件夹不存在，请先创建或选择已有文件夹")
                    self.settings_file.write_text(json.dumps({"directory": str(folder)}, ensure_ascii=False, indent=2), encoding="utf-8")
                    return self.reply_json({"directory": str(folder)})
                if route not in ("/__dialogue_editor/save", "/__dialogue_editor/flag-mappings"):
                    return self.reply_json({"error": "Unknown endpoint"}, 404)
                folder = self.folder()
                if payload.get("directory") != str(folder):
                    return self.reply_json({"error": "文件夹设置已变化，请刷新编辑器后重试"}, 409)
                if route == "/__dialogue_editor/flag-mappings":
                    previous = read_aliases(folder)
                    if payload.get("revision") != previous["revision"]:
                        return self.reply_json({"error": f"{FLAG_ALIASES_FILE} 已变化，请重新读取文件夹后再保存映射。"}, 409)
                    aliases = validate_aliases(payload.get("aliases"))
                    revision = previous["revision"]
                    if aliases != previous["aliases"]:
                        revision = write_json(folder / FLAG_ALIASES_FILE, aliases)
                    return self.reply_json({"aliases": aliases, "revision": revision})
                name, dialogue = payload.get("file"), payload.get("dialogue")
                if not isinstance(name, str) or name.casefold() == FLAG_ALIASES_FILE or Path(name).name != name or any(c in name for c in '/\\<>:"|?*') or not name.lower().endswith(".json") or name.startswith("."):
                    raise ValueError("无效的 JSON 文件名")
                if not isinstance(dialogue, dict) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*", dialogue.get("id", "")) or not isinstance(dialogue.get("nodes"), dict) or not dialogue["nodes"]:
                    raise ValueError("无效的对话 JSON")
                editor = dialogue.get("editor")
                authoring = editor.get("textAuthoring") if isinstance(editor, dict) else None
                if isinstance(authoring, dict) and "flagAliases" in authoring:
                    mappings = read_aliases(folder)
                    if mappings["revision"] is not None or not authoring["flagAliases"]:
                        del authoring["flagAliases"]
                target = folder / name
                if target.is_symlink() or target.resolve().parent != folder:
                    raise ValueError("目标文件必须位于设置的文件夹内")
                revision = digest(target.read_bytes()) if target.exists() else None
                if payload.get("revision") != revision:
                    return self.reply_json({"error": "文件已被其他编辑器修改或同名文件已存在。请先保留草稿，再重新读取文件夹。"}, 409)
                return self.reply_json({"file": name, "revision": write_json(target, dialogue)})
        except Exception as error:
            self.reply_json({"error": str(error)}, 400)
