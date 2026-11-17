"use strict";

(function () {
  const environment = window.DialogueEditorEnvironment;
  const dialog = $("#editorSettingsDialog"), input = $("#dialogueDirectoryInput"), status = $("#editorSettingsStatus"), apply = $("#applyEditorSettingsButton");
  const retry = $("#retryEditorConnectionButton");
  async function checkConnection(preserveInput = false) {
    const originalValue = input.value;
    status.textContent = "正在连接文件夹读写服务…"; apply.disabled = true; retry.disabled = true;
    try {
      const settings = await environment.request("settings");
      if ((!preserveInput && input.value === originalValue) || !input.value.trim()) input.value = settings.directory;
      status.textContent = "已连接文件夹读写服务，可以应用路径。"; apply.disabled = false; retry.hidden = true;
    } catch (error) {
      status.textContent = `未连接文件夹读写服务，填写的路径尚未提交。\n请双击 npc-editor 文件夹中的“启动剧情编辑器.cmd”，使用它自动打开的新页面。直接打开 HTML、普通静态服务器或仍在运行的旧服务均不支持此操作。\n当前页面的服务恢复后，可点击“重新检测连接”。\n${error.message}`;
      retry.hidden = false;
    } finally { retry.disabled = false; }
  }
  function openSettings() { dialog.showModal(); checkConnection(); }
  $("#editorSettingsButton").addEventListener("click", openSettings);
  $("#startupSettingsButton").addEventListener("click", openSettings);
  $("#closeEditorSettingsButton").addEventListener("click", () => dialog.close());
  retry.addEventListener("click", () => checkConnection(true));
  apply.addEventListener("click", async () => {
    apply.disabled = true; status.textContent = "正在应用设置…";
    try {
      persistDraft();
      await environment.request("settings", { directory: input.value });
      // Even a project-integration URL switches to the explicitly configured folder.
      const url = new URL(location.href); url.searchParams.delete("source");
      window.DialogueEditorLeaving = true;
      location.replace(url);
    } catch (error) { status.textContent = error.message; apply.disabled = false; }
  });
})();
