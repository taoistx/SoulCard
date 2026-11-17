"use strict";

(function (global) {
  let initialized = false;
  const showFailure = (error) => {
    const show = () => {
      const app = document.querySelector("#editorApp");
      app.classList.remove("is-loading"); app.inert = true;
      document.querySelector("#startupFailure").hidden = false;
      document.querySelector("#startupError").textContent = error.message || String(error);
      document.querySelector("#dirtyState").textContent = "载入失败";
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show, { once: true }); else show();
  };
  global.DialogueEditorStartup = {
    fail: showFailure,
    complete() {
      initialized = true;
      document.querySelector("#startupFailure").hidden = true;
      const app = document.querySelector("#editorApp"); app.inert = false; app.classList.remove("is-loading");
    },
  };
  global.addEventListener("error", (event) => {
    if (initialized) return;
    if (event.target?.tagName === "SCRIPT") showFailure(new Error(`启动脚本未能加载：${event.target.src}。请刷新重试。`));
    else if (event.error) showFailure(event.error);
  }, true);
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("#retryStartupButton").addEventListener("click", () => location.reload());
    document.querySelector("#loadStartupExampleButton").addEventListener("click", () => document.querySelector("#startupExampleFile").click());
    document.querySelector("#startupExampleFile").addEventListener("change", async (event) => {
      const file = event.target.files[0]; if (!file) return;
      const button = document.querySelector("#loadStartupExampleButton"); button.disabled = true;
      try {
        if (!global.DialogueEditorEnvironment?.loadSample || !global.initialize || !global.initializeTextEditor) throw new Error("启动脚本尚未完整加载，请刷新页面后重试。");
        await global.DialogueEditorEnvironment.loadSample(await file.text());
        global.DialogueEditorEnvironment.ready = Promise.resolve();
        await global.initialize();
        await global.initializeTextEditor();
      } catch (error) { showFailure(error); }
      finally { button.disabled = false; event.target.value = ""; }
    });
  });
})(window);
