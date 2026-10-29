export type PositionRule={scope:'both'|'opponent'|'selected';mode:'def'|'switch'|'set';races?:readonly string[]};
export function positionRuleIssues(r:unknown):string[]{
 if(!r||typeof r!=='object')return ['invalid-position-rule'];
 const v=r as PositionRule;
 if(Object.keys(v).some(k=>!['scope','mode','races'].includes(k))||!['both','opponent','selected'].includes(v.scope)||!['def','switch','set'].includes(v.mode))return ['invalid-position-rule'];
 if(v.mode==='set'&&v.scope!=='selected'||v.scope==='selected'&&v.mode!=='set')return ['unsupported-position-combination'];
 if(v.races!==undefined&&(v.scope!=='selected'||!Array.isArray(v.races)||!v.races.length||v.races.some(x=>typeof x!=='string'||!x)||new Set(v.races).size!==v.races.length))return ['invalid-position-races'];
 return [];
}
