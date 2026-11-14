/** Deterministic tactical evaluation using only own cards and public rival data.
 * No simulation against the true hidden state and no knowledge of deck order. */
import {atk,def,type DuelState,type Action,type Monster} from './duelEngine';
import {getPlayableCard as getCard} from './effectRegistry';
import {getMonsterEffect} from './monsterEffects';
/** Same public-information estimate for attack declaration and replay. */
export const UNKNOWN_DEFENSE_ESTIMATE=1600;
export function publicBattleAssessment(s:DuelState,attacker:Monster,target?:Monster){
 const power=atk(attacker,s);
 const resistance=target?target.faceUp?(target.position==='atk'?atk(target,s):def(target,s)):UNKNOWN_DEFENSE_ESTIMATE:0;
 const damage=!target||target.faceUp&&target.position==='atk'?Math.max(0,power-resistance):0;
 return {resistance,damage,safe:!target||power>=resistance&&power>0};
}
export function handCardValue(id:string){
 const c=getCard(id)!;
 if(c.kind!=='monster')return 25;
 const effect=getMonsterEffect(id),tribute=(c.level??0)>=7?10:(c.level??0)>=5?5:0;
 return Math.max(c.atk??0,c.defense??0)/100+(effect?9:0)-tribute;
}
function flipUtility(s:DuelState,id:string,cardId:string){
 const p=s.players.find(p=>p.id===id)!,op=s.players.find(p=>p.id!==id)!,effect=getMonsterEffect(cardId);
 if(effect?.trigger!=='flip')return 0;
 const action=effect.operation;
 if(action.kind==='destroy'||action.kind==='bounce')return op.monsters.length?25:0;
 if(action.kind==='recover')return p.grave.some(c=>getCard(c.id)?.kind===action.cardKind)?20:0;
 if(action.kind==='draw')return p.deck.length>=action.count?18:0;
 if(action.kind==='burnPerSpellTrap')return (op.backrow.length+Number(!!op.field))*action.amount/40;
 if(action.kind==='burn')return action.amount/40;
 if(action.kind==='burnPerHand')return op.hand.length*action.amount/40;
 if(action.kind==='destroyByLevel')return op.monsters.filter(m=>m.faceUp&&getCard(m.id)?.level===action.level).length*25;
 return 0;
}
export function tacticalSummon(s:DuelState,id:string,actions:Action[]):Action|undefined{
 const p=s.players.find(p=>p.id===id)!,op=s.players.find(p=>p.id!==id)!;
 const unknownDefenders=op.monsters.filter(m=>!m.faceUp).length;
 const candidates=actions.filter((a):a is Extract<Action,{kind:'summon'}>=>a.kind==='summon').map(action=>{
  const c=p.hand.find(c=>c.uid===action.card)!,info=getCard(c.id)!;
  const hypothetical={...c,position:action.position==='set'?'def':'atk',faceUp:true,entered:s.turn,changed:s.turn,attacked:0,atkBoost:0,defBoost:0} as Monster;
  // Continuous self-modifiers need the prospective monster to exist on its
  // controller's field. Include Tributes in their owners' graves without
  // mutating the real state or inspecting hidden opposing identities.
  const actor=s.players.indexOf(p),tributes=p.monsters.filter(m=>action.tributes.includes(m.uid));
  const preview={...s,players:s.players.map((player,index)=>({...player,
   hand:player.hand.filter(held=>held.uid!==c.uid),
   monsters:[...player.monsters.filter(m=>!action.tributes.includes(m.uid)),...index===actor?[hypothetical]:[]],
   grave:[...player.grave,...tributes.filter(m=>(m.owner??actor)===index).map(m=>({uid:m.uid,id:m.id,owner:m.owner??actor}))]
  }))} as DuelState;
  const attack=atk(hypothetical,preview),defense=def(hypothetical,preview),flip=getMonsterEffect(c.id)?.trigger==='flip'?Math.max(14,flipUtility(s,id,c.id)):0;
  const threat=Math.max(0,...preview.players[1-actor].monsters.filter(m=>m.faceUp&&m.position==='atk').map(m=>atk(m,preview)));
  const sacrifice=action.tributes.reduce((n,uid)=>{const m=p.monsters.find(m=>m.uid===uid)!;return n+Math.max(atk(m,s),def(m,s))/100+(getMonsterEffect(m.id)?5:0);},0);
  const danger=attack<threat;
  // Face-down opponents are not free direct attacks. Evaluate an unknown wall
  // without reading its identity, otherwise low-ATK summons are exposed needlessly.
  const hiddenRisk=unknownDefenders&&attack<UNKNOWN_DEFENSE_ESTIMATE?18+(UNKNOWN_DEFENSE_ESTIMATE-attack)/100:0;
  let score=action.position==='atk'?attack/100+12-(danger?55+(threat-attack)/100:0)-hiddenRisk:defense/100+3+flip+(danger||hiddenRisk?12:0);
  score-=sacrifice;
  // Breaking a public attack wall is worth spending Tributes; passive bodies are not.
  if(action.position==='atk'&&threat>0&&attack>=threat)score+=30;
  if(action.position==='atk'&&s.turn>1&&attack>=op.lp&&(!op.monsters.length||getMonsterEffect(c.id)?.operation.kind==='directAttack'))score+=100;
  return {action,score};
 });
 candidates.sort((a,b)=>b.score-a.score);
 return candidates[0]?.score>0?candidates[0].action:undefined;
}
export function tacticalPosition(s:DuelState,id:string,actions:Action[]):Action|undefined{
 const p=s.players.find(p=>p.id===id)!,op=s.players.find(p=>p.id!==id)!;
 const threat=Math.max(0,...op.monsters.filter(m=>m.faceUp&&m.position==='atk').map(m=>atk(m,s)));
 const candidates=actions.filter((a):a is Extract<Action,{kind:'position'}>=>a.kind==='position').map(action=>{
  const m=p.monsters.find(m=>m.uid===action.card)!;
  const attack=atk(m,s),defense=def(m,s),flip=flipUtility(s,id,m.id);
  const profitable=s.turn>1&&m.attacked!==s.turn&&op.monsters.some(t=>t.faceUp&&attack>(t.position==='atk'?atk(t,s):def(t,s)));
  const score=action.mode==='def'?(attack<threat&&!profitable?25+(defense-attack)/100:0):action.mode==='flip'&&flip>0?35:attack>=threat&&attack>defense?20:0;
  return {action,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
 return candidates[0]?.action;
}
export function tacticalAttack(s:DuelState,id:string,actions:Action[]):Action|undefined{
 const p=s.players.find(p=>p.id===id)!,op=s.players.find(p=>p.id!==id)!;
 return actions.filter((a):a is Extract<Action,{kind:'attack'}>=>a.kind==='attack').map(action=>{
  const m=p.monsters.find(m=>m.uid===action.card)!,power=atk(m,s),target=op.monsters.find(m=>m.uid===action.target);
  const {resistance,damage,safe}=publicBattleAssessment(s,m,target);
  // Includes legal equal-ATK trades; an unrevealed card never exposes its ID.
  const score=(!target||target.faceUp&&target.position==='atk')&&damage>=op.lp?10000:damage+(target?resistance/2:0);
  return {action,safe,score};
 }).filter(x=>x.safe).sort((a,b)=>b.score-a.score)[0]?.action;
}
