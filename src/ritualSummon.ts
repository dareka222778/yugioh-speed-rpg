/** Ritual decisions occur during resolution; materials are Tributed, not activation costs. */
import type {DuelState,CardRef} from './duelEngine';
import {getDuelCard as card,getEffect} from './effectRegistry';
import {canAffectMonster} from './continuousEffects';
import {RULES_PROFILE} from './rulesProfile';
import {ritualRuleIssues,type RitualRule} from './ritualRules';
export type RitualFlow={actor:number;spellId:string;spellUid:string;stage:'monster'|'materials'|'position';monsterUid?:string;materials:string[]};
function recipe(s:DuelState){const e=s.ritual&&getEffect(s.ritual.spellId);if(e?.kind!=='ritualSummon')throw Error('Receita Ritual ausente.');return e.ritual;}
function pool(s:DuelState,actor:number,monsterUid:string){const p=s.players[actor];return [...p.hand,...p.monsters].filter(c=>c.uid!==monsterUid&&card(c.id)?.kind==='monster'&&(!('entityKind'in c)||c.entityKind!=='token'||'tokenPolicy'in c&&c.tokenPolicy?.tributeEffect)&&(!p.monsters.includes(c as any)||canAffectMonster(s,c.uid,'spell')));}
function selectedValid(s:DuelState,actor:number,uid:string,selected:string[]){const all=pool(s,actor,uid);return new Set(selected).size===selected.length&&selected.every(uid=>all.some(c=>c.uid===uid));}
/** Bounded DP: no enumeration of 2^hand-size material subsets. */
export function canCompleteRitual(s:DuelState,actor:number,monster:CardRef,rule:RitualRule,selected:string[]=[]):boolean{
 const p=s.players[actor],info=card(monster.id);if(info?.monsterType!=='ritual'||monster.id!==rule.monsterId||!p.hand.some(c=>c.uid===monster.uid)||!selectedValid(s,actor,monster.uid,selected))return false;
 const candidates=pool(s,actor,monster.uid),level=(c:CardRef)=>card(c.id)?.level??0;
 let total=0,min=13,field=false;for(const uid of selected){const c=candidates.find(c=>c.uid===uid)!;total+=level(c);min=Math.min(min,level(c));field||=p.monsters.some(m=>m.uid===uid);}
 const valid=(sum:number,minimum:number,usedField:boolean)=>sum>=rule.minimumLevel&&sum-minimum<rule.minimumLevel&&(usedField||p.monsters.length<RULES_PROFILE.monsterZones);
 if(total>=rule.minimumLevel)return valid(total,min,field);
 let states=new Map<string,[number,number,boolean]>([[`${total}:${min}:${field}`,[total,min,field]]]);
 for(const c of candidates.filter(c=>!selected.includes(c.uid))){const next=new Map(states);for(const [sum,minimum,usedField]of states.values()){
  const n=sum+level(c),m=Math.min(minimum,level(c)),f=usedField||p.monsters.some(x=>x.uid===c.uid);
  if(valid(n,m,f))return true;if(n<rule.minimumLevel)next.set(`${n}:${m}:${f}`,[n,m,f]);
 }states=next;}return false;
}
export function ritualCandidates(s:DuelState,actor:number,rule:RitualRule){return s.players[actor].hand.filter(c=>canCompleteRitual(s,actor,c,rule));}
export function ritualTargets(s:DuelState):string[]{const f=s.ritual;if(!f)return [];const r=recipe(s),p=s.players[f.actor];
 if(f.stage==='monster')return ritualCandidates(s,f.actor,r).map(c=>c.uid);
 const monster=p.hand.find(c=>c.uid===f.monsterUid);if(!monster)return [];
 if(f.stage==='position')return ['__ritual_atk__','__ritual_def__'];
 const sum=f.materials.reduce((n,uid)=>n+(card(pool(s,f.actor,monster.uid).find(c=>c.uid===uid)?.id??'')?.level??0),0);
 const choices=sum>=r.minimumLevel?['__ritual_commit__']:pool(s,f.actor,monster.uid).filter(c=>!f.materials.includes(c.uid)&&canCompleteRitual(s,f.actor,monster,r,[...f.materials,c.uid])).map(c=>c.uid);
 return [...choices,...f.materials.length?['__ritual_undo__']:['__ritual_back__']];
}
function update(s:DuelState){s.phase='choice';s.choice={actor:s.ritual!.actor,source:'ritual',targets:ritualTargets(s)};}
export function beginRitual(s:DuelState,actor:number,spellUid:string,spellId:string){const e=getEffect(spellId);if(e?.kind!=='ritualSummon'||!ritualCandidates(s,actor,e.ritual).length)return false;s.ritual={actor,spellId,spellUid,stage:'monster',materials:[]};update(s);return true;}
export function chooseRitual(s:DuelState,actor:number,target:string):{uid:string;id:string}|undefined{
 const f=s.ritual;if(!f||actor!==f.actor||!ritualTargets(s).includes(target))throw Error('Escolha Ritual inválida.');
 if(f.stage==='monster'){f.monsterUid=target;f.stage='materials';}
 else if(f.stage==='materials'){
  if(target==='__ritual_back__'){f.stage='monster';f.monsterUid=undefined;}
  else if(target==='__ritual_undo__')f.materials.pop();
  else if(target==='__ritual_commit__')f.stage='position';
  else f.materials.push(target);
 }else{
  const p=s.players[actor],monster=p.hand.find(c=>c.uid===f.monsterUid)!,r=recipe(s);
  if(!canCompleteRitual(s,actor,monster,r,f.materials)||f.materials.reduce((n,uid)=>n+card(pool(s,actor,monster.uid).find(c=>c.uid===uid)!.id)!.level!,0)<r.minimumLevel)throw Error('Materiais Ritual inválidos.');
  // Physical zone mutations are centralized in the engine, after this validated decision.
  return {uid:monster.uid,id:monster.id};
 }update(s);return;
}
export function assertRitualFlow(s:DuelState){const f=s.ritual;if(!f){if(s.choice?.source==='ritual')throw Error('Escolha Ritual sem continuidade.');return;}
 if(![0,1].includes(f.actor)||typeof f.spellUid!=='string'||!['monster','materials','position'].includes(f.stage)||!Array.isArray(f.materials)||f.materials.length>33||f.materials.some(x=>typeof x!=='string')||new Set(f.materials).size!==f.materials.length||s.phase!=='choice'||s.choice?.source!=='ritual'||s.choice.actor!==f.actor)throw Error('Continuidade Ritual inválida.');
 const r=recipe(s);if(ritualRuleIssues(r).length||f.stage==='monster'&&(f.monsterUid!==undefined||f.materials.length))throw Error('Receita Ritual inválida.');
 if(f.stage!=='monster'){const m=s.players[f.actor].hand.find(c=>c.uid===f.monsterUid);if(!m||!canCompleteRitual(s,f.actor,m,r,f.materials))throw Error('Materiais Ritual obsoletos.');if(f.stage==='position'&&f.materials.reduce((sum,uid)=>sum+(card(pool(s,f.actor,m.uid).find(c=>c.uid===uid)!.id)?.level??0),0)<r.minimumLevel)throw Error('Tributos Ritual incompletos.');}
 const targets=ritualTargets(s);if(!targets.length||JSON.stringify(targets)!==JSON.stringify(s.choice.targets))throw Error('Alvos Ritual inconsistentes.');
}
