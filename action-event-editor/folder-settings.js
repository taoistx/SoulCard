"use strict";

function connectActionEventFolder({ current, openDocument }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $("eventFolderSettings");
  const settings = $("openFolderSettings");
  const directoryInput = $("eventDirectory");
  const apply = $("applyFolderSettings");
  const status = $("eventSettingsStatus");
  const select = $("eventFile");
  const summary = $("eventFolderStatus");
  let registry;
  let pending = false;

  async function request(route, payload) {
    const response = await fetch(`/__action_event_editor/${route}`, {
      cache: "no-store",
      ...(payload && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new Error(data?.error || `文件夹服务不可用（HTTP ${response.status}）。`);
    return data;
  }

  function syncSelection() {
    const selected = current();
    select.value = selected?.directory === registry?.directory && registry?.files.some(({ file }) => file === selected.file)
      ? selected.file : "";
  }

  function reportDocuments(data) {
    summary.textContent = `${data.files.length} 个事件文件${data.skipped.length ? ` · ${data.skipped.length} 个 JSON 读取失败` : ""}`;
    summary.title = [data.directory, ...data.skipped].join("\n");
  }

  function showDocuments(data) {
    registry = data;
    const placeholder = new Option(data.files.length ? "选择事件文件" : "当前没有事件 JSON", "");
    select.replaceChildren(placeholder);
    for (const { file, name } of data.files) select.add(new Option(name ? `${file} · ${name}` : file, file));
    select.disabled = !data.files.length;
    syncSelection();
    reportDocuments(data);
  }

  async function loadDocuments() {
    summary.textContent = "正在读取事件文件夹…";
    try { showDocuments(await request("documents")); }
    catch (error) {
      summary.textContent = "请在设置中连接事件文件夹。";
      summary.title = error.message;
    }
  }

  settings.addEventListener("click", async () => {
    dialog.showModal();
    directoryInput.value = registry?.directory || directoryInput.value;
    if (registry) {
      status.textContent = registry.skipped.join("\n");
      apply.disabled = false;
      return;
    }
    apply.disabled = true;
    status.textContent = "正在连接本地文件夹服务…";
    try {
      directoryInput.value = (await request("settings")).directory;
      apply.disabled = false;
      status.textContent = "";
    } catch (error) {
      status.textContent = `${error.message}\n请用「启动行动事件文本编辑器.cmd」重新打开页面。`;
    }
  });

  $("closeFolderSettings").addEventListener("click", () => dialog.close());
  $("eventFolderForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    apply.disabled = true;
    status.textContent = "正在读取目录…";
    try {
      showDocuments(await request("settings", { directory: directoryInput.value }));
      dialog.close();
    } catch (error) {
      status.textContent = error.message;
    } finally { apply.disabled = false; }
  });

  select.addEventListener("change", async () => {
    const file = select.value;
    if (!file || pending) { syncSelection(); return; }
    pending = true;
    select.disabled = true;
    settings.disabled = true;
    try {
      const query = new URLSearchParams({ directory: registry.directory, file });
      const data = await request(`document?${query}`);
      openDocument(data, registry.directory);
      reportDocuments(registry);
    } catch (error) {
      summary.textContent = error.message;
    } finally {
      pending = false;
      select.disabled = false;
      settings.disabled = false;
      syncSelection();
    }
  });

  loadDocuments();
  return { syncSelection };
}
