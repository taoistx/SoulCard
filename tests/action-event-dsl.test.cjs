const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { compile, parse } = require("../action-event-editor/dsl.js");
const { create } = require("../action-event-editor/sandbox.js");
const example = require("../action-event-editor/example.js");

const sourceFor = (...lines) => ["#露西 #粪怪", "》确认", ...lines].join("\n");
function machine(source = example.source, config = example.config) {
  const result = compile(source, config);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return create(result.panel, config);
}

test("flat example runs win, loss, escape, meat, fallback and leave", () => {
  const run = machine();
  for (const outcome of ["胜利", "失败", "逃跑"]) {
    run.reset();
    run.place("露西", 1);
    run.place("粪怪", 2);
    run.start("确认");
    assert.equal(run.view().pending.target, "monster1");
    assert.match(run.view().trace.find(({ kind }) => kind === "text").text, /护在身后/u);
    run.resume(outcome);
    const { state, closed, placements } = run.view();
    assert.equal(closed, true);
    assert.equal(placements.get("粪怪"), 2);
    assert.equal(state.flags.get("露西获救"), outcome === "胜利" ? true : undefined);
    assert.equal(state.flags.get("露西死亡"), outcome === "失败" ? true : undefined);
    assert.equal(state.deck.some(({ cardId }) => cardId === "处决"), outcome === "胜利");
  }
  run.reset();
  run.start("确认");
  assert.equal(run.view().closed, false);
  assert.match(run.view().trace.find(({ kind }) => kind === "text").text, /没有意义/u);
  run.place("粪怪", 3);
  run.start("确认");
  assert.equal(run.view().state.flags.get("露西获救"), true);
  assert.equal(run.view().placements.size, 0);
  assert.equal(run.view().state.deck.length, example.config.initial.deck.length - 1);
  run.reset();
  run.start("离开");
  assert.equal(run.view().state.flags.size, 0);
  assert.equal(run.view().closed, true);
});

test("BOM, CRLF, punctuation, paragraphs, escapes and source positions", () => {
  const source = [
    "\uFEFF[旁白]她问：“你是谁？》”", "", "\\#这不是槽位", "#露西", "》确认",
    "    \\+flag: 露西获救", "", "    \\暴力》露西:", "    C:\\卷宗", "    @exit",
  ].join("\r\n");
  const { panel, diagnostics } = parse(source, "叙述.txt");
  assert.deepEqual(diagnostics, []);
  assert.equal(panel.description, "[旁白]她问：“你是谁？》”\n\n#这不是槽位");
  assert.equal(panel.operations[0].body[0].value, "+flag: 露西获救\n\n暴力》露西:\nC:\\卷宗");
  assert.deepEqual(panel.operations[0].body[1].loc, { line: 10, column: 5 });
  assert.deepEqual(parse(sourceFor(" \t@exit"), "错.txt").diagnostics[0], {
    severity: "error", file: "错.txt", line: 3, column: 3, code: "InvalidIndent", message: "每级缩进使用一个 Tab 或四个空格。",
  });
  assert.equal(parse(sourceFor("  @exit")).diagnostics[0].code, "InvalidIndent");
});

test("rejects illegal nesting, unknown references and duplicate declarations", () => {
  const illegal = [
    ["InvalidCommand", "    @teleport elsewhere"],
    ["InvalidCommand", "    @shop eddie?"],
    ["InvalidNesting", "    @battle monster1", "        》胜利", "            @exit"],
    ["InvalidReturn", "    @battle monster1?", "    》胜 利", "        @exit"],
    ["MissingReturns", "    @battle monster1?"],
    ["UnknownGroup", "    @jump missing"],
    ["UnknownExternalId", "    @battle missing"],
    ["UnknownStateKind", "    +hp: x"],
    ["UnknownItem", "    +item: missing"],
    ["UnknownCard", "    @jump g", "[g]", "[missing]》露西:", "    @exit"],
    ["UnknownSlot", "暴力》误写:", "    @exit"],
    ["UnknownTag", "未知》露西:", "    @exit"],
    ["Duplicate", "    @jump g", "[g]", "其他:", "    @exit", "[g]", "其他:", "    @exit"],
    ["MisplacedFallback", "其他:", "    @exit", "暴力》露西:", "    @exit"],
    ["Duplicate", "    @battle monster1?", "    》胜利", "        @exit", "    》胜利", "        @exit"],
  ];
  for (const [code, ...lines] of illegal) {
    const result = compile(sourceFor(...lines), example.config, "bad.txt");
    assert.equal(result.ok, false, lines.join("\n"));
    assert.ok(result.diagnostics.some((entry) => entry.code === code && entry.file === "bad.txt"), JSON.stringify(result.diagnostics));
  }
  const unreachable = compile(sourceFor("    @exit", "    @jump g", "[g]", "其他:", "    @exit"), example.config);
  assert.ok(unreachable.ok);
  assert.equal(unreachable.diagnostics[0].code, "UnreachableGroup");
});

test("an earlier tag rule wins even when later exact-card and multi-condition rules both match", () => {
  const run = machine(sourceFor(
    "暴力》粪怪:", "    +flag: tag",
    "[短促刺击]》粪怪:", "    +flag: exact",
    "空》露西 & 暴力》粪怪：", "    +flag: empty",
  ));
  run.place("粪怪", 2);
  run.start("确认");
  assert.deepEqual([...run.view().state.flags], [["tag", true]]);
  assert.equal(run.view().placements.size, 0);
  assert.equal(run.view().state.deck.length, example.config.initial.deck.length);
});

test("named groups use the first matching rule and keep rollback when no rule matches", () => {
  const source = sourceFor(
    "    +flag: tentative", "    @jump test", "    +flag: skipped", "[test]",
    "执念》露西:", "    +flag: first", "暴力》粪怪:", "    +flag: second",
  );
  const run = machine(source);
  run.start("确认");
  assert.equal(run.view().error.code, "NoMatch");
  assert.equal(run.view().state.flags.size, 0);
  run.place("露西", 1);
  run.place("粪怪", 2);
  run.start("确认");
  assert.deepEqual([...run.view().state.flags], [["tentative", true], ["first", true]]);
  run.reset();
  run.place("粪怪", 2);
  run.start("确认");
  assert.deepEqual([...run.view().state.flags], [["tentative", true], ["second", true]]);
});

test("condition expressions group across nested parentheses and use not, and, or precedence", () => {
  function matches(expression, left, right) {
    const run = machine(sourceFor(`${expression}：`, "    +flag: matched", "其他:", "    +flag: missed"));
    run.place("露西", left);
    run.place("粪怪", right);
    run.start("确认");
    return run.view().state.flags.has("matched");
  }
  for (const [left, right] of [[1, 2], [1, null], [null, 2], [null, null]]) {
    assert.equal(matches("执念》露西 & 暴力》粪怪", left, right), matches("（执念》露西）＆（暴力》粪怪）", left, right));
  }
  assert.equal(matches("（执念》露西）|（！暴力》露西）", 1, null), true);
  assert.equal(matches("（执念》露西）|（！暴力》露西）", 2, null), false);
  assert.equal(matches("（执念》露西）|（！暴力》露西）", null, null), true);
  assert.equal(matches("执念》露西 | 暴力》露西 & 空》粪怪", 1, 2), true);
  assert.equal(matches("（执念》露西 | 暴力》露西）＆空》粪怪", 1, 2), false);
  assert.equal(matches("！（（暴力》露西｜暴力》粪怪）＆！空》露西）", 1, 2), false);
  assert.equal(matches("！（（暴力》露西｜暴力》粪怪）＆！空》露西）", null, 2), true);
  assert.equal(matches("！！[短促刺击]》露西", 2, null), true);
});

test("an or-rule is used when the preceding rule fails", () => {
  const run = machine(sourceFor(
    "执念》露西:", "    +flag: competing",
    "执念》露西 | （[短促刺击]》粪怪 & !空》露西）:", "    +flag: alternative",
  ));
  run.place("露西", 1);
  run.place("粪怪", 2);
  run.start("确认");
  assert.deepEqual([...run.view().state.flags], [["competing", true]]);
  run.reset();
  run.place("露西", 3);
  run.place("粪怪", 2);
  run.start("确认");
  assert.deepEqual([...run.view().state.flags], [["alternative", true]]);
});

test("condition expression errors validate each leaf and identify a missing parenthesis", () => {
  for (const [expression, code] of [
    ["（执念》露西 | ！暴力》粪怪", "InvalidConstraint"],
    ["执念》露西 |", "InvalidConstraint"],
    ["执念》露西）", "InvalidConstraint"],
    ["执念》露西 & （执念》露西）", "DuplicateConstraint"],
    ["执念》露西 | ！（暴力》错误）", "UnknownSlot"],
    ["执念》露西 | ！（未知》粪怪）", "UnknownTag"],
  ]) {
    const result = compile(sourceFor(`${expression}:`, "    @exit"), example.config, "表达式.txt");
    assert.equal(result.ok, false, expression);
    assert.ok(result.diagnostics.some((entry) => entry.code === code && entry.file === "表达式.txt" && entry.line === 3), JSON.stringify(result.diagnostics));
  }
});

test("battle dispatch falls through, jumps discard continuation, and shop waits for close", () => {
  const run = machine(sourceFor(
    "    +flag: tentative", "    @battle monster1?",
    "    》胜利", "        +item: 乌鸦口罩", "    》失败", "        @jump over",
    "    @shop eddie", "    -flag: tentative", "    @battle monster1", "    -item: 乌鸦口罩", "    @exit",
    "[over]", "其他:", "    @jump root",
  ));
  run.start("确认");
  assert.equal(run.view().state.flags.size, 0);
  run.resume("逃跑");
  assert.equal(run.view().error.code, "UnhandledReturnValue");
  assert.equal(run.view().state.flags.size, 0);
  run.start("确认");
  run.resume("失败");
  assert.equal(run.view().pending, null);
  assert.equal(run.view().state.flags.get("tentative"), true);
  run.reset();
  run.start("确认");
  run.resume("胜利");
  assert.equal(run.view().pending.command, "shop");
  run.resume("关闭商店");
  assert.equal(run.view().pending.command, "battle");
  run.resume("失败");
  assert.equal(run.view().closed, true);
  assert.equal(run.view().state.flags.get("tentative"), false);
  assert.equal(run.view().state.items.get("乌鸦口罩"), 0);
});

test("cycles and missing resources roll back, and removal prefers placed copies in declared slot order", () => {
  const cycle = machine(sourceFor("    +flag: drafted", "    @jump a", "[a]", "其他:", "    @jump b", "[b]", "其他:", "    @jump a"));
  cycle.start("确认");
  assert.equal(cycle.view().error.code, "JumpLimit");
  assert.match(cycle.view().error.message, /a → b → a/u);
  assert.equal(cycle.view().state.flags.size, 0);
  const config = structuredClone(example.config);
  config.initial.deck.push("肉块", "肉块");
  const run = machine(sourceFor("    -card: 肉块", "    +card: 处决", "》失败测试", "    -card: 肉块", "    -item: 乌鸦口罩"), config);
  run.place("粪怪", 5);
  run.place("露西", 6);
  run.start("确认");
  assert.deepEqual(run.view().state.deck.map(({ instanceId }) => instanceId), [1, 2, 3, 4, 5, 7]);
  assert.equal(run.view().placements.size, 0);
  run.place("粪怪", 5);
  run.start("失败测试");
  assert.equal(run.view().error.code, "MissingItem");
  assert.equal(run.view().placements.get("粪怪"), 5);
  const missing = machine(sourceFor("    +flag: tentative", "    -card: 处决"));
  missing.start("确认");
  assert.equal(missing.view().error.code, "MissingCard");
  assert.equal(missing.view().state.flags.size, 0);
});

test("the user's two-Tab format matches and displays return text in the same operation", () => {
  const source = [
    "三只粪怪正缓缓逼近一个蜷缩在地上的女人。", "她似乎已经失去了逃跑的勇气。", "",
    "#露西 #粪怪", "", "》确认", "执念》露西 & 暴力》粪怪:",
    "\t你将女人护在身后，迎击粪怪。", "\t@battle monster1?",
    "\t》胜利", "\t\t胜利结果描述", "\t》失败", "\t\t失败结果描述", "", "》离开",
  ].join("\n");
  const { panel, ok } = compile(source, example.config);
  assert.ok(ok);
  assert.equal(panel.groups.length, 0);
  assert.equal(panel.operations[0].rules.length, 1);
  const run = create(panel, example.config);
  run.start("确认");
  assert.equal(run.view().error.code, "NoMatch");
  run.place("露西", 1);
  run.place("粪怪", 2);
  run.start("确认");
  run.resume("失败");
  assert.ok(run.view().trace.some(({ text }) => text === "失败结果描述"));
  assert.equal(run.view().closed, false);
  run.start("离开");
  assert.equal(run.view().closed, true);
});

test("nested options reopen the original slots empty and jump with the newly placed cards", () => {
  const run = machine(readFileSync(path.join(__dirname, "fixtures/action-event-choice.txt"), "utf8"));
  run.place("露西", 1);
  run.start("确认");
  assert.equal(run.view().pending.command, "choice");
  assert.deepEqual(run.view().pending.choices, ["选项1", "选项2"]);
  assert.ok(run.view().trace.some(({ text }) => text === "第一次执念后，情况依然危险"));
  assert.deepEqual(run.view().slots.map(({ id }) => id), ["露西", "粪怪"]);
  assert.equal(run.view().placements.size, 0);
  run.place("露西", 1);
  run.place("粪怪", 3);
  run.resume("未知选项");
  assert.equal(run.view().placements.get("粪怪"), 3);
  run.place("粪怪", null);
  assert.equal(run.view().placements.has("粪怪"), false);
  run.place("粪怪", 2);
  assert.equal(run.view().pending.command, "choice");
  run.resume("选项1");
  assert.equal(run.view().pending.target, "monster1");
  run.resume("胜利");
  assert.equal(run.view().state.flags.get("露西获救"), true);
  assert.ok(run.view().state.deck.some(({ cardId }) => cardId === "处决"));
  assert.equal(run.view().closed, true);

  run.reset();
  run.place("露西", 1);
  run.start("确认");
  run.resume("选项1");
  assert.ok(run.view().trace.some(({ text }) => text === "这样的行动似乎没有意义。"));
  assert.equal(run.view().closed, false);
  run.place("露西", 1);
  run.start("确认");
  run.resume("选项2");
  assert.equal(run.view().closed, true);
  assert.ok(!run.view().trace.some(({ text }) => text === "跳转至 options"));
});

test("a declared slot layout is inherited through choices and restored at the root", () => {
  const run = machine(sourceFor(
    "执念》露西:", "    #露西 #追兵", "    +card: 处决",
    "    》继续", "    执念》露西 & [处决]》追兵:", "        》确认方案", "            @jump outcome",
    "[outcome]", "空》粪怪:", "    +flag: wrong",
    "[处决]》追兵:", "    +flag: matched", "    @jump root",
  ));
  run.place("露西", 1);
  run.place("粪怪", 2);
  run.start("确认");
  assert.deepEqual(run.view().slots.map(({ id }) => id), ["露西", "追兵"]);
  assert.equal(run.view().placements.size, 0);
  const granted = run.view().deck.find(({ cardId }) => cardId === "处决");
  assert.ok(granted);
  assert.ok(!run.view().state.deck.some(({ cardId }) => cardId === "处决"));
  run.place("露西", 1);
  run.place("追兵", granted.instanceId);
  run.resume("继续");
  assert.equal(run.view().placements.size, 0);
  run.place("追兵", granted.instanceId);
  run.resume("确认方案");
  assert.deepEqual([...run.view().state.flags], [["matched", true]]);
  assert.deepEqual(run.view().slots.map(({ id }) => id), ["露西", "粪怪"]);
  assert.equal(run.view().placements.size, 0);
});

test("invalid or duplicate nested slot declarations report source diagnostics", () => {
  for (const [line, code] of [["#追兵 敌人", "InvalidSlots"], ["#追兵 #追兵", "Duplicate"]]) {
    const result = compile(sourceFor(`    ${line}`, "    》继续", "        @exit"), example.config);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((entry) => entry.code === code && entry.line === 3));
  }
});

test("choices nest, and jumping replaces the continuation of all enclosing branches", () => {
  const source = sourceFor(
    "    @battle monster1?", "    》胜利", "        +flag: won",
    "    》继续调查", "        调查正文", "        》看一眼", "            +flag: seen",
    "        》走近看看", "            @jump next", "            +flag: skipped",
    "        +flag: followed", "    +flag: end",
    "[next]", "其他:", "    +flag: arrived",
  );
  const run = machine(source);
  const choose = (option) => {
    run.start("确认");
    run.resume("胜利");
    assert.deepEqual(run.view().pending.choices, ["继续调查"]);
    run.resume("继续调查");
    assert.deepEqual(run.view().pending.choices, ["看一眼", "走近看看"]);
    run.resume(option);
  };
  choose("看一眼");
  assert.deepEqual([...run.view().state.flags.keys()], ["won", "seen", "followed", "end"]);
  run.reset();
  choose("走近看看");
  assert.deepEqual([...run.view().state.flags.keys()], ["won", "arrived"]);

  for (const [code, lines] of [
    ["Duplicate", ["    》继续", "        @exit", "    》继续", "        @exit"]],
    ["UnknownGroup", ["    》继续", "        @jump missing"]],
    ["EmptyBlock", ["    》继续"]],
  ]) {
    const result = compile(sourceFor(...lines), example.config);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((entry) => entry.code === code));
  }
});

test("options can directly match cards at any depth with the same syntax as the root", () => {
  const lines = ["#露西 #粪怪", "》确认", "执念》露西:"];
  for (let level = 1; level <= 128; level++) {
    const indent = "\t".repeat(level);
    lines.push(`${indent}》第${level}层`, `${indent}暴力》粪怪:`);
  }
  lines.push("\t".repeat(129) + "@exit");
  const run = machine(lines.join("\n"));
  run.place("露西", 1);
  run.place("粪怪", 2);
  run.start("确认");
  for (let level = 1; level <= 128; level++) {
    assert.deepEqual(run.view().pending.choices, [`第${level}层`]);
    run.place("粪怪", 2);
    run.resume(`第${level}层`);
  }
  assert.equal(run.view().closed, true);

  run.reset();
  run.place("露西", 1);
  run.start("确认");
  run.resume("第1层");
  assert.equal(run.view().error.code, "NoMatch");
  assert.equal(run.view().closed, false);
});
