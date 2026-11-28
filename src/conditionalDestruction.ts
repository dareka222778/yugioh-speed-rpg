import {namedCard} from './cardIdentity';
import {getDuelCard,getEffect} from './effectRegistry';
import type {DuelState} from './duelEngine';
import type {Effect} from './effectDefinitions';

export type ConditionalDestruction=Extract<Effect,{kind:'conditionalDestruction'}>;

/** Check activation prerequisites using public field/zone state only. */
export function conditionalTargets(s:DuelState,actor:number,e:ConditionalDestruction,source=''):string[]{
 const owner=s.players[actor];
 if(e.requiredName&&!owner.monsters.some(m=>m.faceUp&&!!getDuelCard(m.id)&&namedCard(getDuelCard(m.id)!,e.requiredName!)))return [];
 if(e.minFieldMonsters&&s.players.reduce((n,p)=>n+p.monsters.length,0)<e.minFieldMonsters)return [];
 if(e.minBanished&&(owner.banished?.length??0)<e.minBanished)return [];
 if(e.zone==='monsters'){
  const ids=s.players.flatMap((p,index)=>(e.scope==='opponent'||e.controller==='opponent')&&index===actor?[]:p.monsters.filter(m=>(!e.faceUp||m.faceUp)&&(!e.equipped||s.players.some(q=>q.backrow.some(b=>b.faceUp&&b.resolved===true&&b.equippedTo===m.uid)))).map(m=>m.uid));
  return e.scope==='selected'?ids:ids.length?['']:[];
 }
 if(e.zone==='backrow'){
  const cards=s.players.flatMap((p,index)=>e.scope==='opponent'&&index===actor?[]:[...p.backrow,...p.field?[p.field]:[]]);
  return cards.some(c=>c.uid!==source)?['']:[];
 }
 const equips=s.players.flatMap(p=>p.backrow).filter(b=>b.uid!==source&&b.faceUp&&getEffect(b.id)?.kind==='equip');
 return equips.length?['']:[];
}
