import {atk,def,type DuelState,type Action} from './duelEngine';
import {getEffect,getPlayableCard} from './effectRegistry';
import {canAffectMonster} from './continuousEffects';
import {handCardValue} from './npcStrategy';

type Play=Extract<Action,{kind:'spell'|'trap'}>;
/** Discard removal is a two-card investment. Compare rival threats with the
 * cheapest eligible cost using public information; never reveal Set cards. */
export function filterNpcRemoval(s:DuelState,id:string,actions:Action[]):Action[]{
 const actor=s.players.findIndex(p=>p.id===id);if(actor<0)return actions;
 const own=s.players[actor],enemy=s.players[1-actor],held=[...own.hand,...own.backrow];
 const removal=new Set<Action>();let best:Play|undefined,bestScore=0;
 for(const a of actions){
  if(a.kind!=='spell'&&a.kind!=='trap')continue;
  const source=held.find(c=>c.uid===a.card),e=source&&getEffect(source.id);if(e?.kind!=='discardRemoval')continue;
  removal.add(a);const fee=own.hand.find(c=>c.uid===a.discards?.[0]);if(!fee)continue;
  if(a.target&&s.chain.some(l=>l.actor===actor&&l.target===a.target&&getEffect(l.id)?.kind==='discardRemoval'))continue;
  let benefit=0;
  if(e.mode==='continuousSpells'||e.mode==='continuousTraps'){
   const kind=e.mode==='continuousSpells'?'spell':'trap';
   const count=(i:number)=>s.players[i].backrow.filter(x=>x.faceUp&&getEffect(x.id)?.kind==='continuous'&&getPlayableCard(x.id)?.kind===kind).length;
   benefit=(count(1-actor)-count(actor))*30;
  }else{
   const target=enemy.monsters.find(m=>m.uid===a.target),back=[...enemy.backrow,...enemy.field?[enemy.field]:[]].find(b=>b.uid===a.target);
   if(target){if(!canAffectMonster(s,target.uid,a.kind))continue;benefit=target.faceUp?14+Math.max(atk(target,s),def(target,s))/100:23;
    if(s.pending.kind==='attack'&&s.pending.actor!==actor&&s.pending.card===target.uid)benefit+=12;
   }else if(back)benefit=back.faceUp?27:16;
  }
  const score=benefit-10-handCardValue(fee.id)*0.65;if(score>bestScore){best=a;bestScore=score;}
 }
 return removal.size?actions.filter(a=>!removal.has(a)||a===best):actions;
}
