import { Quaternion, Vector3 } from "three";
import "./game-shell.css";
import "./compact-workshop.css";
import { attachDirectDrag } from "./direct-drag";
import {
  experimentResult,
  experimentLabels,
  type ExperimentGoal,
} from "./open-experiment";
import { taskPuzzle, sequenceFrames } from "./puzzles";
import { uiIcon } from "./ui";
import type { CaseAssets } from "./assets";
import { WorkshopScene } from "./scene";
import { poseError, type Pose, type Poses, type Tool, type Axis } from "./core";
import { referenceCase, type Prediction } from "./prediction";
import {
  CHALLENGE_KEY,
  taskCards,
  freshChallenge,
  validateChallenge,
  referenceOption,
  expectedJudgement,
  moveChallenge,
  nudgePose,
  checkChallengeTooth,
  advanceChallenge,
  replayPoses,
  type ChallengeState,
} from "./challenge";

import {
  referenceMatch,
  freshBook,
  validateBook,
  recordAttempt,
  restoreAttempt,
  type Attempt,
  type AttemptBook,
} from "./experiment";

export function mountPrediction(
  app: HTMLElement,
  assets: CaseAssets,
  reference: Prediction,
  onExit: () => void,
) {
  const data = referenceCase(
      reference,
      assets.manifest,
      Object.fromEntries(assets.assets.map((a) => [a.id, a.pivot])),
    ),
    cards = taskCards(data);
  let key = CHALLENGE_KEY,
    state: ChallengeState = localStorage.getItem(key)
      ? validateChallenge(JSON.parse(localStorage.getItem(key)!), data)
      : freshChallenge(data);
  let selected =
      cards[Math.min(state.card, 8)].find(
        (id) => !state.checked.includes(id),
      ) ?? cards[Math.min(state.card, 8)][0],
    peer: string | null = null,
    tool: Tool = "translate",
    axis: Axis = "X",
    fine = false,
    hint = state.card === 0,
    holdReference = false,
    sound = false,
    disposed = false,
    feedback = "",
    mode: "current" | "A" | "B" | "replay" | "attempt" | "sample" = "current",
    replayIndex = 0,
    compare: WorkshopScene | null = null,
    split = 50,
    comparisonFrame = 0,
    dragging = false,
    curtainDragging = false;
  let showHandles = false,
    directCancel = () => {};
  let lab: {
    id: string;
    card: number;
    goal: ExperimentGoal;
    baseline: Pose;
  } | null = null;
  let trial: { id: string; pose: Pose; sign: number } | null = null,
    sampleSeen = false,
    sequenceIndex = -1;
  let panel: "task" | "plans" | "replay" | null = null,
    planCompare: Attempt | null = null,
    book: AttemptBook = freshBook(data),
    bookWarning = "",
    bookInvalid = false;
  const visited = new Set<string>(),
    undo: Array<{ before: ChallengeState; after: ChallengeState }> = [],
    redo: typeof undo = [];
  let repeatTimer: ReturnType<typeof setInterval> | undefined,
    holdTimer: ReturnType<typeof setTimeout> | undefined,
    audio: AudioContext | undefined;
  const esc = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const b = (text: string, action: string) => {
    const labels: Record<string, string> = {
      translate: "挪位置 · G",
      rotate: "转方向 · R",
      minus: "−",
      plus: "＋",
      cancel: "取消 · Esc",
      check: "核对",
    };
    const tips: Record<string, string> = {
      translate: "挪位置（G）",
      rotate: "转方向（R）",
      minus: "反向微调，可长按",
      plus: "正向微调，可长按",
      hold: "按住查看参考（H）",
      focus: "放大选中牙（F）",
    };
    const keycaps: Record<string, string> = {
      translate: "G",
      rotate: "R",
      cancel: "Esc",
    };
    const label = labels[action] ?? text;
    return `<button data-int-action="${action}" title="${tips[action] ?? text}" aria-label="${tips[action] ?? text}"${["undo", "redo"].includes(action) ? ' data-icon-only="true"' : ""}>${uiIcon(action)}<span class="button-copy">${keycaps[action] ? label.replace(/ · (G|R|Esc)$/, "") : label}</span>${keycaps[action] ? `<kbd>${keycaps[action]}</kbd>` : ""}</button>`;
  };
  app.innerHTML = `<main class="interaction-workshop compact-workshop"><header class="compact-progress"><button data-int-action="panel-task" id="int-task-line" aria-label="查看当前任务"></button><span id="int-total"></span><progress id="int-case-progress" max="28" value="0" aria-label="病例进度"></progress><details id="int-tools"><summary>${uiIcon("settings")}<span>工具</span></summary><div class="compact-tools-content">${b("任务详情", "task-details")}${b("参考轮廓", "hint")}${b("按住查看参考", "hold")}${b("双牙对照", "pair")}${b("前后滑帘", "compare")}${b("声音：关", "sound")}${b("方案试验", "panel-plans")}${b("操作回放", "replay")}${b("导出记录", "export")}${b("全屏", "fullscreen")}${b("返回首页", "exit")}<details><summary>查看数值</summary><section id="int-match" aria-label="当前参考匹配"><div><span id="int-score-label">当前任务 · 参考匹配</span><strong id="int-score">0.00</strong><small>/ 100</small></div><div id="int-score-meter" role="progressbar" aria-label="参考匹配指数" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div><p id="int-score-detail"></p><p id="int-best"></p></section></details><div hidden><span id="int-batch"></span><h2 id="int-heading"></h2></div></div></details></header><section class="int-layout"><div class="int-stage"><div id="int-viewport"><div id="int-compare-canvas"></div><div id="int-tooth-label"></div><div id="int-mode-banner" role="status"></div><div id="int-motion-cue" role="status" hidden></div><div id="int-divider" hidden role="slider" aria-label="拖动对比线" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" tabindex="0"></div><div id="int-curtain" hidden><span>原始</span><span>当前</span><input aria-label="前后对比滑帘" type="range" min="0" max="100" value="50"></div></div><section class="int-controls compact-adjust" id="int-adjust-panel" hidden aria-label="牙齿操作"><div class="int-toolbar">${b("挪位置", "translate")}${b("转方向", "rotate")}</div><p>拖动牙齿调整；拖动空白处旋转视角。</p><details><summary>精细调整</summary><div class="int-toolbar"><label>世界轴 <select id="int-axis" aria-label="调整轴"><option>X</option><option>Y</option><option>Z</option></select></label><label><input id="int-fine" type="checkbox">细调</label></div><p id="int-instruction"></p><div class="int-toolbar">${b("− 反向（可长按）", "minus")}${b("＋ 正向（可长按）", "plus")}${b("取消拖动 · Esc", "cancel")}${b("撤销", "undo")}${b("重做", "redo")}</div><div class="int-toolbar">${b("先预览反向一步", "preview-minus")}${b("先预览正向一步", "preview-plus")}${b("应用试步", "apply-trial")}</div><p id="int-readout"></p><label><input id="int-handles" type="checkbox">显示轴向手柄</label></details></section></div><section id="int-task-panel" class="int-floating-panel" aria-label="任务面板"><div class="int-panel-heading"><strong>任务档案</strong>${b("收起", "close-panel")}</div><aside id="int-sidebar"></aside></section><section id="int-plans-panel" class="int-floating-panel" aria-label="方案试验台" hidden><div class="int-panel-heading"><strong>方案试验台</strong>${b("收起", "close-panel")}</div><div class="int-plan-actions">${b("保存当前尝试", "save-attempt")}${b("恢复个人最佳", "restore-best")}</div><section class="int-open-lab" aria-label="开放试验"><strong>开放试验 · 不要求唯一终点</strong><p>选择过程目标：将所选差距缩小至少 40%，另一项不变差。达成后可保存当前尝试；最终核对仍使用原参考。</p><label>试验目标<select id="int-lab-goal" aria-label="试验目标"><option value="position">先改善位置，保持方向</option><option value="rotation">先改善方向，保持位置</option><option value="balanced">位置与方向一起改善</option></select></label>${b("开始开放试验", "start-lab")}<p id="int-lab-status" role="status"></p></section><p id="int-book-warning" role="status"></p><div id="int-plans"></div><details><summary>匹配指数如何计算</summary><p>分别计算本任务牙齿与预测参考的位置、角度均方根误差；按初始差距归一化（下限为软件容差），比较合计差距得到 0—100 指数。指数只表示参考差距，逐牙核对仍须同时满足位置和方向条件。自动保留本任务指数最高的尝试，手动保留最近 12 份方案。</p></details></section></section><section class="int-replay int-floating-panel" id="int-replay-panel" aria-label="回放面板" hidden><div class="int-panel-heading"><strong>操作时间轴与自评</strong>${b("收起", "close-panel")}</div><div class="int-toolbar">${b("从起点回看", "replay-start")}${b("回到实际进度", "return-live")}${b("另开一次练习", "retry")}</div><label>拖动回看 <input id="int-timeline" aria-label="操作时间轴" type="range" min="0" value="0" max="0"></label><p id="int-replay-label"></p><ol id="int-events"></ol><p id="int-stats"></p><p class="reference-note">回放只读；新练习使用独立存档。时间轴保留最近 400 个操作，之前的操作合入起点。</p></section><p id="int-feedback" role="status"></p><nav class="compact-dock" aria-label="核心操作">${b("调整", "adjust")}<details id="int-view-menu"><summary>${uiIcon("eye")}<span>视角</span></summary><div class="int-viewbar">${b("整体看", "view-overview")}${b("从上面看", "view-occlusal")}${b("换个角度", "view-front")}${b("另一侧", "view-side")}${b("放大观察", "focus")}${b("退远一点", "zoom")}</div></details>${b("核对这颗", "check")}</nav><button class="compact-return" data-int-action="current" hidden>${uiIcon("cancel")}返回操作</button></main>`;
  document.body.dataset.screen = "play";
  document.body.classList.add("interaction-mode");
  const get = <T extends HTMLElement = HTMLElement>(s: string) =>
    app.querySelector<T>(s)!;
  const button = (a: string) =>
    get<HTMLButtonElement>(`[data-int-action="${a}"]`);
  function loadBook() {
    bookWarning = "";
    bookInvalid = false;
    try {
      const raw = localStorage.getItem(key + ":attempts");
      book = raw ? validateBook(JSON.parse(raw), data) : freshBook(data);
    } catch {
      book = freshBook(data);
      bookInvalid = true;
      bookWarning =
        "方案记录无法读取，原文保留。可导出记录；当前病例进度仍可继续。";
    }
  }
  function saveBook(next: AttemptBook) {
    if (bookInvalid) return false;
    try {
      localStorage.setItem(key + ":attempts", JSON.stringify(next));
      book = next;
      bookWarning = "";
      return true;
    } catch {
      bookWarning = "方案保存失败；病例进度仍保留。请检查浏览器存储后重试。";
      return false;
    }
  }
  function rememberBest() {
    if (
      bookInvalid ||
      state.card >= cards.length ||
      !state.observed.includes(state.card)
    )
      return;
    const next = recordAttempt(data, book, state, false);
    if (JSON.stringify(next) !== JSON.stringify(book)) saveBook(next);
  }
  loadBook();
  const scene = new WorkshopScene(get("#int-viewport"), false);
  scene.touchEditing = true;
  scene.load(assets, state.poses);
  scene.setGuide(null);
  function fitWorkbench() {
    scene.scene.updateMatrixWorld(true);
    scene.camera.updateMatrixWorld(true);
    const bounds = scene.projectedTeethBounds(),
      factor = Math.max(
        1,
        (bounds.right - bounds.left) / (scene.host.clientWidth * 0.84),
        (bounds.bottom - bounds.top) / (scene.host.clientHeight * 0.6),
      );
    if (factor > 1.02) scene.zoom(factor);
  }
  scene.onResize = fitWorkbench;
  fitWorkbench();
  scene.onFailure = (message) => {
    feedback = message;
    hud();
  };
  const done = () => state.card === cards.length;
  const group = () => cards[Math.min(state.card, cards.length - 1)];
  const editable = () =>
    !done() &&
    state.observed.includes(state.card) &&
    mode === "current" &&
    !holdReference &&
    !compare &&
    !state.checked.includes(selected) &&
    !!state.judgements[selected];
  function stopRepeat() {
    clearTimeout(holdTimer);
    clearInterval(repeatTimer);
    holdTimer = repeatTimer = undefined;
  }
  function stopCompare() {
    cancelAnimationFrame(comparisonFrame);
    compare?.dispose();
    compare = null;
    get("#int-curtain").hidden = true;
    get("#int-divider").hidden = true;
    curtainDragging = false;
  }
  function cancel() {
    stopRepeat();
    directCancel();
    curtainDragging = false;
    scene.cancelDrag();
    trial = null;
    dragging = false;
    holdReference = false;
    apply();
    hud();
  }
  function persist(next: ChallengeState) {
    try {
      validateChallenge(next, data);
      localStorage.setItem(key, JSON.stringify(next));
      state = next;
      return true;
    } catch (e) {
      feedback = `保存失败，刚才更改未应用。${e instanceof Error ? e.message : ""}`;
      apply();
      hud();
      return false;
    }
  }
  function commit(next: ChallengeState, record = true) {
    const before = structuredClone(state);
    if (!persist(next)) return false;
    if (record) {
      undo.push({ before, after: structuredClone(next) });
      redo.length = 0;
    }
    rememberBest();
    apply();
    hud();
    return true;
  }
  function displayPoses(): Poses {
    if (mode === "sample") {
      const sample =
        state.card === 7
          ? sequenceFrames(data, state.card)[Math.max(0, sequenceIndex)]
          : taskPuzzle(data, state.card).sample;
      return {
        ...structuredClone(state.poses),
        ...Object.fromEntries(
          group().map((id) => [id, sample?.[id] ?? data.original[id]]),
        ),
      };
    }
    if (mode === "attempt" && planCompare)
      return {
        ...structuredClone(state.poses),
        ...structuredClone(planCompare.poses),
      };
    if (mode === "replay") return replayPoses(state, replayIndex);
    if (mode === "A" || mode === "B") {
      const poses = structuredClone(state.poses),
        target = mode === referenceOption(state.card);
      for (const id of group())
        poses[id] = structuredClone(
          target ? data.target[id] : data.original[id],
        );
      return poses;
    }
    return state.poses;
  }
  function apply() {
    trial = null;
    scene.apply(displayPoses());
    scene.setTaskTeeth(mode === "current" && !done() ? group() : []);
    scene.setCompletedTeeth(mode === "current" && !done() ? state.checked : []);
    scene.setFixedTeeth([]);
    scene.select(
      selected,
      editable(),
      tool,
      editable() && showHandles ? ["X", "Y", "Z"] : [],
    );
    scene.setGuide(
      editable() && showHandles ? { id: selected, axis, sign: 1, tool } : null,
    );
    scene.ghostsAt(
      mode === "current" && (hint || holdReference)
        ? Object.fromEntries(
            [selected, ...(peer ? [peer] : [])].map((id) => [
              id,
              data.target[id],
            ]),
          )
        : null,
    );
    if (peer) {
      scene.outline.selectedObjects.push(scene.teeth.get(peer)!);
      scene.dirty = true;
    }
  }
  scene.onSelect = (id) => {
    if (mode !== "current" || compare || holdReference) return;
    if (!group().includes(id) || done()) {
      feedback = "这颗在其他任务中，已锁定以保留连续进度。点“返回任务牙”继续。";
      hud();
      return;
    }
    if (peer === selected) {
      peer = id;
      feedback = `双牙对照：文件 ${selected} 与 ${id}。只读对照，不会一起移动。`;
    } else {
      selected = id;
      feedback = state.checked.includes(id)
        ? "这颗已核对锁定，可以观察。"
        : !state.observed.includes(state.card)
          ? "先从两个角度观察，点击顶部任务提交判断。"
          : !state.judgements[id]
            ? "先留下操作判断，再开始调整。"
            : "拖动牙齿调整；松手保存，Esc 取消。";
      if (
        state.observed.includes(state.card) &&
        !state.judgements[id] &&
        !state.checked.includes(id)
      )
        panel = "task";
    }
    apply();
    hud();
  };
  function move(pose: Pose, label: string) {
    if (!editable()) return;
    trial = null;
    const before = poseError(state.poses[selected], data.target[selected]),
      after = poseError(pose, data.target[selected]);
    const metric = tool === "translate" ? "position" : "rotation",
      delta = after[metric] - before[metric];
    feedback =
      delta < -1e-6
        ? `${tool === "translate" ? "位置" : "方向"}更接近参考了。`
        : delta > 1e-6
          ? "刚才这一步更远了，可立即撤销或反向微调。"
          : "这一项几乎未变化。";
    try {
      commit(moveChallenge(data, state, selected, pose, label));
    } catch (e) {
      feedback = String(e);
      apply();
      hud();
    }
  }
  scene.onPreview = (_id, pose) => {
    trial = null;
    dragging = true;
    updateMatch({ ...state.poses, [selected]: pose }, true);
    button("save-attempt").disabled = true;
    const e = poseError(pose, data.target[selected]);
    get("#int-readout").textContent =
      `预览 · 位置 ${e.position.toFixed(3)} u / 方向 ${e.rotation.toFixed(2)}° · 松手后保存`;
    const active = scene.transform.axis;
    if (active === "X" || active === "Y" || active === "Z") {
      const i = ["X", "Y", "Z"].indexOf(active),
        before = state.poses[selected];
      const q = new Quaternion(...pose.quaternion).multiply(
        new Quaternion(...before.quaternion).invert(),
      );
      const direction =
        tool === "translate"
          ? pose.translation[i] - before.translation[i]
          : [q.x, q.y, q.z][i] * (q.w < 0 ? -1 : 1);
      scene.setGuide({
        id: selected,
        axis: active,
        sign: Math.sign(direction) || 1,
        tool,
      });
    }
    scene.ghostsAt({ [selected]: state.poses[selected] });
    get("#int-mode-banner").textContent = "拖动预览 · 松手保存 / Esc 取消";
  };
  scene.onCommit = (id, before, after) => {
    dragging = false;
    if (id !== selected || !editable()) {
      apply();
      hud();
      return;
    }
    if (
      poseError(before, after).position < 1e-8 &&
      poseError(before, after).rotation < 1e-5
    ) {
      apply();
      hud();
      return;
    }
    move(after, tool === "translate" ? "拖动位置手柄" : "拖动旋转环");
  };
  function nudge(sign: number) {
    if (editable()) {
      move(
        nudgePose(state.poses[selected], tool, axis, sign, fine),
        `${fine ? "细调" : "粗调"} ${axis}${sign > 0 ? "+" : "−"} ${tool === "translate" ? "位置" : "方向"}`,
      );
      scene.setGuide({ id: selected, axis, sign, tool });
    }
  }
  function feedbackSound() {
    if (!sound) return;
    try {
      audio ??= new AudioContext();
      void audio.resume();
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.frequency.value = 660;
      g.gain.setValueAtTime(0.04, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.14);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.15);
    } catch {
      /* Sound is optional. */
    }
  }
  function updateMatch(poses = displayPoses(), preview = false) {
    const ids =
        mode === "attempt" && planCompare ? cards[planCompare.card] : group(),
      m = referenceMatch(data, poses, ids),
      best = book.best[String(state.card)];
    get("#int-score-label").textContent = preview
      ? "拖动预览 · 松手保存"
      : mode !== "current" || compare
        ? "只读画面 · 参考匹配"
        : "当前任务 · 参考匹配";
    get("#int-score").textContent = m.score.toFixed(2);
    get("#int-match").style.setProperty("--match-angle", `${m.score * 3.6}deg`);
    get("#int-score-meter").setAttribute("aria-valuenow", String(m.score));
    get<HTMLElement>("#int-score-meter span").style.width = `${m.score}%`;
    get("#int-score-detail").textContent =
      `位置 ${m.position.toFixed(3)} u · 方向 ${m.rotation.toFixed(2)}°`;
    get("#int-best").textContent = bookWarning
      ? "方案记录未保存 · 请打开方案面板查看"
      : done()
        ? "全部 28 颗已核对 · 可回看自己的操作"
        : best
          ? `本任务个人最佳 ${referenceMatch(data, best.poses, group()).score.toFixed(2)} · 已核对 ${group().filter((id) => state.checked.includes(id)).length}/${group().length}`
          : "试着调整一颗牙，观察位置与方向反馈";
  }
  function drawPanels() {
    for (const p of ["task", "plans", "replay"] as const) {
      get(`#int-${p}-panel`).hidden = panel !== p;
    }
    button("panel-task").setAttribute("aria-pressed", String(panel === "task"));
    button("panel-task").setAttribute(
      "aria-expanded",
      String(panel === "task"),
    );
    for (const p of ["task", "plans", "replay"])
      get(`#int-${p}-panel`).setAttribute("role", "dialog");
    button("panel-plans").setAttribute(
      "aria-pressed",
      String(panel === "plans"),
    );
    button("replay").setAttribute("aria-pressed", String(panel === "replay"));
    button("current").hidden = mode === "current" && !compare;
    button("save-attempt").disabled =
      bookInvalid ||
      done() ||
      !state.observed.includes(state.card) ||
      mode !== "current" ||
      !!compare ||
      holdReference ||
      dragging;
    button("restore-best").disabled =
      bookInvalid || !book.best[String(state.card)] || done();
    button("start-lab").disabled = !editable() || dragging;
    if (lab && lab.card === state.card) {
      const result = experimentResult(
        lab.baseline,
        state.poses[lab.id],
        data.target[lab.id],
        lab.goal,
      );
      get("#int-lab-status").textContent =
        `文件 ${lab.id} · ${experimentLabels[lab.goal]}：${mode !== "current" || compare ? "只读画面，结果仍按实际进度计算。" : ""}${result.achieved ? "试验目标达成！可以保存当前尝试。" : "尚未达成，可以试步、撤销或改用细调。"} 位置需 ≤ ${result.positionLimit.toFixed(3)} u；方向需 ≤ ${result.rotationLimit.toFixed(2)}°。`;
    } else
      get("#int-lab-status").textContent =
        "从当前选中牙的实际状态开始；这项过程试验不锁定唯一位姿。";
    get("#int-book-warning").textContent = bookWarning;
    const items = [
      ...(book.best[String(state.card)] ? [book.best[String(state.card)]] : []),
      ...book.entries.slice().reverse(),
    ].filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i);
    get("#int-plans").innerHTML = items.length
      ? items
          .map((a) => {
            const m = referenceMatch(data, a.poses, cards[a.card]);
            return `<article class="int-plan"><div><strong>${esc(a.name)}</strong><small>任务 ${a.card + 1} · ${m.score.toFixed(2)} / 100</small></div><p>位置 ${m.position.toFixed(3)} u · 方向 ${m.rotation.toFixed(2)}°</p><div class="int-toolbar">${b("只读查看", "view-attempt-" + a.id)}${a.card === state.card ? b("恢复继续", "restore-attempt-" + a.id) : ""}</div></article>`;
          })
          .join("")
      : "<p>先完成观察，再保存一个自己的尝试。你可以保留不同调整顺序的结果，比较后恢复继续。</p>";
  }
  function hud() {
    if (disposed) return;
    const puzzle = taskPuzzle(data, Math.min(state.card, 8));
    const observed = state.observed.includes(state.card),
      e = poseError(state.poses[selected], data.target[selected]);
    get("#int-batch").textContent =
      `${key === CHALLENGE_KEY ? "正式挑战" : "独立重试"} · 第 ${Math.min(3, Math.floor(state.card / 3) + 1)} 批 · 同一病例`;
    get("#int-heading").textContent = done()
      ? "28 颗参考挑战完成"
      : `短任务 ${state.card + 1} / ${cards.length} · ${group().length} 颗`;
    get("#int-total").textContent = `${state.checked.length}/28`;
    get<HTMLProgressElement>("#int-case-progress").value = state.checked.length;
    get("#int-task-line").textContent = done()
      ? "挑战完成 · 回看成果"
      : `${state.card + 1}/${cards.length} · ${observed ? (group().every((id) => state.checked.includes(id)) ? "本任务完成 · 记录自评并继续" : "调整任务牙，然后核对") : puzzle.title} ›`;
    get("#int-task-line").setAttribute(
      "aria-expanded",
      String(panel === "task"),
    );
    get("#int-task-line").title = done() ? "查看完成记录" : puzzle.prompt;
    get("#int-instruction").textContent =
      `文件 ${selected} · ${tool === "translate" ? "拖动牙齿挪位置" : "左右拖动牙齿转方向"}。X 红 / Y 绿 / Z 蓝；空白处转动视角。${peer ? "双牙只作观察，手柄仍只调整选中牙。" : ""}`;
    get("#int-readout").textContent =
      `距参考：位置 ${e.position.toFixed(3)} u · 方向 ${e.rotation.toFixed(2)}°${peer ? ` ｜ 文件 ${peer}：${poseError(state.poses[peer], data.target[peer]).position.toFixed(3)} u / ${poseError(state.poses[peer], data.target[peer]).rotation.toFixed(2)}°` : ""}`;
    get("#int-feedback").textContent = feedback;
    get("#int-mode-banner").textContent = holdReference
      ? "按住查看参考 · 实际牙齿与进度不变"
      : mode === "sample"
        ? state.card === 7
          ? `只读顺序试验 ${sequenceIndex + 1}/6 · ${["起点", "先平移", "再旋转：终点 A", "回到起点", "先旋转", "再平移：终点 B"][sequenceIndex]} · 进度不变`
          : puzzle.sampleLabel + " · 进度不变"
        : mode === "attempt" && planCompare
          ? `只读查看${planCompare.name} · 任务 ${planCompare.card + 1} · 实际进度未改变`
          : mode === "replay"
            ? `只读回放 · 第 ${replayIndex} 步`
            : mode === "A" || mode === "B"
              ? `只读方案 ${mode} · 同一视角比较，不修改进度`
              : compare
                ? "前后滑帘 · 只读"
                : done()
                  ? "全部任务已完成"
                  : "";
    for (const a of ["preview-minus", "preview-plus"])
      button(a).disabled = !editable();
    button("apply-trial").hidden = !trial;
    button("apply-trial").disabled = !trial || !editable();
    for (const a of ["minus", "plus", "translate", "rotate", "check"])
      button(a).disabled = !editable();
    button("undo").disabled = mode !== "current" || !!compare || !undo.length;
    button("redo").disabled = mode !== "current" || !!compare || !redo.length;
    button("translate").setAttribute(
      "aria-pressed",
      String(tool === "translate"),
    );
    button("rotate").setAttribute("aria-pressed", String(tool === "rotate"));
    button("hint").setAttribute("aria-pressed", String(hint));
    button("pair").setAttribute("aria-pressed", String(!!peer));
    button("sound").textContent = `声音：${sound ? "开" : "关"}`;
    button("hold").disabled = mode !== "current" || !!compare;
    button("compare").textContent = compare ? "退出滑帘" : "前后滑帘";
    get("#int-sidebar").innerHTML = done()
      ? `<span class="eyebrow">完成记录</span><h2>全病例连续保存</h2><p>全部 28 颗已逐一核对到预测参考。可以回放自己的操作，或另开独立练习。</p>`
      : `<span class="eyebrow">${observed ? "动手调整" : "观察判断"}</span><h2>${observed ? `目标：核对 ${group().length} 颗牙` : puzzle.title}</h2><p>${observed ? "分别调整位置和方向，逐颗核对后写下本次自评。其余牙保持原样。" : puzzle.prompt + " 至少使用两个视角观察。"}</p><div class="int-toolbar">${b("看方案 A", "A")}${b("看方案 B", "B")}${puzzle.sample ? b(state.card === 7 ? "播放顺序试验" : "查看只读样例", "sample") : ""}${mode === "sample" && state.card === 7 ? b("下一步试验", "sequence-next") : ""}${b("返回实际进度", "return-live")}</div><p>${observed ? "观察判断已完成" : `已观察视角：${visited.size} / 2`}</p>${
          !observed
            ? `<label>你的判断 <select id="int-answer" aria-label="观察判断">${puzzle.options
                .map((o) => `<option value="${o.value}">${o.label}</option>`)
                .join("")}</select></label>${b("提交观察判断", "answer")}`
            : ""
        }<div class="int-task-list">${group()
          .map(
            (id) =>
              `<button data-int-action="select-${id}" data-tooth="${id}" aria-pressed="${selected === id}"><strong>${state.checked.includes(id) ? "✓" : "○"} 文件 ${id}</strong><small>${state.checked.includes(id) ? "已核对" : state.judgements[id] ? `我的判断：${({ translate: "挪位置", rotate: "转方向", both: "两项", none: "无需调整" } as Record<string, string>)[state.judgements[id]]}` : "点击选中，悬停辨认"}</small></button>`,
          )
          .join(
            "",
          )}</div>${observed ? `<div class="int-judgement"><label>文件 ${selected} 的操作前判断<select id="int-judgement" aria-label="牙齿判断"><option value="translate">需要平移</option><option value="rotate">需要旋转</option><option value="both">两者都需要</option><option value="none">无需调整</option></select></label>${b("留下判断标记", "judge")}</div><label>本次自评<select id="int-reflection" aria-label="任务自评"><option value="">请选择</option><option value="observe">换个视角帮助了我</option><option value="fine">细调与撤销帮助了我</option><option value="review">我还想再练一次</option></select></label>${b("保存自评，继续下一任务", "advance")}` : ""}<p class="reference-note">${b("返回任务牙", "return")} 当前任务外的牙锁定。容差为软件练习条件：0.075 u / 0.6°，不会改变旧关卡参数。</p>`;
    const reflection = app.querySelector<HTMLSelectElement>("#int-reflection");
    if (reflection)
      reflection.value = state.reflections[String(state.card)] ?? "";
    const judgement = app.querySelector<HTMLSelectElement>("#int-judgement");
    if (judgement) judgement.value = state.judgements[selected] ?? "both";
    const advance = app.querySelector<HTMLButtonElement>(
      '[data-int-action="advance"]',
    );
    if (advance)
      advance.disabled =
        !group().every((id) => state.checked.includes(id)) ||
        mode !== "current" ||
        !!compare;
    const timeline = get<HTMLInputElement>("#int-timeline");
    timeline.max = String(state.replay.length);
    timeline.value = String(
      mode === "replay" ? replayIndex : state.replay.length,
    );
    get("#int-replay-label").textContent =
      mode === "replay"
        ? replayIndex
          ? `第 ${replayIndex} 步 · 文件 ${state.replay[replayIndex - 1].id} · ${state.replay[replayIndex - 1].label}`
          : "回放起点"
        : `已记录 ${state.replay.length} 步；点击某步只读回看。`;
    get("#int-events").innerHTML = state.replay
      .map(
        (r, i) =>
          `<li>${b(`${i + 1}. 文件 ${r.id} · ${esc(r.label)}`, "replay-" + (i + 1))}</li>`,
      )
      .join("");
    updateMatch();
    drawPanels();
    get("#int-stats").textContent =
      `调整 ${state.stats.moves} 次 · 核对 ${state.stats.checks} 次 · 轮廓提示 ${state.stats.hints} 次 · 判断重试 ${state.stats.wrong} 次。次数用于回顾，不评价治疗优劣。`;
  }
  function showReplay(index: number) {
    cancel();
    stopCompare();
    mode = "replay";
    panel = "replay";
    get("#int-adjust-panel").hidden = true;
    replayIndex = Math.max(0, Math.min(state.replay.length, index));
    if (replayIndex) selected = state.replay[replayIndex - 1].id;
    apply();
    hud();
  }
  function toggleCompare() {
    cancel();
    if (compare) {
      stopCompare();
      apply();
      hud();
      return;
    }
    mode = "current";
    compare = new WorkshopScene(get("#int-compare-canvas"), false);
    compare.load(assets, data.original);
    compare.renderer.domElement.style.pointerEvents = "none";
    compare.orbit.enabled = false;
    get("#int-curtain").hidden = false;
    get("#int-divider").hidden = false;
    const sync = () => {
      if (!compare || disposed) return;
      compare.camera.copy(scene.camera);
      compare.orbit.target.copy(scene.orbit.target);
      compare.dirty = true;
      get("#int-divider").style.left = `${split}%`;
      get("#int-divider").setAttribute(
        "aria-valuenow",
        String(Math.round(split)),
      );
      get("#int-compare-canvas").style.clipPath =
        `inset(0 ${100 - split}% 0 0)`;
      comparisonFrame = requestAnimationFrame(sync);
    };
    sync();
    apply();
    hud();
  }
  function onClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (
      target.closest("#int-view-menu > summary") ||
      target.closest("#int-tools > summary")
    ) {
      panel = null;
      drawPanels();
      get("#int-adjust-panel").hidden = true;
      if (target.closest("#int-view-menu"))
        get<HTMLDetailsElement>("#int-tools").open = false;
      else get<HTMLDetailsElement>("#int-view-menu").open = false;
      return;
    }
    const el = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-int-action]",
    );
    if (!el || el.disabled) return;
    let a = el.dataset.intAction!;
    if (el.closest("#int-tools") && a !== "hold")
      get<HTMLDetailsElement>("#int-tools").open = false;
    if (a === "return-live") a = "current";
    if (a === "fullscreen") {
      if (document.fullscreenElement) void document.exitFullscreen();
      else
        void app.requestFullscreen().catch(() => {
          feedback = "浏览器未允许全屏；仍可使用完整工作台。";
          hud();
        });
      return;
    }
    if (a === "adjust") {
      panel = null;
      drawPanels();
      const surface = get("#int-adjust-panel");
      surface.hidden = !surface.hidden;
      button("adjust").setAttribute("aria-expanded", String(!surface.hidden));
      get<HTMLDetailsElement>("#int-tools").open = false;
      get<HTMLDetailsElement>("#int-view-menu").open = false;
      return;
    }
    if (a === "task-details") a = "panel-task";
    if (a === "panel-task" || a === "panel-plans") {
      const target = a === "panel-task" ? "task" : "plans";
      panel = panel === target ? null : target;
      get("#int-adjust-panel").hidden = true;
      drawPanels();
      return;
    }
    if (a === "close-panel") {
      panel = null;
      drawPanels();
      get("#int-task-line").focus();
      return;
    }
    if (a === "start-lab") {
      if (!editable() || dragging) return;
      const goal = get<HTMLSelectElement>("#int-lab-goal")
        .value as ExperimentGoal;
      const baseline = structuredClone(state.poses[selected]);
      const result = experimentResult(
        baseline,
        baseline,
        data.target[selected],
        goal,
      );
      if (!result.eligible) {
        feedback = "所选差距已在容差内，请选其他目标或另一颗任务牙。";
        hud();
        return;
      }
      lab = { id: selected, card: state.card, goal, baseline };
      feedback =
        "开放试验已开始：可以用不同方向和步长探索，不要求唯一终点；达成后可保存尝试。";
      hud();
      return;
    }
    if (a === "save-attempt") {
      if (
        dragging ||
        mode !== "current" ||
        compare ||
        holdReference ||
        done() ||
        !state.observed.includes(state.card)
      )
        return;
      const next = recordAttempt(data, book, state, true);
      feedback = saveBook(next)
        ? "当前尝试已保存。可以继续探索，再回来比较或恢复。"
        : bookWarning;
      hud();
      return;
    }
    if (
      a === "restore-best" ||
      a.startsWith("view-attempt-") ||
      a.startsWith("restore-attempt-")
    ) {
      const id = a.replace(/^(view|restore)-attempt-/, ""),
        attempt =
          a === "restore-best"
            ? book.best[String(state.card)]
            : [...book.entries, ...Object.values(book.best)].find(
                (p) => p.id === id,
              );
      if (!attempt) return;
      cancel();
      stopCompare();
      if (a.startsWith("view-")) {
        mode = "attempt";
        planCompare = attempt;
        panel = "plans";
        selected = cards[attempt.card][0];
        apply();
        hud();
        return;
      }
      if (
        attempt.card !== state.card ||
        !state.observed.includes(state.card) ||
        done()
      )
        return;
      try {
        const next = restoreAttempt(data, state, attempt);
        mode = "current";
        planCompare = null;
        selected = group()[0];
        feedback = `已恢复${attempt.name}；可撤销这次恢复。`;
        commit(next);
      } catch (e) {
        feedback = String(e);
        hud();
      }
      return;
    }

    if (a === "exit") {
      onExit();
      return;
    }
    if (a === "sound") {
      sound = !sound;
      feedbackSound();
      hud();
      return;
    }
    if (a === "cancel") {
      cancel();
      return;
    }
    if (a === "export") {
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                mode: key,
                reference_id: reference.reference_id,
                source_checksums: reference.source_checksums,
                state,
                attempts: book,
                unreadable_attempts: bookInvalid
                  ? localStorage.getItem(key + ":attempts")
                  : null,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "齿序工坊_观察挑战与回放.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    if (a.startsWith("view-")) {
      cancel();
      visited.add(a);
      scene.view(a.slice(5), assets.manifest);
      fitWorkbench();
      get<HTMLDetailsElement>("#int-view-menu").open = false;
      hud();
      return;
    }
    if (a === "zoom") {
      scene.zoom(1.2);
      return;
    }
    if (a === "focus") {
      scene.orbit.target.copy(scene.teeth.get(selected)!.position);
      scene.camera.position
        .copy(scene.orbit.target)
        .add(
          new Vector3(1, -1, 0.8).normalize().multiplyScalar(scene.size * 0.65),
        );
      scene.orbit.update();
      return;
    }
    if (a === "compare") {
      toggleCompare();
      return;
    }
    if (a === "hold") return;
    if (a === "replay" || a.startsWith("replay-")) {
      showReplay(
        a === "replay"
          ? state.replay.length
          : a === "replay-start"
            ? 0
            : Number(a.slice(7)),
      );
      return;
    }
    if (a === "current" || a === "A" || a === "B") {
      cancel();
      stopCompare();
      mode = a === "current" ? "current" : a;
      planCompare = null;
      if (a === "current")
        selected = group().includes(selected) ? selected : group()[0];
      hint = a !== "current" || state.card === 0;
      apply();
      if (a !== "current")
        scene.ghostsAt(
          Object.fromEntries(group().map((id) => [id, data.target[id]])),
        );
      hud();
      return;
    }
    if (a === "retry") {
      cancel();
      stopCompare();
      const original = state,
        next = structuredClone(state);
      for (const id of group()) {
        next.poses[id] = structuredClone(data.original[id]);
        next.checked = next.checked.filter((v) => v !== id);
        delete next.judgements[id];
      }
      next.card = Math.min(next.card, 8);
      next.observed = next.observed.filter((i) => i < next.card);
      next.reflections = {};
      next.stats = { moves: 0, checks: 0, hints: 0, wrong: 0 };
      next.replay = [];
      next.replayBase = structuredClone(next.poses);
      const previousKey = key;
      key = CHALLENGE_KEY + ":retry";
      if (!persist(next)) {
        key = previousKey;
        state = original;
        return;
      }
      loadBook();
      lab = null;
      panel = null;
      planCompare = null;
      selected = group()[0];
      mode = "current";
      visited.clear();
      sampleSeen = false;
      sequenceIndex = -1;
      undo.length = redo.length = 0;
      feedback = "已另开独立重试，正式进度保留。回首页重新进入可恢复正式挑战。";
      apply();
      hud();
      return;
    }
    if ((a === "sample" || a === "sequence-next") && !done()) {
      cancel();
      stopCompare();
      mode = "sample";
      if (state.card === 7)
        sequenceIndex = a === "sample" ? 0 : Math.min(5, sequenceIndex + 1);
      sampleSeen = state.card !== 7 || sequenceIndex === 5;
      selected = group()[0];
      apply();
      scene.ghostsAt(
        Object.fromEntries(group().map((id) => [id, data.target[id]])),
      );
      hud();
      return;
    }
    if (a === "answer" && (mode === "A" || mode === "B" || mode === "sample")) {
      mode = "current";
      apply();
    }
    if (mode !== "current" || compare || holdReference) return;
    if (a.startsWith("select-")) {
      cancel();
      scene.onSelect(a.slice(7));
      return;
    }
    if (a === "return") {
      peer = null;
      selected =
        group().find((id) => !state.checked.includes(id)) ?? group()[0];
      apply();
      hud();
      return;
    }
    if (a === "pair") {
      cancel();
      peer = peer ? null : selected;
      feedback = peer
        ? "现在点另一颗任务牙进行对照；再点“双牙对照”退出。"
        : "已退出双牙对照。";
      apply();
      hud();
      return;
    }
    if (a === "hint") {
      const next = structuredClone(state);
      if (!hint) next.stats.hints++;
      if (commit(next, false)) {
        hint = !hint;
        apply();
        hud();
      }
      return;
    }
    if (a === "answer") {
      if (visited.size < 2) {
        feedback = "先用至少两个视角观察，再提交判断。";
        hud();
        return;
      }
      const puzzle = taskPuzzle(data, state.card);
      if (puzzle.sample && !sampleSeen) {
        feedback =
          state.card === 7
            ? "先完成六步只读顺序试验，再提交判断。"
            : "先查看只读错例，再提交判断。";
        hud();
        return;
      }
      const answer = get<HTMLSelectElement>("#int-answer").value,
        correct = answer === puzzle.answer,
        next = structuredClone(state);
      if (correct) {
        next.observed.push(state.card);
        feedback =
          "观察通过。" + puzzle.explanation + " 先留下操作判断，再分别调整。";
        mode = "current";
      } else {
        next.stats.wrong++;
        feedback = "再观察一次：" + puzzle.prompt;
      }
      commit(next, false);
      return;
    }
    if (a === "judge") {
      const next = structuredClone(state);
      next.judgements[selected] =
        get<HTMLSelectElement>("#int-judgement").value;
      feedback = "已留下操作前判断；核对时会比较原始与参考的变化。";
      commit(next, false);
      return;
    }
    if (a === "advance") {
      const next = structuredClone(state);
      next.reflections[String(state.card)] =
        get<HTMLSelectElement>("#int-reflection").value;
      try {
        const advanced = advanceChallenge(data, next);
        if (commit(advanced, false)) {
          undo.length = redo.length = 0;
          visited.clear();
          sampleSeen = false;
          sequenceIndex = -1;
          selected = group()[0];
          panel = null;
          peer = null;
          hint = false;
          feedback = done()
            ? "全部任务已完成，可以回看你的调整过程。"
            : "上个任务结果连续保留，开始下一次观察。";
          apply();
          hud();
        }
      } catch (e) {
        feedback = String(e);
        hud();
      }
      return;
    }
    if (a === "undo" || a === "redo") {
      cancel();
      const from = a === "undo" ? undo : redo,
        to = a === "undo" ? redo : undo,
        item = from.at(-1);
      if (!item) return;
      const next = structuredClone(a === "undo" ? item.before : item.after);
      next.stats = structuredClone(state.stats);
      next.replayBase = structuredClone(state.replayBase);
      next.replay = structuredClone(state.replay);
      for (const id of group())
        if (
          JSON.stringify(next.poses[id]) !== JSON.stringify(state.poses[id])
        ) {
          next.replay.push({
            id,
            pose: structuredClone(next.poses[id]),
            label: a === "undo" ? "撤销" : "重做",
            time: new Date().toISOString(),
          });
        }
      while (next.replay.length > 400) {
        const r = next.replay.shift()!;
        next.replayBase[r.id] = r.pose;
      }
      if (commit(next, false)) {
        from.pop();
        to.push(item);
        feedback = a === "undo" ? "已撤销，可在时间轴回看。" : "已重做。";
        hud();
      }
      return;
    }
    if (a === "translate" || a === "rotate") {
      cancel();
      tool = a;
      apply();
      hud();
      return;
    }
    if (a === "preview-minus" || a === "preview-plus") {
      if (!editable()) return;
      const sign = a === "preview-plus" ? 1 : -1;
      trial = {
        id: selected,
        pose: nudgePose(state.poses[selected], tool, axis, sign, fine),
        sign,
      };
      scene.ghostsAt({ [selected]: trial.pose });
      scene.setGuide({ id: selected, axis, sign, tool });
      const before = poseError(state.poses[selected], data.target[selected]),
        after = poseError(trial.pose, data.target[selected]);
      feedback = `仅试步，未保存：位置 ${before.position.toFixed(3)} → ${after.position.toFixed(3)} u；方向 ${before.rotation.toFixed(2)} → ${after.rotation.toFixed(2)}°。应用或 Esc 取消。`;
      hud();
      return;
    }
    if (a === "apply-trial") {
      if (trial && trial.id === selected && editable())
        move(trial.pose, "应用试步");
      return;
    }
    if (a === "minus" || a === "plus") {
      if (event.detail === 0) nudge(a === "plus" ? 1 : -1);
      return;
    }
    if (a === "check" && editable()) {
      if (!state.judgements[selected]) {
        feedback = "先给这颗牙留下“平移／旋转／两者”的操作前判断。";
        hud();
        return;
      }
      const result = checkChallengeTooth(data, state, selected);
      feedback = result.passed
        ? `核对通过，已锁定参考终点。${state.judgements[selected] === expectedJudgement(data, selected) ? "操作前判断与参考变换一致。" : "操作前判断与参考变换不同，可回放再观察。"}`
        : `尚未到参考：位置 ${result.error.position.toFixed(3)} u，方向 ${result.error.rotation.toFixed(2)}°。分别调整再核对。`;
      if (commit(result.next) && result.passed) feedbackSound();
      return;
    }
  }
  function onDown(e: PointerEvent) {
    const divider = (e.target as HTMLElement).closest<HTMLElement>(
      "#int-divider",
    );
    if (divider && compare) {
      curtainDragging = true;
      divider.setPointerCapture(e.pointerId);
      scene.orbit.enabled = false;
      return;
    }
    const el = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-int-action]",
    );
    if (!el || el.disabled) return;
    const a = el.dataset.intAction;
    if (a === "hold" && mode === "current" && !compare) {
      cancel();
      holdReference = true;
      apply();
      hud();
      el.setPointerCapture(e.pointerId);
    }
    if ((a === "minus" || a === "plus") && editable()) {
      stopRepeat();
      el.setPointerCapture(e.pointerId);
      nudge(a === "plus" ? 1 : -1);
      holdTimer = setTimeout(() => {
        repeatTimer = setInterval(() => nudge(a === "plus" ? 1 : -1), 160);
      }, 350);
    }
  }
  function onUp() {
    if (curtainDragging) {
      curtainDragging = false;
      scene.orbit.enabled = true;
    }
    stopRepeat();
    if (dragging && !scene.before) {
      dragging = false;
      apply();
      hud();
    }
    if (holdReference) {
      holdReference = false;
      apply();
      hud();
    }
  }
  function onKey(e: KeyboardEvent) {
    if (
      (e.target as HTMLElement).id === "int-divider" &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
    ) {
      e.preventDefault();
      split =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? 100
            : Math.max(
                0,
                Math.min(100, split + (e.key === "ArrowRight" ? 5 : -5)),
              );
      get<HTMLInputElement>("#int-curtain input").value = String(split);
      return;
    }
    if (e.key === "Escape") {
      panel = null;
      get("#int-adjust-panel").hidden = true;
      get<HTMLDetailsElement>("#int-tools").open = false;
      get<HTMLDetailsElement>("#int-view-menu").open = false;
      cancel();
      feedback = "已取消预览，恢复已保存位置。";
      hud();
    }
    const target = e.target as HTMLElement;
    if (
      !target.closest("input,select,textarea,[contenteditable=true]") &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      const shortcut: Record<string, string> = {
        g: "translate",
        r: "rotate",
        f: "focus",
        n: "return",
      };
      if (shortcut[e.key.toLowerCase()]) {
        e.preventDefault();
        button(shortcut[e.key.toLowerCase()]).click();
        return;
      }
      if (["1", "2", "3"].includes(e.key)) {
        cancel();
        axis = (["X", "Y", "Z"] as Axis[])[Number(e.key) - 1];
        get<HTMLSelectElement>("#int-axis").value = axis;
        apply();
        return;
      }
      if (e.key.toLowerCase() === "h" && mode === "current" && !compare) {
        e.preventDefault();
        holdReference = true;
        apply();
        hud();
        return;
      }
    }
    const a = (e.target as HTMLElement).dataset.intAction;
    if (a === "hold" && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      if (!e.repeat && !holdReference && mode === "current" && !compare) {
        holdReference = true;
        apply();
        hud();
      }
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    if (
      (e.key === " " || e.key === "Enter" || e.key.toLowerCase() === "h") &&
      holdReference
    )
      onUp();
  }
  function onPointerMove(e: PointerEvent) {
    if (curtainDragging && compare) {
      const r = scene.host.getBoundingClientRect();
      split = Math.max(
        0,
        Math.min(100, ((e.clientX - r.left) / r.width) * 100),
      );
      get<HTMLInputElement>("#int-curtain input").value = String(split);
    }
  }
  function onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    if (el.id === "int-timeline") showReplay(Number(el.value));
    if (el.closest("#int-curtain")) {
      split = Number(el.value);
    }
    if (el.id === "int-axis") {
      cancel();
      axis = el.value as Axis;
      apply();
      hud();
    }
    if (el.id === "int-handles") {
      cancel();
      showHandles = el.checked;
      apply();
      hud();
    }
    if (el.id === "int-fine") {
      cancel();
      fine = el.checked;
      hud();
    }
  }
  function onVisibility() {
    if (document.hidden) cancel();
  }
  function onHover(e: PointerEvent) {
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-tooth]");
    if (card) {
      scene.hoverId = card.dataset.tooth;
      scene.updateOutline();
    } else if (!(e.target instanceof HTMLCanvasElement) && scene.hoverId) {
      scene.hoverId = undefined;
      scene.updateOutline();
    }
  }
  const direct = attachDirectDrag(scene, {
    select: (id) => {
      get<HTMLDetailsElement>("#int-tools").open = false;
      get<HTMLDetailsElement>("#int-view-menu").open = false;
      scene.onSelect(id);
    },
    canEdit: () => editable() && !showHandles && panel === null,
    fine: () => fine,
    tool: () => tool,
    preview: (id, pose) => scene.onPreview(id, pose),
    commit: (id, before, after) => scene.onCommit(id, before, after),
    cancel: () => {
      dragging = false;
      apply();
      hud();
    },
  });
  directCancel = direct.cancel;
  document.addEventListener("visibilitychange", onVisibility);
  app.addEventListener("click", onClick);
  app.addEventListener("pointerdown", onDown);
  app.addEventListener("input", onInput);
  app.addEventListener("pointerover", onHover);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  window.addEventListener("blur", cancel);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);
  const timer = setInterval(() => {
    if (disposed) return;
    app
      .querySelectorAll<HTMLElement>("[data-tooth]")
      .forEach((el) =>
        el.classList.toggle("is-hover", el.dataset.tooth === scene.hoverId),
      );
    const cue = scene.motion(selected, axis, trial?.sign ?? 1, tool),
      marker = get("#int-motion-cue");
    marker.hidden = !editable() || dragging || !cue || (!trial && !showHandles);
    if (cue && editable() && !dragging) {
      marker.textContent = `${cue.symbol} ${cue.forward}${trial ? " · 轮廓是试步结果，未保存" : " · 先预览一步再决定"}`;
      marker.style.left = `${Math.max(8, Math.min(scene.host.clientWidth - 240, cue.center.x + 24))}px`;
      marker.style.top = `${Math.max(65, Math.min(scene.host.clientHeight - 100, cue.center.y - 65))}px`;
      for (const [action, text] of [
        ["plus", cue.forward],
        ["minus", cue.back],
      ]) {
        const el = button(action);
        el.setAttribute("aria-label", text + "，可长按");
        el.title = text + "，可长按";
        const copy = el.querySelector(".button-copy");
        if (copy) copy.textContent = text;
      }
    }
    const p = scene.marker(selected),
      label = get("#int-tooth-label");
    label.hidden = !p?.visible;
    label.textContent = `文件 ${selected}${state.judgements[selected] ? " · 已留判断" : ""}${peer ? ` ↔ ${peer}` : ""}`;
    if (p) {
      label.style.left = `${Math.max(8, Math.min(scene.host.clientWidth - 160, p.x + 20))}px`;
      label.style.top = `${Math.max(40, Math.min(scene.host.clientHeight - 45, p.y + 25))}px`;
    }
    if (!dragging && mode === "current" && scene.hoverId)
      get("#int-instruction").textContent =
        `文件 ${scene.hoverId} · ${!group().includes(scene.hoverId) ? "其他任务锁定牙；返回任务牙继续" : state.checked.includes(scene.hoverId) ? "已核对锁定，可观察" : !state.observed.includes(state.card) ? "先完成观察判断" : !state.judgements[scene.hoverId] ? "点击选中，先留下操作判断" : "点击选中；可放大并调整"}`;
  }, 150);
  if (!localStorage.getItem(key)) persist(state);
  rememberBest();
  apply();
  hud();
  return () => {
    disposed = true;
    document.removeEventListener("visibilitychange", onVisibility);
    stopRepeat();
    stopCompare();
    clearInterval(timer);
    app.removeEventListener("click", onClick);
    app.removeEventListener("pointerdown", onDown);
    app.removeEventListener("input", onInput);
    app.removeEventListener("pointerover", onHover);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKeyUp);
    void audio?.close();
    direct.dispose();
    scene.dispose();
    document.body.classList.remove("interaction-mode");
  };
}
