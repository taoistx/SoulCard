"use strict";

function createDialogueCompletion(input, menu, getDialogue, getSyntaxVersion, applyEdit) {
  const area = input.parentElement;
  const measure = document.createElement("span");
  measure.className = "text-completion-measure";
  measure.setAttribute("aria-hidden", "true");
  area.append(measure);
  const options = [];
  let active = 0, composing = false;

  function reference() {
    if (input.selectionStart !== input.selectionEnd) return null;
    const caret = input.selectionStart;
    const start = caret ? input.value.lastIndexOf("\n", caret - 1) + 1 : 0;
    const before = input.value.slice(start, caret);
    const match = /^([\t ]*)(@[\t ]*)([A-Za-z0-9_-]*)$/u.exec(before);
    if (!match) return null;
    const after = /^[A-Za-z0-9_-]*(?=[\t ]*(?:\n|$))/u.exec(input.value.slice(caret));
    if (!after) return null;
    return { start: start + match[1].length, end: caret + after[0].length, prefix: match[2], query: match[3], before, row: input.value.slice(0, start).split("\n").length - 1 };
  }

  function close() {
    menu.hidden = true;
    input.removeAttribute("aria-activedescendant");
  }

  function select(index) {
    active = index;
    for (let i = 0; i < menu.children.length; i++) menu.children[i].setAttribute("aria-selected", String(i === active));
    const item = menu.children[active];
    input.setAttribute("aria-activedescendant", item.id);
    item.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function place(target = reference()) {
    if (menu.hidden) return;
    if (!target) { close(); return; }
    const style = getComputedStyle(input);
    const paddingTop = parseFloat(style.paddingTop), paddingLeft = parseFloat(style.paddingLeft), lineHeight = parseFloat(style.lineHeight);
    measure.textContent = target.before;
    const x = paddingLeft + measure.getBoundingClientRect().width - input.scrollLeft;
    const y = paddingTop + target.row * lineHeight - input.scrollTop;
    if (x < 0 || x > input.clientWidth || y + lineHeight <= 0 || y >= input.clientHeight) { close(); return; }
    const below = area.clientHeight - y - lineHeight;
    menu.style.maxHeight = `${Math.min(230, Math.max(below, y))}px`;
    menu.style.left = `${Math.max(0, Math.min(x, area.clientWidth - menu.offsetWidth))}px`;
    menu.style.top = `${below >= menu.offsetHeight ? y + lineHeight : Math.max(0, y - menu.offsetHeight)}px`;
  }

  function update() {
    const target = reference(), dialogue = getDialogue();
    if (composing || document.activeElement !== input || !target || !dialogue) { close(); return; }
    const query = target.query.toLowerCase();
    options.length = 0;
    for (const [entries, type] of [[dialogue.nodes, "节点"], [dialogue.optionLists, "选项组"]]) {
      for (const id of Object.keys(entries || {})) if (id.toLowerCase().startsWith(query)) options.push({ id, type });
    }
    if (!options.length) { close(); return; }
    menu.replaceChildren(...options.map(({ id, type }, index) => {
      const item = document.createElement("div"), label = document.createElement("span"), badge = document.createElement("small");
      item.id = `textCompletionOption${index}`;
      item.setAttribute("role", "option");
      item.dataset.index = index;
      label.textContent = id;
      badge.textContent = type;
      item.append(label, badge);
      return item;
    }));
    menu.hidden = false;
    place(target);
    if (!menu.hidden) select(0);
  }

  function insert(index) {
    const target = reference(), option = options[index];
    if (!target || !option) { close(); return; }
    const version = getSyntaxVersion();
    const prefix = version === undefined ? "-> " : target.prefix;
    input.setRangeText(prefix + option.id, target.start, target.end, "end");
    close();
    applyEdit({ start: target.start, end: target.end });
  }

  input.addEventListener("input", update);
  input.addEventListener("compositionstart", () => { composing = true; close(); });
  input.addEventListener("compositionend", () => { composing = false; update(); });
  input.addEventListener("blur", close);
  input.addEventListener("click", close);
  input.addEventListener("scroll", () => place());
  menu.addEventListener("mousedown", (event) => event.preventDefault());
  menu.addEventListener("click", (event) => {
    const item = event.target.closest("[data-index]");
    if (item) insert(Number(item.dataset.index));
  });

  return {
    close,
    handleKey(event) {
      if (menu.hidden || event.isComposing || composing) return false;
      const { key } = event;
      if (key === "ArrowDown" || key === "ArrowUp") select((active + (key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
      else if ((key === "Enter" || key === "Tab") && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) insert(active);
      else if (key === "Escape") close();
      else {
        if (["Home", "End", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Tab"].includes(key)) close();
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
  };
}
