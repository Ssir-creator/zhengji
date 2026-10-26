/** Small authored interface symbols; these are never used as dental geometry. */
const paths: Record<string, string> = {
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  rotate: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
  undo: '<path d="M9 5 3 11l6 6M3 11h11a6 6 0 0 1 6 6"/>',
  redo: '<path d="m15 5 6 6-6 6M21 11H10a6 6 0 0 0-6 6"/>',
  task: '<path d="M7 4H4v17h16V4h-3M9 3h6v4H9zM8 12l2 2 5-5M8 18h8"/>',
  plans:
    '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M7 7h6M7 11h4M7 21h14V7"/>',
  replay: '<path d="M5 7a9 9 0 1 1-2 8M5 2v5H0M10 8l6 4-6 4z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  focus:
    '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><circle cx="12" cy="12" r="4"/>',
  zoom: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6"/>',
  home: '<path d="m2 11 10-8 10 8M5 9v12h14V9M10 21v-7h4v7"/>',
  exit: '<path d="M10 3H4v18h6M9 12h13m-5-5 5 5-5 5"/>',
  fullscreen: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  export: '<path d="M12 16V2m-5 5 5-5 5 5M3 14v7h18v-7"/>',
  check: '<path d="m4 12 5 5L20 5"/>',
  cancel: '<path d="m6 6 12 12M18 6 6 18"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  tooth:
    '<path d="M12 5C6-1 2 4 4 10l2 10c1 4 4-2 6-7 2 5 5 11 6 7l2-10c2-6-2-11-8-5Z"/>',
  emblem:
    '<path d="m10 2 1 3h2l1-3 4 2-1 3 2 2 3-1v6l-3-1-2 2 1 3-4 2-1-3h-2l-1 3-4-2 1-3-2-2-3 1V8l3 1 2-2-1-3Z"/><circle cx="12" cy="11" r="4"/>',
};
const aliases: Record<string, string> = {
  interaction: "play",
  prediction: "tooth",
  practice: "move",
  new: "task",
  continue: "play",
  levels: "task",
  assets: "plans",
  settings: "settings",
  home: "home",
  "tool-translate": "move",
  "tool-rotate": "rotate",
  translate: "move",
  rotate: "rotate",
  "panel-task": "task",
  "panel-plans": "plans",
  replay: "replay",
  hold: "eye",
  hint: "eye",
  compare: "plans",
  pair: "tooth",
  focus: "focus",
  zoom: "zoom",
  "zoom-out": "zoom",
  "zoom-in": "zoom",
  undo: "undo",
  redo: "redo",
  check: "check",
  cancel: "cancel",
  fullscreen: "fullscreen",
  export: "export",
  exit: "exit",
  current: "play",
  "return-live": "play",
  "view-overview": "home",
  "view-occlusal": "eye",
  "view-front": "rotate",
  "view-side": "rotate",
};
export function uiIcon(action: string) {
  const name = aliases[action] ?? action;
  return paths[name]
    ? `<svg class="game-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`
    : "";
}
