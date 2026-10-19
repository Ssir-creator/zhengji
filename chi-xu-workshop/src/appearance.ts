/** Display-only interaction colours. These never enter case data or saved poses. */
export const toothColors = {
 natural: '#eee5d3', task: '#e8b487', hover: '#9dcbdc',
 selected: '#f1ac46', complete: '#88b9a5', fixed: '#aab8bb'
} as const;
export type ToothState = keyof typeof toothColors;
export function toothState(id:string,state:{selected:string|null;hover?:string;tasks:readonly string[];completed:readonly string[];fixed:readonly string[]}):ToothState{
 if(state.fixed.includes(id))return 'fixed';
 if(state.completed.includes(id))return 'complete';
 if(state.selected===id)return 'selected';
 if(state.hover===id)return 'hover';
 return state.tasks.includes(id)?'task':'natural';
}
