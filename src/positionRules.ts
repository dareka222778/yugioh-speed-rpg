export type PositionRule={scope:'both'|'opponent'|'self'|'selected';mode:'def'|'switch'|'set'|'revealAtk'|'revealDef'|'reveal';races?:readonly string[];controller?:'opponent'};
export function positionRuleIssues(r:unknown):string[]{
 if(!r||typeof r!=='object')return ['invalid-position-rule'];
 const v=r as PositionRule;
 if(Object.keys(v).some(k=>!['scope','mode','races','controller'].includes(k))||!['both','opponent','self','selected'].includes(v.scope)||!['def','switch','set','revealAtk','revealDef','reveal'].includes(v.mode))return ['invalid-position-rule'];
 if(v.mode==='set'&&v.scope!=='selected'||v.scope==='selected'&&!['set','revealAtk'].includes(v.mode))return ['unsupported-position-combination'];
 if(v.controller!==undefined&&(v.controller!=='opponent'||v.scope!=='selected'||v.mode!=='revealAtk'))return ['unsupported-position-controller'];
 if(v.races!==undefined&&(v.scope!=='selected'||!Array.isArray(v.races)||!v.races.length||v.races.some(x=>typeof x!=='string'||!x)||new Set(v.races).size!==v.races.length))return ['invalid-position-races'];
 return [];
}
