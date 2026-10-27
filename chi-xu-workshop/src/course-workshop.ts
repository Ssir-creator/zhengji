import "./course-workshop.css";
import { WorkshopScene } from "./scene";
import { attachDirectDrag } from "./direct-drag";
import { uiIcon } from "./ui";
import type { CaseAssets } from "./assets";
import { poseError, type Pose, type Tool, type Axis } from "./core";
import { referenceCase, type Prediction } from "./prediction";
import { nudgePose } from "./challenge";
import {
  COURSE_KEY,
  lessons,
  freshCourse,
  validateCourse,
  moveCourse,
  advanceCourse,
  lessonReady,
  passed,
  correction,
  type CourseState,
  type Guess,
} from "./course";
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
  );
  const raw = localStorage.getItem(COURSE_KEY);
  let state = raw ? validateCourse(JSON.parse(raw), data) : freshCourse(data);
  let selected: string | null = null,
    tool: Tool = lessons[state.stage].tool ?? "translate",
    fine = false,
    axis: Axis = "X",
    outline = state.stage < 2,
    readonly = false,
    replay = false,
    pending = false,
    success = false,
    sound = false,
    reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let feedback = "",
    trial: Pose | null = null,
    audio: AudioContext | undefined,
    repeat: ReturnType<typeof setInterval> | undefined;
  const undo: CourseState[] = [],
    redo: CourseState[] = [];
  const b = (label: string, action: string, icon = action) =>
    `<button data-course="${action}">${uiIcon(icon)}<span>${label}</span></button>`;
  app.innerHTML = `<main class="course-game"><header class="course-top"><div><small id="course-chapter"></small><strong id="course-prompt"></strong></div><nav class="course-nodes" aria-label="六关进度"></nav><details id="course-tools"><summary aria-label="工具">${uiIcon("settings")}</summary><div>${b("参考轮廓", "outline", "eye")}${b("看参考 / 回来", "reference", "eye")}${b("撤销", "undo")}${b("重做", "redo")}${b("找一下遗漏", "locate", "focus")}${b("回看操作", "replay")}${b("声音：关", "sound", "sound")}${b("减少动效", "motion", "settings")}${b("导出记录", "export")}${b("练习说明", "help", "task")}${b("回到首页", "exit")}</div></details></header><div id="course-viewport"></div><div id="course-region"></div><div id="course-label" hidden></div><div id="course-mode" hidden></div><div id="course-guess" hidden><strong>这里需要怎么处理？</strong>${b("只挪", "guess-translate", "move")}${b("只转", "guess-rotate", "rotate")}${b("两项", "guess-both", "adjust")}</div><p id="course-feedback" role="status"></p><div id="course-success" hidden><strong>Perfect!</strong><p></p>${b("继续", "next", "check")}</div><section id="course-adjust" hidden><div>${b("挪位置", "translate", "move")}${b("转方向", "rotate")}</div><details><summary>细一点</summary><label>沿 <select id="course-axis" aria-label="调整轴"><option>X</option><option>Y</option><option>Z</option></select> 轴</label><label><input type="checkbox" id="course-fine">细调</label><div>${b("反向", "minus", "undo")}${b("正向", "plus", "redo")}${b("撤销", "undo-step", "undo")}</div><div>${b("试一步", "trial", "eye")}${b("应用", "apply", "check")}${b("取消", "cancel")}</div><label><input type="checkbox" id="course-handles">轴向手柄</label></details></section><nav class="course-dock">${b("调整", "adjust", "move")}<details id="course-view"><summary>${uiIcon("eye")}<span>视角</span></summary><div>${b("整体看", "view-overview", "home")}${b("从上面看", "view-occlusal", "eye")}${b("换个角度", "view-front", "rotate")}${b("另一侧", "view-side", "rotate")}${b("放大观察", "focus")}${b("退远一点", "zoom", "zoom")}</div></details>${b("核对", "check")}</nav><section id="course-recap" hidden><strong>回看这一步</strong><p id="course-recap-text"></p><input type="range" id="course-timeline" min="0" value="0" aria-label="回看操作"><p>回放只看，不会改变进度。</p><div>${b("回到操作", "live", "cancel")}</div><section id="course-reflection" hidden><p>是什么帮你发现了遗漏？</p>${b("换角度", "reflect-view", "eye")}${b("核对反馈", "reflect-check", "check")}${b("前后对比", "reflect-compare", "replay")}<p>符合参考，就一定适合真实治疗吗？</p>${b("是", "boundary-yes", "check")}${b("不一定", "boundary-no", "eye")}<p id="course-boundary"></p>${b("跳过 / 完成", "exit", "exit")}</section></section><section id="course-help" hidden><strong>牙列空间观察与调整基础</strong><p>拖牙调整，拖空白转视角。G 挪、R 转，Esc 取消。精细调整里可以换轴、细调。</p><p>本章练习位置和朝向，不用于制定治疗方案。参考不是唯一的临床方案；核对不检查咬合、碰撞或移动安全。</p><p>轮廓和定位随时可用，不扣分。Perfect! 表示完成本关练习。</p>${b("开始动手", "close-help", "check")}</section></main>`;
  document.body.classList.add("course-mode");
  const el = <T extends HTMLElement = HTMLElement>(q: string) =>
    app.querySelector<T>(q)!;
  const scene = new WorkshopScene(el("#course-viewport"), false);
  scene.touchEditing = true;
  scene.appearancePalette = { selected: "#f2d5c4", hover: "#dcebf0" };
  scene.load(assets, state.poses);
  scene.reduced = reduced;
  for (const ghost of scene.ghosts.values()) {
    const material = ghost.material as import("three").MeshBasicMaterial;
    material.wireframe = false;
    material.opacity = 0.18;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
  }
  scene.outline.visibleEdgeColor.set("#e47953");
  scene.outline.hiddenEdgeColor.set("#e47953");
  function fit() {
    scene.scene.updateMatrixWorld(true);
    scene.camera.updateMatrixWorld(true);
    const bounds = scene.projectedTeethBounds();
    const factor = Math.max(
      1,
      (bounds.right - bounds.left) / (scene.host.clientWidth * 0.88),
      (bounds.bottom - bounds.top) / (scene.host.clientHeight * 0.67),
    );
    if (factor > 1.02) scene.zoom(factor);
  }
  scene.onResize = fit;
  fit();
  const lesson = () => lessons[state.stage];
  const candidate = (id: string) =>
    (lesson().ids as readonly string[]).includes(id);
  const edit = () =>
    !readonly &&
    !replay &&
    !state.completed &&
    !success &&
    !!selected &&
    candidate(selected) &&
    (state.stage !== 3 || !!state.guess[`3:${selected}`]);
  function save(next: CourseState) {
    try {
      validateCourse(next, data);
      localStorage.setItem(COURSE_KEY, JSON.stringify(next));
      state = next;
      return true;
    } catch (e) {
      feedback = `没能保存，操作未提交。${String(e)}`;
      return false;
    }
  }
  function tone() {
    if (!sound) return;
    try {
      audio ??= new AudioContext();
      void audio.resume();
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.frequency.setValueAtTime(660, audio.currentTime);
      o.frequency.setValueAtTime(880, audio.currentTime + 0.08);
      g.gain.setValueAtTime(0.04, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.23);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.24);
    } catch {}
  }
  function paint() {
    scene.apply(
      readonly
        ? {
            ...state.poses,
            ...Object.fromEntries(
              lesson().ids.map((id) => [id, data.target[id]]),
            ),
          }
        : state.poses,
    );
    scene.setTaskTeeth([]);
    scene.setCompletedTeeth([]);
    scene.select(
      selected,
      edit(),
      tool,
      edit() && el<HTMLInputElement>("#course-handles").checked
        ? ["X", "Y", "Z"]
        : [],
    );
    scene.ghostsAt(
      !readonly && !replay && outline
        ? Object.fromEntries(
            lesson()
              .ids.filter((id) => state.stage < 3 || id === selected)
              .map((id) => [id, data.target[id]]),
          )
        : null,
    );
    ui();
  }
  function ui() {
    el("#course-chapter").textContent =
      `${state.stage + 1} / 6 · ${lesson().title}`;
    el("#course-prompt").textContent = state.completed
      ? "这一章，完成了。"
      : lesson().prompt;
    el(".course-nodes").innerHTML = lessons
      .map(
        (l, i) =>
          `<span class="${i < state.stage || state.completed ? "done" : i === state.stage ? "active" : ""}" title="${l.title}" aria-label="${l.title}${i < state.stage ? "已完成" : i === state.stage ? "当前" : ""}"></span>`,
      )
      .join("");
    el("#course-feedback").textContent = feedback;
    el("#course-mode").hidden = !readonly && !replay && !pending;
    el("#course-mode").textContent = replay
      ? "回放 · 只看，不保存"
      : readonly
        ? "参考 · 只看，不保存"
        : pending
          ? "拖动预览 · 松手放下 / Esc 取消"
          : "";
    el<HTMLButtonElement>('[data-course="check"]').disabled =
      pending || readonly || replay || success || state.completed;
    for (const t of ["translate", "rotate"] as Tool[]) {
      const button = el<HTMLButtonElement>(`[data-course="${t}"]`);
      button.disabled = !!lesson().tool && lesson().tool !== t;
      button.setAttribute("aria-pressed", String(tool === t));
      button.title = button.disabled ? "下一步会用到它" : "";
    }
    el('[data-course="adjust"]').setAttribute("aria-pressed", "true");
    el("#course-guess").hidden =
      state.stage !== 3 ||
      !selected ||
      !candidate(selected) ||
      readonly ||
      replay ||
      success;
    for (const g of ["translate", "rotate", "both"])
      el(`[data-course="guess-${g}"]`).setAttribute(
        "aria-pressed",
        String(state.guess[`3:${selected}`] === g),
      );
    el("#course-success").hidden = !success;
    el("#course-success p").textContent = [
      "位置到位了。",
      "挪和转，你都掌握了。",
      "该动的动，不该动的保留。",
      "这一处修好了，其他部分保留。",
      "稳稳到位！",
      "复核完成！",
    ][state.stage];
    el<HTMLInputElement>("#course-fine").checked = fine;
  }
  function cancel() {
    direct.cancel();
    scene.cancelDrag();
    trial = null;
    pending = false;
    paint();
  }
  function commit(id: string, before: Pose, after: Pose) {
    pending = false;
    if (!edit()) {
      paint();
      return;
    }
    if (
      poseError(before, after).position < 1e-8 &&
      poseError(before, after).rotation < 1e-5
    ) {
      paint();
      return;
    }
    try {
      const adjusted = structuredClone(after);
      if (tool === "translate")
        adjusted.quaternion = structuredClone(state.poses[id].quaternion);
      else adjusted.translation = structuredClone(state.poses[id].translation);
      const next = moveCourse(data, state, id, adjusted, tool),
        old = structuredClone(state);
      feedback = correction(before, after, data.target[id]);
      if (save(next)) {
        undo.push(old);
        redo.length = 0;
      }
      paint();
    } catch (e) {
      feedback = String(e);
      paint();
    }
  }
  function select(id: string) {
    if (readonly || replay || success) return;
    selected = id;
    feedback = candidate(id)
      ? state.stage === 3
        ? "先判断哪里需要修，再动手。"
        : "拖动试试看。"
      : "这颗不在本次范围里，先检查眼前这一组。";
    paint();
  }
  scene.onSelect = select;
  scene.onPreview = () => {
    pending = true;
    ui();
  };
  scene.onCommit = commit;
  scene.onFailure = (message) => {
    feedback = message;
    ui();
  };
  const direct = attachDirectDrag(scene, {
    select,
    canEdit: edit,
    tool: () => tool,
    fine: () => fine,
    preview: () => {
      pending = true;
      ui();
    },
    commit,
    cancel: () => {
      pending = false;
      feedback = "已取消，没有改动。";
      paint();
    },
  });
  function setTool(t: Tool) {
    cancel();
    if (lesson().tool && lesson().tool !== t) {
      feedback = "这一步先用已解锁的工具。";
      ui();
      return;
    }
    tool = t;
    paint();
  }
  function nudge(sign: number) {
    if (edit() && selected) {
      const before = state.poses[selected];
      commit(selected, before, nudgePose(before, tool, axis, sign, fine));
    }
  }
  function check() {
    if (pending || readonly || replay || success || state.completed) return;
    if (lessonReady(data, state)) {
      const next = structuredClone(state);
      next.checked = [...lesson().ids];
      if (!save(next)) {
        ui();
        return;
      }
      tone();
      if (state.stage === 0) {
        nextLesson();
        return;
      }
      success = true;
      feedback = "";
      paint();
      return;
    }
    if (state.stage === 5) {
      feedback = "还有遗漏。再看看，或从工具里找一下。";
      ui();
      return;
    }
    if (!selected || !candidate(selected)) {
      feedback =
        state.stage === 3 ? "有一处还没做好，换个角度找找。" : "先选一颗看看。";
      ui();
      return;
    }
    const e = poseError(state.poses[selected], data.target[selected]);
    if (passed(state.poses[selected], data.target[selected])) {
      const next = structuredClone(state);
      if (!next.checked.includes(selected)) next.checked.push(selected);
      save(next);
      tone();
      feedback =
        state.stage === 2
          ? "这颗已经合适，不用再动。看看另一颗。"
          : "这颗没问题，还有别处。";
    } else
      feedback =
        e.position <= 0.075
          ? "位置合适，方向还差一点。"
          : e.rotation <= 0.6
            ? "方向合适，位置还差一点。"
            : "位置和方向都还需要处理。";
    paint();
  }
  function nextLesson() {
    const next = advanceCourse(data, state);
    if (!save(next)) {
      ui();
      return;
    }
    success = false;
    undo.length = redo.length = 0;
    tool = lesson().tool ?? "translate";
    selected = state.stage < 3 || state.stage === 4 ? lesson().ids[0] : null;
    outline = state.stage < 2;
    feedback = state.stage === 1 ? "位置不动，这次转方向。" : "";
    el("#course-adjust").hidden = true;
    paint();
    if (state.completed) showReplay();
  }
  function showReplay() {
    cancel();
    readonly = false;
    replay = true;
    el("#course-adjust").hidden = true;
    el("#course-recap").hidden = false;
    el("#course-reflection").hidden = !state.completed;
    const moves = state.events.filter((e) => e.stage === state.stage);
    const slider = el<HTMLInputElement>("#course-timeline");
    slider.max = String(moves.length);
    slider.value = String(moves.length);
    drawReplay();
  }
  function drawReplay() {
    const moves = state.events.filter((e) => e.stage === state.stage),
      index = Number(el<HTMLInputElement>("#course-timeline").value),
      poses = structuredClone(state.poses);
    for (let i = moves.length - 1; i >= index; i--)
      poses[moves[i].id] = structuredClone(moves[i].before);
    scene.transform.detach();
    scene.ghostsAt(null);
    scene.apply(poses);
    const step = moves[index - 1];
    el("#course-recap-text").textContent = step
      ? `第 ${index} 步 · ${step.tool === "translate" ? "挪位置" : "转方向"}。${correction(step.before, step.after, data.target[step.id])}`
      : "从这次开始时看。";
    ui();
  }
  function closeMenus() {
    el<HTMLDetailsElement>("#course-tools").open = false;
    el<HTMLDetailsElement>("#course-view").open = false;
  }
  function click(event: MouseEvent) {
    const a = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-course]",
    )?.dataset.course;
    if (!a) return;
    closeMenus();
    if (a === "exit") {
      onExit();
      return;
    }
    if (a.startsWith("pick-")) {
      select(a.slice(5));
      return;
    }
    if (a === "help") {
      el("#course-help").hidden = false;
      return;
    }
    if (a === "close-help") {
      el("#course-help").hidden = true;
      return;
    }
    if (a === "adjust") {
      el("#course-adjust").hidden = !el("#course-adjust").hidden;
      return;
    }
    if (a === "translate" || a === "rotate") {
      setTool(a);
      return;
    }
    if (a === "check") {
      check();
      return;
    }
    if (a === "next") {
      nextLesson();
      return;
    }
    if (a.startsWith("guess-") && selected) {
      const next = structuredClone(state);
      next.guess[`3:${selected}`] = a.slice(6) as Guess;
      if (save(next)) {
        const guess = next.guess[`3:${selected}`];
        tool = guess === "rotate" ? "rotate" : "translate";
        feedback = "试试看。核对后，还可以改变判断。";
      }
      paint();
      return;
    }
    if (a.startsWith("view-")) {
      cancel();
      scene.view(a.slice(5), assets.manifest);
      fit();
      return;
    }
    if (a === "zoom") {
      scene.zoom(1.2);
      return;
    }
    if (a === "focus" && selected) {
      const position = scene.teeth.get(selected)!.position,
        offset = scene.camera.position
          .clone()
          .sub(scene.orbit.target)
          .normalize()
          .multiplyScalar(scene.size * 0.7);
      scene.orbit.target.copy(position);
      scene.camera.position.copy(position).add(offset);
      scene.orbit.update();
      return;
    }
    if (a === "minus" || a === "plus") {
      nudge(a === "plus" ? 1 : -1);
      return;
    }
    if (a === "undo" || a === "undo-step" || a === "redo") {
      cancel();
      const source = a === "redo" ? redo : undo,
        dest = a === "redo" ? undo : redo,
        next = source.at(-1);
      if (next) {
        const old = structuredClone(state);
        if (save(next)) {
          source.pop();
          dest.push(old);
          feedback = "回到这一步了。";
        }
      }
      paint();
      return;
    }
    if (a === "outline") {
      cancel();
      outline = !outline;
      paint();
      return;
    }
    if (a === "reference") {
      cancel();
      if (replay) {
        feedback = "先回到操作，再查看参考。";
        ui();
        return;
      }
      readonly = !readonly;
      paint();
      return;
    }
    if (a === "locate") {
      cancel();
      readonly = false;
      replay = false;
      el("#course-recap").hidden = true;
      selected =
        lesson().ids.find((id) => !passed(state.poses[id], data.target[id])) ??
        lesson().ids[0];
      outline = true;
      feedback = "先检查这颗。参考可以随时打开。";
      paint();
      return;
    }
    if (a === "trial" && edit() && selected) {
      trial = nudgePose(state.poses[selected], tool, axis, 1, fine);
      scene.ghostsAt({ [selected]: trial });
      feedback =
        "只看试步，还没改动。" +
        correction(state.poses[selected], trial, data.target[selected]);
      ui();
      return;
    }
    if (a === "apply" && trial && selected && edit()) {
      const p = trial;
      trial = null;
      commit(selected, state.poses[selected], p);
      return;
    }
    if (a === "cancel") {
      cancel();
      return;
    }
    if (a === "replay") {
      showReplay();
      return;
    }
    if (a === "live") {
      replay = false;
      el("#course-recap").hidden = true;
      paint();
      return;
    }
    if (a === "sound") {
      sound = !sound;
      el('[data-course="sound"] span').textContent =
        `声音：${sound ? "开" : "关"}`;
      return;
    }
    if (a === "motion") {
      reduced = !reduced;
      scene.reduced = reduced;
      el(".course-game").classList.toggle("reduced", reduced);
      return;
    }
    if (a === "export") {
      const blob = new Blob(
          [
            JSON.stringify(
              { course: state, scope: "牙列空间观察与调整基础" },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = "齿序工坊-基础练习.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    if (a.startsWith("reflect-")) {
      const next = structuredClone(state);
      next.reflection = a.slice(8);
      save(next);
      el("#course-recap-text").textContent =
        "记下了。也可以拖动时间轴，再看看那一步。";
      return;
    }
    if (a.startsWith("boundary-")) {
      el("#course-boundary").textContent =
        "符合参考，只说明完成了这次位置和朝向练习。真实治疗还要考虑牙周、咬合等条件。";
      return;
    }
  }
  function key(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest("input,select,button,summary"))
      return;
    if (e.key === "Escape") {
      cancel();
      readonly = replay = false;
      el("#course-recap").hidden = true;
      el("#course-help").hidden = true;
      el("#course-adjust").hidden = true;
      paint();
    }
    if (e.key.toLowerCase() === "g") setTool("translate");
    if (e.key.toLowerCase() === "r") setTool("rotate");
  }
  function change(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.id === "course-timeline") {
      drawReplay();
      return;
    }
    const value = target.value,
      checked = target.checked;
    cancel();
    if (target.id === "course-axis") axis = value as Axis;
    if (target.id === "course-fine") fine = checked;
    paint();
  }
  function stop() {
    if (repeat) clearInterval(repeat);
    repeat = undefined;
  }
  function down(e: PointerEvent) {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-course]")
      ?.dataset.course;
    if (a === "minus" || a === "plus") {
      stop();
      repeat = setInterval(() => nudge(a === "plus" ? 1 : -1), 180);
    }
  }
  function blur() {
    stop();
    cancel();
  }
  app.addEventListener("click", click);
  app.addEventListener("change", change);
  el("#course-timeline").addEventListener("input", drawReplay);
  app.addEventListener("pointerdown", down);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
  window.addEventListener("keydown", key);
  window.addEventListener("blur", blur);
  selected = state.stage < 3 || state.stage === 4 ? lesson().ids[0] : null;
  paint();
  if (state.completed) showReplay();
  const timer = setInterval(() => {
    el("#course-region").innerHTML =
      state.stage >= 2 && !readonly && !replay
        ? lesson()
            .ids.map((id, i) => {
              const p = scene.marker(id);
              return p?.visible
                ? `<button aria-label="检查候选 ${i + 1}" data-course="pick-${id}" style="left:${p.x}px;top:${p.y - 30}px">${i + 1}</button>`
                : "";
            })
            .join("")
        : "";
    if (!selected) {
      el("#course-label").hidden = true;
      return;
    }
    const p = scene.marker(selected);
    const label = el("#course-label");
    label.hidden = !p?.visible;
    if (p) {
      label.style.left = `${Math.max(8, Math.min(scene.host.clientWidth - 210, p.x + 22))}px`;
      label.style.top = `${Math.max(90, Math.min(scene.host.clientHeight - 190, p.y + 22))}px`;
      label.textContent = pending
        ? "松手放下 · Esc 取消"
        : state.checked.includes(selected)
          ? "✓ 核对通过"
          : candidate(selected)
            ? "拖动调整"
            : "不在本次范围";
    }
  }, 100);
  return () => {
    stop();
    clearInterval(timer);
    direct.dispose();
    window.removeEventListener("keydown", key);
    window.removeEventListener("blur", blur);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    app.removeEventListener("click", click);
    app.removeEventListener("change", change);
    app.removeEventListener("pointerdown", down);
    scene.dispose();
    void audio?.close();
    document.body.classList.remove("course-mode");
  };
}
