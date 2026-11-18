"use strict";

function createDialogueFolding(input, gutter, onChange, {
  isFoldHeader = (text) => text.startsWith("》"),
  allowFlatReply = true,
  indentDepth = (indent) => indent.includes("\t") ? indent.length : indent.length / 4,
  belongsToHeader = () => false,
} = {}) {
  const rowHeight = 23;
  const highlights = document.querySelector("#textScopeHighlights");
  let source = "", folded = new Set(), ranges = new Map();
  let visible = "", hidden = [], rows = [], pendingEdit = null;
  let visibleScopes = [], activeRow = -1;

  function findRanges() {
    const lines = source.split("\n"), offsets = [];
    let offset = 0;
    for (const line of lines) { offsets.push(offset); offset += line.length + 1; }
    const tokens = lines.flatMap((line, index) => {
      if (!line.trim()) return [];
      const indent = line.match(/^[\t ]*/u)[0];
      return [{ index, depth: indentDepth(indent), text: line.slice(indent.length) }];
    });
    const result = new Map();
    for (let i = 0; i < tokens.length; i++) {
      const { index, depth, text } = tokens[i];
      if (!isFoldHeader(text, depth)) continue;
      let j = i + 1;
      // Plain text also accepts a same-level reply or @ reference after an option.
      const flatReply = allowFlatReply && tokens[j]?.depth === depth && !/^(》|@(?:node|option)\s)/u.test(tokens[j].text);
      while (j < tokens.length) {
        const next = tokens[j];
        if (next.depth === depth && belongsToHeader(text.trimEnd(), next.text.trimEnd())) { j++; continue; }
        if (next.depth <= depth) {
          if (next.depth < depth || !flatReply || /^(》|@(?:node|option)\s)/u.test(next.text)) break;
          if (next.text.startsWith("@")) { j++; break; }
        }
        j++;
      }
      if (j === i + 1) continue;
      const last = tokens[j - 1].index;
      result.set(offsets[index] + lines[index].length, { first: index, last, end: offsets[last] + lines[last].length });
    }
    return { lines, offsets, result };
  }

  function sourceOffset(offset) {
    return offset + hidden.reduce((extra, range) => extra + (range.at < offset ? range.end - range.start : 0), 0);
  }

  function viewOffset(offset) {
    return offset - hidden.reduce((extra, range) => extra + Math.max(0, Math.min(range.end, offset) - range.start), 0);
  }

  function syncScroll() {
    gutter.scrollTop = input.scrollTop;
    highlights.style.transform = `translateY(${-input.scrollTop}px)`;
  }

  function highlightScope() {
    const caret = input.selectionDirection === "backward" ? input.selectionStart : input.selectionEnd;
    const row = visible.slice(0, caret).split("\n").length - 1;
    if (row === activeRow || !visibleScopes[row]) return;
    activeRow = row;
    const { parent, root } = visibleScopes[row];
    visibleScopes.forEach((scope, index) => {
      const sameScope = scope.parent === parent && scope.root === root;
      const number = gutter.children[index], background = highlights.children[index];
      number.classList.toggle("is-in-scope", sameScope);
      background.classList.toggle("is-in-scope", sameScope);
      number.classList.toggle("is-cursor-line", index === row);
      background.classList.toggle("is-cursor-line", index === row);
      number.classList.toggle("is-scope-parent", rows[index] === parent);
    });
  }

  function render(selection, scrollTop = input.scrollTop) {
    const { lines, offsets, result } = findRanges();
    ranges = result;
    folded = new Set([...folded].filter((start) => ranges.has(start)));
    hidden = [];
    rows = [];
    visibleScopes = [];
    activeRow = -1;
    const fragment = document.createDocumentFragment(), backgrounds = document.createDocumentFragment(), display = [];
    const branches = [];
    let viewStart = 0, root = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], start = offsets[i] + line.length, range = ranges.get(start);
      while (branches.length && branches.at(-1).last < i) branches.pop();
      if (/^@node\s/u.test(line)) root = i;
      visibleScopes.push({ parent: branches.at(-1)?.first, root });
      const background = document.createElement("div");
      background.className = "text-scope-row";
      backgrounds.append(background);
      const row = document.createElement("div"), number = document.createElement("span");
      row.className = "text-line-number";
      number.textContent = i + 1;
      number.setAttribute("aria-hidden", "true");
      row.append(number);
      rows.push(i);
      display.push(line);
      viewStart += line.length;
      if (range) {
        const collapsed = folded.has(start), button = document.createElement("button");
        button.type = "button";
        button.className = "text-fold-toggle";
        button.dataset.line = i + 1;
        button.dataset.offset = start;
        button.textContent = collapsed ? "▸" : "▾";
        button.title = collapsed ? `展开第 ${i + 1} 行分支（${range.last - i} 行）` : `折叠第 ${i + 1} 行分支`;
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-expanded", String(!collapsed));
        row.append(button);
        if (collapsed) {
          hidden.push({ at: viewStart, start, end: range.end });
          i = range.last;
        } else branches.push(range);
      }
      viewStart++;
      fragment.append(row);
    }
    visible = display.join("\n");
    if (input.value !== visible) input.value = visible;
    if (selection) {
      const start = viewOffset(selection.start), end = viewOffset(selection.end);
      if (start !== input.selectionStart || end !== input.selectionEnd) input.setSelectionRange(start, end, selection.direction);
    }
    gutter.replaceChildren(fragment);
    highlights.replaceChildren(backgrounds);
    highlightScope();
    input.scrollTop = typeof scrollTop === "function" ? scrollTop() : scrollTop;
    syncScroll();
  }

  function selectsAll({ start, end }) {
    return start === 0 && end === visible.length && end > start;
  }

  function selectionInSource() {
    const selection = { start: input.selectionStart, end: input.selectionEnd };
    return {
      start: sourceOffset(selection.start),
      end: selectsAll(selection) ? source.length : sourceOffset(selection.end),
      direction: input.selectionDirection,
    };
  }

  function updateFromInput(edit = null) {
    const next = input.value;
    if (next === visible) return;
    // Anchor the diff at the pre-edit selection so identical neighboring text cannot move an edit across a fold.
    let start = 0, oldEnd = visible.length, newEnd = next.length;
    const prefixLimit = Math.min(oldEnd, newEnd, edit?.start ?? oldEnd);
    while (start < prefixLimit && visible[start] === next[start]) start++;
    while (oldEnd > Math.max(start, edit?.end ?? start) && newEnd > start && visible[oldEnd - 1] === next[newEnd - 1]) {
      oldEnd--; newEnd--;
    }
    const fullEdit = edit && selectsAll(edit);
    const from = sourceOffset(start), to = fullEdit ? source.length : sourceOffset(oldEnd);
    const inserted = next.slice(start, newEnd);
    const delta = inserted.length - (to - from);
    const shift = newEnd - oldEnd;
    const consumed = (range) => range.at >= start && (range.at < oldEnd || fullEdit);
    const remaining = hidden.filter((range) => !consumed(range));
    const nextSourceOffset = (offset) => offset + remaining.reduce((extra, range) => {
      const at = range.at < start ? range.at : range.at + shift;
      return extra + (at < offset ? range.end - range.start : 0);
    }, 0);
    const selection = { start: nextSourceOffset(input.selectionStart), end: nextSourceOffset(input.selectionEnd), direction: input.selectionDirection };
    folded = new Set([...folded].flatMap((anchor) => {
      if (anchor < from) return [anchor];
      if (anchor >= to) return [anchor + delta];
      return [];
    }));
    source = source.slice(0, from) + inserted + source.slice(to);
    render(selection);
    onChange(source);
  }

  function toggle(start) {
    const selection = selectionInSource(), scroll = input.scrollTop;
    const topLine = rows[Math.floor(scroll / rowHeight)] ?? 0;
    if (folded.has(start)) folded.delete(start); else folded.add(start);
    render(selection, () => {
      const nextRow = rows.findIndex((line) => line >= topLine);
      const row = nextRow < 0 ? rows.length - 1 : rows[nextRow] > topLine ? Math.max(0, nextRow - 1) : nextRow;
      return row * rowHeight + scroll % rowHeight;
    });
  }

  gutter.addEventListener("click", (event) => {
    const button = event.target.closest(".text-fold-toggle");
    if (!button) return;
    const line = button.dataset.line;
    toggle(Number(button.dataset.offset));
    gutter.querySelector(`[data-line="${line}"]`)?.focus({ preventScroll: true });
  });
  gutter.addEventListener("wheel", (event) => {
    event.preventDefault();
    input.scrollTop += event.deltaY * (event.deltaMode === 1 ? rowHeight : event.deltaMode === 2 ? input.clientHeight : 1);
  }, { passive: false });
  input.addEventListener("scroll", syncScroll);
  for (const type of ["selectionchange", "select", "focus", "click", "keyup"]) input.addEventListener(type, highlightScope);
  input.addEventListener("beforeinput", (event) => {
    const start = input.selectionStart, end = input.selectionEnd;
    const deletesAcrossFold = {
      deleteContentForward: start,
      deleteContentBackward: start - 1,
    };
    // Expand first when deleting a fold boundary with a single keystroke.
    const boundary = start === end && hidden.find((range) => range.at === deletesAcrossFold[event.inputType]);
    if (boundary && event.cancelable) {
      event.preventDefault();
      toggle(boundary.start);
      return;
    }
    pendingEdit = { start, end, type: event.inputType };
  });
  input.addEventListener("input", () => {
    let edit = pendingEdit;
    pendingEdit = null;
    if (edit?.type?.endsWith("Backward") && edit.start === edit.end) edit = { ...edit, start: Math.min(edit.start, input.selectionStart) };
    if (/^history/u.test(edit?.type || "")) edit = null;
    updateFromInput(edit);
  });
  for (const type of ["copy", "cut"]) input.addEventListener(type, (event) => {
    const { start, end } = selectionInSource();
    if (start === end || end - start === input.selectionEnd - input.selectionStart || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", source.slice(start, end));
    if (type === "cut") {
      const edit = { start: input.selectionStart, end: input.selectionEnd };
      input.setRangeText("", edit.start, edit.end, "end");
      updateFromInput(edit);
    }
  });

  return {
    setText(text, reset = false) {
      if (!reset && text === source && rows.length) return;
      source = text.replace(/\r\n?/gu, "\n");
      folded.clear();
      render();
    },
    updateFromInput,
    syncScroll,
    revealSelection() {
      const selection = selectionInSource();
      const intersecting = hidden.filter(({ start, end }) => start < selection.end && end > selection.start);
      if (!intersecting.length) return;
      for (const start of folded) if (intersecting.some((range) => start >= range.start && start < range.end)) folded.delete(start);
      render(selection);
    },
    reveal(line, column) {
      const before = source.split("\n").slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
      const position = before + column - 1;
      for (const start of folded) if (start < before && before <= ranges.get(start).end) folded.delete(start);
      render({ start: position, end: position }, () => Math.max(0, (rows.indexOf(line - 1) - 2) * rowHeight));
      input.focus({ preventScroll: true });
    },
  };
}
