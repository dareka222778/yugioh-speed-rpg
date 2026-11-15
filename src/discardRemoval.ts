// One activation-time cost, independent of whether the original target survives.
import type {Action,CardRef,DuelState} from './duelEngine';
import type {Effect} from './effectDefinitions';
import {getDuelCard,getEffect} from './effectRegistry';
import {canAffectMonster} from './continuousEffects';
import {ownedPrivateZone} from './teamRotation';
import {removeToken} from './tokens';

export type RemovalMode='destroyMonster'|'destroyCard'|'banishFaceUp'|'deckTop'|'continuousSpells'|'continuousTraps';
type Rule=Extract<Effect,{kind:'discardRemoval'}>;
const group=(m:RemovalMode)=>m==='continuousSpells'||m==='continuousTraps';
function groupTargets(s:DuelState,mode:RemovalMode){
 const kind=mode==='continuousSpells'?'spell':'trap';
 return s.players.flatMap(p=>p.backrow.filter(b=>b.faceUp&&getDuelCard(b.id)?.kind===kind&&getEffect(b.id)?.kind==='continuous').map(b=>b.uid));
}
export function discardRemovalActions(s:DuelState,index:number,c:CardRef,e:Rule):Action[]{
 const p=s.players[index],targets=group(e.mode)?(groupTargets(s,e.mode).length?['']:[]):s.players.flatMap(p=>[
  ...p.monsters.filter(m=>e.mode!=='banishFaceUp'||m.faceUp).map(m=>m.uid),
  ...e.mode==='destroyCard'?[...p.backrow,...p.field?[p.field]:[]].filter(b=>b.uid!==c.uid).map(b=>b.uid):[]]);
 return p.hand.filter(h=>h.uid!==c.uid).flatMap(h=>targets.map(target=>getDuelCard(c.id)?.kind==='trap'
  ?{kind:'trap',card:c.uid,target,discards:[h.uid]}:{kind:'spell',card:c.uid,...target?{target}:{},discards:[h.uid]}));
}
export function payDiscard(s:DuelState,actor:number,source:string,discards:readonly string[]|undefined){
 const p=s.players[actor],at=p.hand.findIndex(c=>c.uid===discards?.[0]);
 if(discards?.length!==1||discards[0]===source||at<0)throw Error('Escolha outra carta da sua mão para pagar o descarte.');
 p.grave.push(...p.hand.splice(at,1));
}
export function resolveDiscardRemoval(s:DuelState,e:Rule,kind:'spell'|'trap',uid:string|undefined,svc:{destroy:(s:DuelState,uid:string)=>void;back:(s:DuelState,uid:string)=>void;clean:(s:DuelState)=>void}){
 if(group(e.mode)){for(const target of groupTargets(s,e.mode))svc.back(s,target);return;}
 if(!uid)return;
 for(const [side,p] of s.players.entries()){
  const m=p.monsters.find(m=>m.uid===uid);
  if(!m){
   if(e.mode==='destroyCard'&&(p.field?.uid===uid||p.backrow.some(c=>c.uid===uid))){svc.back(s,uid);return;}
   continue;
  }
  if(!canAffectMonster(s,uid,kind)||e.mode==='banishFaceUp'&&!m.faceUp)return;
  if(e.mode==='destroyMonster'||e.mode==='destroyCard'){svc.destroy(s,uid);return;}
  if(m.entityKind==='token'){removeToken(s,uid,e.mode==='deckTop'?'return':'banish');svc.clean(s);return;}
  p.monsters=p.monsters.filter(c=>c.uid!==uid);
  const owner=m.owner??side,ref={id:m.id,uid};
  if(e.mode==='banishFaceUp')(s.players[owner].banished??=[]).push({...ref,...m.properlySummoned?{properlySummoned:true}:{}});
  else if(getDuelCard(m.id)?.fusion)ownedPrivateZone(s,ref,owner,'extra').push(ref);
  else ownedPrivateZone(s,ref,owner,'deck').unshift(ref);
  svc.clean(s);return;
 }
}
