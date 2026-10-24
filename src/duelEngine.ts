import {randomInt} from 'node:crypto';
import {resolveChainLinks,type ChainLink} from './chainEngine';
import {getMonsterEffect,canActivateMonsterEffect,payMonsterEffectCost,monsterDestructionTarget,type MonsterEffect} from './monsterEffects';
import {getCard} from './collection';
import {enabledCardIds,getEffect,isQuickPlaySpell} from './effectRegistry';
import {spellActions,persistentModifier,resolveClassicSpell,discardBackrow,cleanEquips} from './classicEffects';
export type CardRef={uid:string;id:string;properlySummoned?:boolean};
export type Monster=CardRef&{position:'atk'|'def';faceUp:boolean;entered:number;changed:number;attacked:number;atkBoost:number;defBoost:number;owner?:number;returnTo?:number;returnTurn?:number;swappedUntil?:number;effectUsedTurn?:number};
export type Backrow=CardRef&{setTurn:number;faceUp:boolean;resolved?:boolean;equippedTo?:string};
export type DuelPlayer={id:string;name:string;lp:number;deck:CardRef[];hand:CardRef[];monsters:Monster[];backrow:Backrow[];grave:CardRef[];extra?:CardRef[];field?:Backrow|null;banished?:CardRef[];summoned:boolean;battleProtectedUntil?:number};
export type Action=
 |{kind:'summon';card:string;position:'atk'|'set';tributes:string[]}
 |{kind:'set';card:string}|{kind:'spell';card:string;target?:string;position?:'atk'|'def'}|{kind:'field'|'setField';card:string}
 |{kind:'fusion';card:string;extra:string;materials:string[];position:'atk'|'def'}
 |{kind:'position';card:string;mode:'atk'|'def'|'flip'}
 |{kind:'attack';card:string;target?:string}|{kind:'trap';card:string;target:string;discards?:string[]}
 |{kind:'monsterEffect';card:string;discards:string[];tributes?:string[];target?:string}
 |{kind:'choose';target:string}|{kind:'discard';card:string}
 |{kind:'battle'|'end'|'pass'|'concede'};
export type Pending={kind:'monsterEffect';actor:number;card:string;id:string;target?:string}|{kind:'summon'|'flip'|'specialSummon';actor:number;card:string;id?:string}|{kind:'field';actor:number;card:string}|{kind:'fusion';actor:number;card:string;extra:string;materials:string[];position:'atk'|'def'}|{kind:'none'|'end'|'battle'}|{kind:'attack';actor:number;card:string;target?:string;stage:'declare'|'damage'}|{kind:'spell';actor:number;card:string;id:string;target?:string;position?:'atk'|'def'};
export type DuelState={version:1;encounter?:{npcId:string;eventDay?:string};reward?:{dp:number;xp:number;cards:string[];first:boolean;daily:boolean;note:string};fixedOpening?:boolean;players:[DuelPlayer,DuelPlayer];turn:number;current:number;phase:'main'|'battle'|'response'|'choice'|'discard'|'finished';resume:'main'|'battle';priority:number;passes:number;pending:Pending;pendingNegated?:boolean;chain:ChainLink[];choice?:{actor:number;targets:string[];source?:'monsterDestroy'|'monsterTarget'|'monsterSearch'|'monsterRecruit'};afterMonsterEffect?:Pending;graveTriggers?:{actor:number;card:string;id:string}[];summonTriggers?:{actor:number;card:string;id:string}[];monsterNameUsed?:[Record<string,number>,Record<string,number>];blockedEffectNames?:[Record<string,number>,Record<string,number>];battleFlip?:{actor:number;card:string;id:string};winner:string|null;reason:string;log:string[]};
export const IMPLEMENTED_DUEL_CARDS:readonly string[]=enabledCardIds;
const supported=new Set(IMPLEMENTED_DUEL_CARDS);
const card=(id:string)=>{const c=getCard(id);if(!c)throw new Error('Carta não implementada.');return c;};
export function validateDuelCards(ids:string[]){
 if(ids.length<20||ids.length>30)throw new Error('O duelo exige um deck de 20 a 30 cartas.');
 const counts=new Map<string,number>();for(const id of ids){const c=card(id);if(c.fusion)throw new Error('Fusões pertencem ao Deck Adicional.');counts.set(id,(counts.get(id)??0)+1);if(counts.get(id)!>3)throw new Error('Máximo de 3 cópias por carta.');if(!supported.has(id))throw new Error(`Efeito não implementado: ${c.name}.`);}
}
export function createDuel(players:[{id:string;name:string;cards:string[];extra?:string[]},{id:string;name:string;cards:string[];extra?:string[]}],rng:()=>number=Math.random,first=0):DuelState{
 if(players[0].id===players[1].id)throw new Error('São necessários dois duelistas distintos.');
 if(first!==0&&first!==1)throw new Error('Primeiro jogador inválido.');
 const ps=players.map((p,index)=>{validateDuelCards(p.cards);if((p.extra?.length??0)>6)throw new Error('Deck Adicional: máximo de 6 cartas.');const counts=new Map<string,number>();for(const id of p.extra??[]){if(!card(id).fusion||!supported.has(id))throw new Error('Fusão não implementada.');counts.set(id,(counts.get(id)??0)+1);if(counts.get(id)!>3)throw new Error('Máximo de 3 cópias no Deck Adicional.');}const deck=p.cards.map((id,n)=>({id,uid:`${index}-${n}`}));
  for(let i=deck.length-1;i>0;i--){const r=rng===Math.random?randomInt(i+1):Math.floor(rng()*(i+1));if(!Number.isInteger(r)||r<0||r>i)throw new Error('Sorteio inválido.');[deck[i],deck[r]]=[deck[r],deck[i]];}
  return {id:p.id,name:p.name.slice(0,32),lp:4000,hand:deck.splice(0,4),deck,monsters:[],backrow:[],grave:[],extra:(p.extra??[]).map((id,n)=>({id,uid:`${index}-e${n}`})),field:null,banished:[],summoned:false} as DuelPlayer;
 }) as [DuelPlayer,DuelPlayer];
 return {version:1,players:ps,turn:1,current:first,phase:'main',resume:'main',priority:first,passes:0,pending:{kind:'none'},chain:[],winner:null,reason:'',log:[`${ps[first].name} começa. Sem compra ou batalha no primeiro turno.`]};
}
export function atk(m:Monster,s?:DuelState){return Math.max(0,(s&&m.swappedUntil===s.turn?card(m.id).defense!:card(m.id).atk!)+m.atkBoost+(s?persistentModifier(m,s,'atk'):0));}
export function def(m:Monster,s?:DuelState){return Math.max(0,(s&&m.swappedUntil===s.turn?card(m.id).atk!:card(m.id).defense!)+m.defBoost+(s?persistentModifier(m,s,'def'):0));}
export function decisionPlayer(s:DuelState){return s.phase==='response'?s.priority:s.phase==='choice'?s.choice!.actor:s.current;}
export function timeoutDuel(input:DuelState):DuelState{if(input.phase==='finished')return input;const s=structuredClone(input);finish(s,1-decisionPlayer(s),'vitória por W.O.: tempo de decisão esgotado');return s;}
function note(s:DuelState,text:string){s.log.push(text);s.log=s.log.slice(-12);}
function findMonster(s:DuelState,uid:string){for(const p of s.players){const m=p.monsters.find(m=>m.uid===uid);if(m)return {p,m};}}
function graveMonster(s:DuelState,uid:string,byBattle=false){const found=findMonster(s,uid);if(found){const controller=s.players.indexOf(found.p);const owner=found.m.owner??controller;found.p.monsters=found.p.monsters.filter(m=>m.uid!==uid);s.players[owner].grave.push({uid:found.m.uid,id:found.m.id,...found.m.properlySummoned?{properlySummoned:true}:{}});
const effect=getMonsterEffect(found.m.id);
if(effect?.trigger==='onSentToGrave'||(byBattle&&effect?.trigger==='onBattleDestroyed'))(s.graveTriggers??=[]).push({actor:owner,card:found.m.uid,id:found.m.id});
cleanEquips(s);}}

function finish(s:DuelState,winner:number|null,reason:string){s.phase='finished';s.winner=winner===null?null:s.players[winner].id;s.reason=reason;note(s,`${winner===null?'Empate':`${s.players[winner].name} venceu`}: ${reason}.`);}
function checkLP(s:DuelState){if(s.players.every(p=>p.lp<=0))finish(s,null,'pontos de vida');else for(let i=0;i<2;i++)if(s.players[i].lp<=0)finish(s,1-i,'pontos de vida');}
function combos<T>(values:T[],n:number):T[][]{if(n===0)return [[]];return values.flatMap((v,i)=>combos(values.slice(i+1),n-1).map(rest=>[v,...rest]));}
/** Only activation-time targets may be chosen. Resolution must never retarget. */
function monsterTargets(s:DuelState,actor:number,e:MonsterEffect):string[]|undefined{
 const op=e.operation;
 if(op.kind==='destroy'||op.kind==='bounce')return (op.target==='anyMonster'?s.players:s.players.filter((_,i)=>i!==actor)).flatMap(p=>p.monsters.map(m=>m.uid));
 if(op.kind==='recover')return s.players[actor].grave.filter(c=>card(c.id).kind===op.cardKind).map(c=>c.uid);
 return undefined;
}
function effectNameBlocked(s:DuelState,actor:number,id:string):boolean{return s.blockedEffectNames?.[actor]?.[id]===s.turn;}
function searchDeckTargets(s:DuelState,actor:number,stat:'atk'|'defense',maximum:number,attribute?:string):string[]{
 return s.players[actor].deck.filter(c=>{
  const info=card(c.id);
  return info.kind==='monster'&&typeof info[stat]==='number'&&info[stat]<=maximum&&(!attribute||info.attribute===attribute);
 }).map(c=>c.uid);
}
/** Continuous effects are recalculated from face-up field state, not cached. */
function trapsNegated(s:DuelState):boolean{
 return s.players.some(p=>p.monsters.some(m=>m.faceUp&&getMonsterEffect(m.id)?.operation.kind==='negateTraps'));
}
function trapActions(s:DuelState,index:number):Action[]{
 if(trapsNegated(s))return [];
 const out:Action[]=[];
 const last=s.phase==='response'?s.chain.at(-1):undefined;
 const lastKind=last?getEffect(last.id)?.kind:undefined;
 const counterWindow=lastKind==='magicJammer'||lastKind==='sevenTools';
 for(const c of s.players[index].backrow.filter(c=>!c.faceUp&&c.setTurn<s.turn&&card(c.id).kind==='trap')){
  const effect=getEffect(c.id);if(!effect||effectNameBlocked(s,index,c.id))continue;
  if(effect.kind==='magicJammer'){
   if(s.phase==='response'&&!counterWindow){
    const spellTarget=last&&isQuickPlaySpell(last.id)?last.card:!last&&['spell','field','fusion'].includes(s.pending.kind)&&'card' in s.pending?s.pending.card:undefined;
    if(spellTarget)for(const discarded of s.players[index].hand)out.push({kind:'trap',card:c.uid,target:spellTarget,discards:[discarded.uid]});
   }
   continue;
  }
  if(effect.kind==='sevenTools'){
   if(s.phase==='response'&&last&&lastKind!=='mysticalSpaceTyphoon'&&s.players[index].lp>1000)out.push({kind:'trap',card:c.uid,target:last.card});
   continue;
  }
  // Counter Traps have Spell Speed 3: ordinary Traps cannot be chained to them.
  if(counterWindow)continue;
  if(s.phase==='response'&&s.pending.kind==='attack'&&s.pending.stage==='damage'&&!['reinforcements','castleWalls'].includes(effect.kind))continue;
  if(effect.kind==='reinforcements'||effect.kind==='castleWalls')out.push(...s.players.flatMap(p=>p.monsters.filter(m=>m.faceUp).map(m=>({kind:'trap',card:c.uid,target:m.uid}) as Action)));
  else if(effect.kind==='waboku')out.push({kind:'trap',card:c.uid,target:''});
  else if(effect.kind==='justDesserts'&&s.players[1-index].monsters.length)out.push({kind:'trap',card:c.uid,target:''});
  else if(effect.kind==='mirrorForce'&&s.phase==='response'&&s.pending.kind==='attack'&&s.pending.stage==='declare'&&s.pending.actor!==index)
   out.push({kind:'trap',card:c.uid,target:''});
  else if(effect.kind==='torrentialTribute'&&s.phase==='response'&&['summon','flip','specialSummon'].includes(s.pending.kind)&&s.players.some(p=>p.monsters.length))
   out.push({kind:'trap',card:c.uid,target:''});
  else if(effect.kind==='trapHole'&&s.phase==='response'&&['summon','flip'].includes(s.pending.kind)&&s.pending.actor!==index){const m='card' in s.pending?findMonster(s,s.pending.card)?.m:undefined;if(m?.faceUp&&atk(m,s)>=1000)out.push({kind:'trap',card:c.uid,target:m.uid});}
 }return out;
}

/** Quick-Play spells can be played from the current player's hand, or from a
 * Spell/Trap Zone if they were set on a previous turn. They cannot answer
 * Counter Traps (Spell Speed 3) or be activated during the Damage Step.
 */
function quickSpellActions(s:DuelState,index:number):Action[]{
 if(s.phase!=='response')return [];
 const last=s.chain.at(-1),lastKind=last?getEffect(last.id)?.kind:undefined;
 if(lastKind==='magicJammer'||lastKind==='sevenTools')return [];
 if(s.pending.kind==='attack'&&s.pending.stage==='damage')return [];
 const p=s.players[index],candidates=[
  ...p.backrow.filter(c=>!c.faceUp&&c.setTurn<s.turn&&isQuickPlaySpell(c.id)),
  ...index===s.current&&p.backrow.length<3?p.hand.filter(c=>isQuickPlaySpell(c.id)):[]
 ];
 return candidates.flatMap(c=>{
  const targetUids=getEffect(c.id)?.kind==='bookOfMoon'
   ?s.players.flatMap(player=>player.monsters.filter(m=>m.faceUp).map(m=>m.uid))
   :s.players.flatMap(player=>[...player.backrow,...player.field?[player.field]:[]].map(card=>card.uid).filter(uid=>uid!==c.uid));
  return targetUids.map(target=>({kind:'spell',card:c.uid,target} as Action));
 });
}
export function legalActions(s:DuelState,actor:string):Action[]{
 const index=s.players.findIndex(p=>p.id===actor);if(index<0||s.phase==='finished')return [];
 if(s.phase==='response')return index===s.priority?[...trapActions(s,index),...quickSpellActions(s,index),{kind:'pass'}]:[];
 if(s.phase==='choice')return s.choice?.actor===index?s.choice.targets.map(target=>({kind:'choose',target})):[];
 if(index!==s.current)return [];
 const p=s.players[index],op=s.players[1-index];
 if(s.phase==='discard')return p.hand.map(c=>({kind:'discard',card:c.uid}));
 const actions:Action[]=[...trapActions(s,index)];
 if(s.phase==='main'){
  for(const c of p.hand){const info=card(c.id);
   if(info.kind==='monster'&&!p.summoned){const n=info.level!>=7?2:info.level!>=5?1:0;
    if(p.monsters.length-n<3)for(const tributes of combos(p.monsters.map(m=>m.uid),n))for(const position of ['atk','set'] as const)actions.push({kind:'summon',card:c.uid,position,tributes});
   }else if(info.field){actions.push({kind:'setField',card:c.uid});if(!effectNameBlocked(s,index,c.id))actions.push({kind:'field',card:c.uid});}
   else if(info.kind!=='monster'&&p.backrow.length<3)actions.push({kind:'set',card:c.uid});
  }
  if(p.field&&!p.field.faceUp&&!effectNameBlocked(s,index,p.field.id))actions.push({kind:'field',card:p.field.uid});
  for(const c of [...(p.backrow.length<3?p.hand:[]),...p.backrow.filter(c=>!c.faceUp)])if(card(c.id).kind==='spell'&&!card(c.id).field&&!effectNameBlocked(s,index,c.id)){
    if(c.id==='24094653'){
      for(const extra of p.extra??[]){const recipe=card(extra.id).fusion!;const pool=[...p.hand,...p.monsters];
       for(const materials of combos(pool,recipe.length))if([...materials.map(m=>m.id)].sort().join(',')===[...recipe].sort().join(',')&&p.monsters.length-materials.filter(m=>p.monsters.some(n=>n.uid===m.uid)).length<3)
        for(const position of ['atk','def'] as const)actions.push({kind:'fusion',card:c.uid,extra:extra.uid,materials:materials.map(m=>m.uid),position});
      }
    }else actions.push(...spellActions(s,index,c));
  }
  for(const m of p.monsters){
   const e=m.faceUp?getMonsterEffect(m.id):undefined;
   if(e?.trigger==='ignition'&&!effectNameBlocked(s,index,m.id)){
    const context={lp:p.lp,handSize:p.hand.length,deckSize:p.deck.length,fieldMonsterCount:p.monsters.length,usedThisTurn:m.effectUsedTurn===s.turn};
    if(canActivateMonsterEffect(e,context)){
     const n=e.cost?.kind==='discard'?e.cost.count:0,tributeCount=e.cost?.kind==='tribute'?e.cost.count:0;
     const targets=monsterTargets(s,index,e);
     for(const discards of combos(p.hand.map(c=>c.uid),n))
      for(const tributes of combos(p.monsters.map(x=>x.uid),tributeCount))
       for(const target of targets??[undefined])if(targets===undefined||target!==undefined)
        actions.push({kind:'monsterEffect',card:m.uid,discards,...tributes.length?{tributes}:{},...target?{target}:{}});

    }
   }
  }
  for(const m of p.monsters)if(m.entered<s.turn&&m.changed<s.turn&&m.attacked<s.turn)actions.push({kind:'position',card:m.uid,mode:!m.faceUp?'flip':m.position==='atk'?'def':'atk'});
  if(s.turn>1)actions.push({kind:'battle'});
 }else if(s.phase==='battle'){
  for(const m of p.monsters)if(m.faceUp&&m.position==='atk'&&m.attacked<s.turn){
   if(!op.monsters.length)actions.push({kind:'attack',card:m.uid});else for(const target of op.monsters)actions.push({kind:'attack',card:m.uid,target:target.uid});
  }
 }
 actions.push({kind:'end'});return actions;
}
function response(s:DuelState,pending:Pending,resume:'main'|'battle',priority=1-s.current){s.pending=pending;s.pendingNegated=false;s.resume=resume;s.phase='response';s.priority=priority;s.passes=0;s.chain=[];}
function endTurn(s:DuelState){
 for(const p of s.players)for(const m of [...p.monsters]){m.atkBoost=0;m.defBoost=0;if(m.returnTo!==undefined&&m.returnTurn===s.turn){const target=s.players[m.returnTo];if(target!==p){if(target.monsters.length<3){p.monsters=p.monsters.filter(c=>c.uid!==m.uid);target.monsters.push(m);}else graveMonster(s,m.uid);}delete m.returnTo;delete m.returnTurn;}}
 if(s.players[s.current].hand.length>6){s.phase='discard';note(s,'Descarte até ficar com 6 cartas.');return;}
 nextTurn(s);
}
function nextTurn(s:DuelState){s.current=1-s.current;s.turn++;s.phase='main';s.players[s.current].summoned=false;
 const p=s.players[s.current];const c=p.deck.shift();if(!c){finish(s,1-s.current,'não conseguiu comprar uma carta');return;}p.hand.push(c);note(s,`Turno ${s.turn}: ${p.name} comprou uma carta.`);
}
/** Triggered effects may resolve after their source left the field (battle FLIP).
 * For targeted triggers, offer target choices BEFORE opening the chain window.
 */
function triggerMonsterEffect(s:DuelState,actor:number,uid:string,trigger:'flip'|'onSummon',sourceId?:string){
 const m=s.players[actor].monsters.find(m=>m.uid===uid);
 if(!sourceId&&(!m||!m.faceUp))return false;
 const id=sourceId??m!.id,e=getMonsterEffect(id);
 if(!e||e.trigger!==trigger||effectNameBlocked(s,actor,id))return false;
 const p=s.players[actor];
 const targets=monsterTargets(s,actor,e);
 if(targets!==undefined&&!targets.length)return false;
 const ctx={lp:p.lp,handSize:p.hand.length,deckSize:p.deck.length,usedThisTurn:m?.effectUsedTurn===s.turn};
 // Mandatory flip draws must be attempted even if the deck is empty.
 const check=e.operation.kind==='draw'&&trigger==='flip'?{...ctx,deckSize:Math.max(p.deck.length,e.operation.count)}:ctx;
 if(!canActivateMonsterEffect(e,check)||e.cost?.kind==='discard')return false;
 const cost=payMonsterEffectCost(e,check);
 p.lp-=cost.lpPaid;if(m)m.effectUsedTurn=s.turn;
 note(s,`Efeito de ${card(id).name} ativado.`);
 if(targets){
  s.pending={kind:'monsterEffect',actor,card:uid,id};
  s.choice={actor,targets,source:'monsterTarget'};s.phase='choice';
 }else response(s,{kind:'monsterEffect',actor,card:uid,id},s.resume,1-actor);
 return true;
}
/** Queue field-to-graveyard effects; once-per-turn applies across instances. */
function activateGraveTrigger(s:DuelState,event:{actor:number;card:string;id:string}):boolean{
 const e=getMonsterEffect(event.id),actor=event.actor;
 if(!e||!['onSentToGrave','onBattleDestroyed'].includes(e.trigger)||effectNameBlocked(s,actor,event.id))return false;
 const search=e.operation;
 if(search.kind==='search'){
  if(!searchDeckTargets(s,actor,search.stat,search.maximum).length)return false;
 }else if(search.kind==='specialSummon'){
  if(s.players[actor].monsters.length>=3||!searchDeckTargets(s,actor,'atk',search.maximumAtk,search.attribute).length)return false;
 }else return false;
 if(e.oncePerTurn&&s.monsterNameUsed?.[actor]?.[event.id]===s.turn)return false;
 s.monsterNameUsed??=[{},{}];s.monsterNameUsed[actor][event.id]=s.turn;
 note(s,`${card(event.id).name}: efeito ativado ao entrar no Cemitério.`);
 response(s,{kind:'monsterEffect',actor,card:event.card,id:event.id},s.resume,1-actor);
 return true;
}
/** Watches a successful Normal or Flip Summon. The newly summoned card
 * never triggers its own 'another monster' effect, and a battle reveal is
 * not a Flip Summon. The source must remain face-up to activate. */
function queueOtherSummonTriggers(s:DuelState,summonedUid:string):void{
 for(const [actor,p] of s.players.entries())for(const m of p.monsters){
  if(m.uid!==summonedUid&&m.faceUp&&getMonsterEffect(m.id)?.trigger==='onOtherSummon')
   (s.summonTriggers??=[]).push({actor,card:m.uid,id:m.id});
 }
}
function activateOtherSummonTrigger(s:DuelState,event:{actor:number;card:string;id:string}):boolean{
 const m=s.players[event.actor].monsters.find(m=>m.uid===event.card);
 if(!m?.faceUp||m.id!==event.id)return false;
 const e=getMonsterEffect(event.id);
 if(e?.trigger!=='onOtherSummon'||effectNameBlocked(s,event.actor,event.id))return false;
 note(s,`${card(event.id).name} reagiu à Invocação de outro monstro.`);
 response(s,{kind:'monsterEffect',actor:event.actor,card:event.card,id:event.id},s.resume,1-event.actor);
 return true;
}
function resolve(s:DuelState){
 resolveChainLinks(s.chain,link=>{
  // Jinzo negates Trap effects on the field at the moment each link resolves;
  // costs already paid and cards activated earlier still go to the Graveyard.
  const effect=getEffect(link.id);
  if(trapsNegated(s)&&card(link.id).kind==='trap'){note(s,'Jinzo negou um efeito de Armadilha.');discardBackrow(s,link.card);return;}
  const target=findMonster(s,link.target)?.m;
  if(effect?.kind==='mysticalSpaceTyphoon'){
   if(s.players.some(p=>p.backrow.some(b=>b.uid===link.target)||p.field?.uid===link.target))discardBackrow(s,link.target);
   note(s,'Tufão Espacial Místico destruiu o alvo sem negar sua ativação.');
   discardBackrow(s,link.card);return;
  }
  if(effect?.kind==='bookOfMoon'){
   const m=findMonster(s,link.target)?.m;
   if(m?.faceUp){m.faceUp=false;m.position='def';m.changed=s.turn;note(s,`Livro da Lua virou ${card(m.id).name} para Defesa com a face para baixo.`);}
   discardBackrow(s,link.card);return;
  }
  if(effect?.kind==='torrentialTribute'){
   const monsters=s.players.flatMap(p=>p.monsters.map(m=>m.uid));
   for(const uid of monsters)graveMonster(s,uid);
   note(s,`Tributo Torrencial destruiu ${monsters.length} monstro(s) no campo.`);
   discardBackrow(s,link.card);return;
  }
  if(effect?.kind==='sevenTools'){
   const negated=s.chain.find(other=>other.card===link.target);
   if(negated){negated.negated=true;note(s,'Sete Ferramentas negou a ativação da Armadilha.');}
   discardBackrow(s,link.card);return;
  }
  if(effect?.kind==='magicJammer'){
   const spellLink=s.chain.find(other=>other.card===link.target&&isQuickPlaySpell(other.id));
   if(spellLink){spellLink.negated=true;note(s,'Bloqueador de Magia negou uma Magia Rápida na corrente.');}
   else if(['spell','field','fusion'].includes(s.pending.kind)&&'card' in s.pending&&s.pending.card===link.target){
    s.pendingNegated=true;
    discardBackrow(s,link.target);
    note(s,'Bloqueador de Magia negou a ativação da Magia.');
   }
   discardBackrow(s,link.card);return;
  }
  if(target?.faceUp){if(effect?.kind==='reinforcements')target.atkBoost+=500;else if(effect?.kind==='castleWalls')target.defBoost+=500;else if(effect?.kind==='trapHole')graveMonster(s,target.uid);}
  if(effect?.kind==='waboku')s.players[link.actor].battleProtectedUntil=s.turn;
  if(effect?.kind==='justDesserts'){const op=s.players[1-link.actor];op.lp=Math.max(0,op.lp-500*op.monsters.length);checkLP(s);}
  if(effect?.kind==='mirrorForce'){
   const opponent=s.players[1-link.actor];
   const attackers=opponent.monsters.filter(m=>m.position==='atk').map(m=>m.uid);
   for(const uid of attackers)graveMonster(s,uid);
   note(s,`Força do Espelho destruiu ${attackers.length} monstro(s) adversário(s) em Ataque.`);
  }
  discardBackrow(s,link.card);},link=>{discardBackrow(s,link.card);},()=>s.phase==='finished');
 s.chain=[];if(s.phase==='finished'){s.pending={kind:'none'};s.pendingNegated=false;return;}
 const pending=s.pending,negated=s.pendingNegated===true;s.pending={kind:'none'};s.pendingNegated=false;s.phase=s.resume;
 if(negated){note(s,'Ativação negada: o efeito da Magia não foi resolvido.');return;}
 if(pending.kind==='monsterEffect'){
  const p=s.players[pending.actor],e=getMonsterEffect(pending.id);
  // Paid costs are never refunded and removing the source does not negate its effect.
  if(!e)return;
  const op=e.operation;
  if(op.kind==='heal')p.lp+=op.amount;
  else if(op.kind==='burn'){const other=s.players[1-pending.actor];other.lp=Math.max(0,other.lp-op.amount);checkLP(s);}
  else if(op.kind==='draw'){
   if(p.deck.length<op.count){finish(s,1-pending.actor,'não conseguiu comprar uma carta');return;}
   p.hand.push(...p.deck.splice(0,op.count));
  }else if(op.kind==='destroy'||op.kind==='bounce'){
   const target=pending.target?findMonster(s,pending.target):undefined;
   if(target){
    if(op.kind==='destroy'){graveMonster(s,target.m.uid);note(s,'Efeito destruiu o monstro escolhido.');}
    else{
     const controller=s.players.indexOf(target.p),owner=target.m.owner??controller;
     const uid=target.m.uid,id=target.m.id;
     target.p.monsters=target.p.monsters.filter(m=>m.uid!==uid);
     if(card(id).fusion)s.players[owner].extra=[...s.players[owner].extra??[],{uid,id}];
     else s.players[owner].hand.push({uid,id});
     cleanEquips(s);note(s,'Efeito devolveu o monstro ao dono.');
    }
   }else note(s,'O alvo do efeito não está mais no campo.');
  }else if(op.kind==='search'||op.kind==='specialSummon'){
   const recruit=op.kind==='specialSummon';
   const targets=recruit?searchDeckTargets(s,pending.actor,'atk',op.maximumAtk,op.attribute):searchDeckTargets(s,pending.actor,op.stat,op.maximum);
   if(targets.length&&(!recruit||p.monsters.length<3)){
    s.pending=pending;
    s.choice={actor:pending.actor,targets:recruit?[...targets,'__skip__']:targets,source:recruit?'monsterRecruit':'monsterSearch'};s.phase='choice';
    note(s,recruit?'Tomate Místico: escolha um monstro TREVAS de até 1500 ATK ou recuse a Invocação.':'Escolha um monstro elegível do seu Deck.');
    return;
   }
   note(s,'Nenhum monstro elegível no Deck ou nenhuma zona livre.');
  }else if(op.kind==='recover'){
   const i=p.grave.findIndex(c=>c.uid===pending.target&&card(c.id).kind===op.cardKind);
   if(i>=0){const [recovered]=p.grave.splice(i,1);p.hand.push(recovered);note(s,'Carta recuperada do Cemitério.');}
   else note(s,'O alvo não está mais no Cemitério.');
  }
  note(s,'Efeito de monstro resolvido.');
  return;
 }
 if(pending.kind==='flip'||pending.kind==='summon'||pending.kind==='specialSummon'){
  // Only Normal/Flip Summons trigger monsters that specifically react to them.
  if(pending.kind!=='specialSummon')queueOtherSummonTriggers(s,pending.card);
  // A FLIP or Summon trigger can still activate if a chained Trap destroyed
  // the source after the summon; the source ID is captured at declaration.
  triggerMonsterEffect(s,pending.actor,pending.card,pending.kind==='flip'?'flip':'onSummon',pending.id);
  return;
 }
 if(pending.kind==='end'){endTurn(s);return;}
 if(pending.kind==='battle'){s.phase='battle';note(s,'Fase de Batalha.');return;}
 if(pending.kind==='field'){const f=s.players[pending.actor].field;if(f?.uid===pending.card)f.resolved=true;note(s,`${f?card(f.id).name:'Magia de Campo'} entrou em vigor.`);return;}
 if(pending.kind==='fusion'){
  const p=s.players[pending.actor],poly=p.backrow.find(c=>c.uid===pending.card),fusion=p.extra?.find(c=>c.uid===pending.extra);
  const materials=pending.materials.map(uid=>[...p.hand,...p.monsters].find(c=>c.uid===uid));
  p.backrow=p.backrow.filter(c=>c.uid!==pending.card);if(poly)p.grave.push({uid:poly.uid,id:poly.id});
  if(fusion&&materials.every(Boolean)){
   for(const uid of pending.materials){const hand=p.hand.find(c=>c.uid===uid);if(hand){p.hand=p.hand.filter(c=>c.uid!==uid);p.grave.push(hand);}else graveMonster(s,uid);}
   p.extra=p.extra!.filter(c=>c.uid!==fusion.uid);p.monsters.push({...fusion,properlySummoned:true,owner:pending.actor,position:pending.position,faceUp:true,entered:s.turn,changed:s.turn,attacked:0,atkBoost:0,defBoost:0});
   note(s,`${p.name} fez a Invocação-Fusão de ${card(fusion.id).name}.`);response(s,{kind:'specialSummon',actor:pending.actor,card:fusion.uid,id:fusion.id},'main');
  }return;
 }
 if(pending.kind==='spell'){
  const p=s.players[pending.actor],op=s.players[1-pending.actor];const c=p.backrow.find(c=>c.uid===pending.card);
  if(getEffect(pending.id)?.kind!=='equip'){p.backrow=p.backrow.filter(c=>c.uid!==pending.card);if(c)p.grave.push({uid:c.uid,id:c.id});}
  if(resolveClassicSpell(s,pending,{destroy:graveMonster,note,finish,checkLP,onSpecialSummon:(state,actor,uid,id)=>response(state,{kind:'specialSummon',actor,card:uid,id},state.resume,1-actor)}))return;
  if(getEffect(pending.id)?.kind==='fissure') {const face=op.monsters.filter(m=>m.faceUp);if(face.length){const min=Math.min(...face.map(m=>atk(m,s)));const targets=face.filter(m=>atk(m,s)===min).map(m=>m.uid);
   if(targets.length===1){note(s,`Fissura destruiu ${card(findMonster(s,targets[0])!.m.id).name}.`);graveMonster(s,targets[0]);}
   else{s.choice={actor:pending.actor,targets};s.phase='choice';note(s,'Fissura: escolha um dos monstros empatados no menor ATK.');}
  }}else throw new Error('Efeito sem implementação explícita.');return;
 }
 if(pending.kind==='attack'){
  const attacking=findMonster(s,pending.card);if(!attacking||attacking.p!==s.players[pending.actor]||!attacking.m.faceUp||attacking.m.position!=='atk')return;const a=attacking.m;const defender=pending.target?findMonster(s,pending.target):undefined;
  if(pending.stage==='declare'){
   if(defender&&!defender.m.faceUp){
    defender.m.faceUp=true;note(s,`Revelado: ${card(defender.m.id).name}.`);
    if(getMonsterEffect(defender.m.id)?.trigger==='flip')
     s.battleFlip={actor:1-pending.actor,card:defender.m.uid,id:defender.m.id};
   }
   response(s,{...pending,stage:'damage'},'battle',1-pending.actor);return;
  }
  const opponent=s.players[1-pending.actor];
  if(!pending.target){if(opponent.monsters.length)return;const damage=opponent.battleProtectedUntil===s.turn?0:atk(a,s);opponent.lp=Math.max(0,opponent.lp-damage);note(s,`Ataque direto: ${damage} de dano.`);}
  else if(defender){const d=defender.m;const difference=atk(a,s)-(d.position==='atk'?atk(d,s):def(d,s));
   if(d.position==='atk'){
    if(difference>0){if(opponent.battleProtectedUntil!==s.turn){graveMonster(s,d.uid,true);opponent.lp=Math.max(0,opponent.lp-difference);}}
    else if(difference<0){if(s.players[pending.actor].battleProtectedUntil!==s.turn){graveMonster(s,a.uid,true);s.players[pending.actor].lp=Math.max(0,s.players[pending.actor].lp+difference);}}
    else if(atk(a,s)>0){if(s.players[pending.actor].battleProtectedUntil!==s.turn)graveMonster(s,a.uid,true);if(opponent.battleProtectedUntil!==s.turn)graveMonster(s,d.uid,true);}
   }else{if(difference>0&&opponent.battleProtectedUntil!==s.turn)graveMonster(s,d.uid,true);else if(difference<0&&s.players[pending.actor].battleProtectedUntil!==s.turn)s.players[pending.actor].lp=Math.max(0,s.players[pending.actor].lp+difference);}
   note(s,`${card(a.id).name} enfrentou ${card(d.id).name}. Diferença: ${Math.abs(difference)}.`);
  }
  checkLP(s);
  // FLIP effects revealed by battle are activated after damage calculation,
  // including when the defending monster was destroyed in that battle.
  const flip=s.battleFlip;s.battleFlip=undefined;
  if(s.winner===null&&flip)triggerMonsterEffect(s,flip.actor,flip.card,'flip',flip.id);
 }
}
function settle(s:DuelState){
 let budget=100;
 while(budget-->0){
  if(s.phase==='finished'){s.graveTriggers=[];s.summonTriggers=[];return;}
  if(s.phase==='response'){
   if(trapActions(s,s.priority).length||quickSpellActions(s,s.priority).length)return;
   s.passes++;s.priority=1-s.priority;
   if(s.passes===2)resolve(s);
   continue;
  }
  if(s.phase!=='main'&&s.phase!=='battle')return;
  const event=s.graveTriggers?.shift();if(event){activateGraveTrigger(s,event);continue;}
  const summoned=s.summonTriggers?.shift();if(summoned){activateOtherSummonTrigger(s,summoned);continue;}
  return;
 }
 throw new Error('Limite de encadeamento de eventos do Cemitério excedido.');
}
export function step(input:DuelState,actor:string,action:Action):DuelState{
 const index=input.players.findIndex(p=>p.id===actor);if(index<0)throw new Error('Você não participa deste duelo.');
 if(input.phase==='finished')throw new Error('Esse duelo já terminou.');
 if(action.kind!=='concede'&&!legalActions(input,actor).some(a=>JSON.stringify(a)===JSON.stringify(action)))throw new Error('Ação inválida ou fora da sua vez. Atualize o painel.');
 const s=structuredClone(input);const p=s.players[index];
 if(action.kind==='concede'){finish(s,1-index,'desistência');return s;}
 if(action.kind==='pass'){s.passes++;s.priority=1-index;if(s.passes===2)resolve(s);}
 else if(action.kind==='trap'){
  if(s.phase!=='response')response(s,{kind:'none'},s.phase as 'main'|'battle',1-index);
  const c=p.backrow.find(c=>c.uid===action.card)!;
  const e=getEffect(c.id),discards=action.discards??[];
  if(e?.kind==='magicJammer'){
   if(discards.length!==1||!p.hand.some(h=>h.uid===discards[0]))throw new Error('Custo de descarte inválido.');
   const [discarded]=p.hand.splice(p.hand.findIndex(h=>h.uid===discards[0]),1);
   p.grave.push(discarded);note(s,`${p.name} descartou uma carta para ativar Bloqueador de Magia.`);
  }else if(discards.length)throw new Error('Descarte não permitido para esta Armadilha.');
  if(e?.kind==='sevenTools'){
   if(p.lp<=1000)throw new Error('PV insuficientes para o custo.');
   p.lp-=1000;note(s,`${p.name} pagou 1000 PV para Sete Ferramentas.`);
  }
  c.faceUp=true;s.chain.push({actor:index,card:c.uid,id:c.id,target:action.target});s.passes=0;s.priority=1-index;note(s,`${p.name} ativou ${card(c.id).name}.`);
 }else if(action.kind==='monsterEffect'){
  const m=p.monsters.find(m=>m.uid===action.card)!;const e=getMonsterEffect(m.id)!;
  const sourceUid=m.uid,sourceId=m.id;
  const cost=payMonsterEffectCost(e,{lp:p.lp,handSize:p.hand.length,deckSize:p.deck.length,fieldMonsterCount:p.monsters.length,usedThisTurn:m.effectUsedTurn===s.turn});
  if(action.discards.length!==cost.cardsDiscarded||new Set(action.discards).size!==action.discards.length)throw new Error('Custo de descarte inválido.');
  const tributeCount=e.cost?.kind==='tribute'?e.cost.count:0,tributes=action.tributes??[];
  if(tributes.length!==tributeCount||new Set(tributes).size!==tributes.length||tributes.some(uid=>!p.monsters.some(m=>m.uid===uid)))throw new Error('Custo de Tributo inválido.');
  const targets=monsterTargets(s,index,e);
  if(targets&&(!action.target||!targets.includes(action.target)))throw new Error('Alvo de efeito inválido.');
  for(const uid of action.discards){const discarded=p.hand.find(c=>c.uid===uid);if(!discarded)throw new Error('Carta de custo indisponível.');p.hand=p.hand.filter(c=>c.uid!==uid);p.grave.push(discarded);}
  p.lp-=cost.lpPaid;m.effectUsedTurn=s.turn;
  for(const uid of tributes)graveMonster(s,uid);
  note(s,`Efeito de ${card(sourceId).name} ativado: custos pagos.`);
  response(s,{kind:'monsterEffect',actor:index,card:sourceUid,id:sourceId,...action.target?{target:action.target}:{}},'main');
 }else if(action.kind==='summon'){
  const c=p.hand.find(c=>c.uid===action.card)!;p.hand=p.hand.filter(c=>c.uid!==action.card);for(const uid of action.tributes)graveMonster(s,uid);
  p.monsters.push({...c,owner:index,position:action.position==='set'?'def':'atk',faceUp:action.position!=='set',entered:s.turn,changed:s.turn,attacked:0,atkBoost:0,defBoost:0});p.summoned=true;
  note(s,action.position==='set'?`${p.name} baixou um monstro em Defesa.`:`${p.name} invocou ${card(c.id).name}.`);response(s,action.position==='set'?{kind:'none'}:{kind:'summon',actor:index,card:c.uid,id:c.id},'main');
 }else if(action.kind==='set'){
  const c=p.hand.find(c=>c.uid===action.card)!;p.hand=p.hand.filter(c=>c.uid!==action.card);
  p.backrow.push({...c,setTurn:s.turn,faceUp:false});note(s,`${p.name} baixou uma Magia/Armadilha.`);response(s,{kind:'none'},'main');
 }else if(action.kind==='field'||action.kind==='setField'){
  const inHand=p.hand.find(c=>c.uid===action.card);if(inHand){p.hand=p.hand.filter(c=>c.uid!==action.card);if(p.field)p.grave.push({id:p.field.id,uid:p.field.uid});p.field={...inHand,setTurn:s.turn,faceUp:action.kind==='field',resolved:false};}
  else if(p.field)p.field.faceUp=true;
  note(s,action.kind==='field'?`${p.name} ativou ${card(p.field!.id).name} na Zona de Campo.`:`${p.name} baixou uma Magia de Campo.`);
  response(s,action.kind==='field'?{kind:'field',actor:index,card:action.card}:{kind:'none'},'main');
 }else if(action.kind==='fusion'){
  const hand=p.hand.find(c=>c.uid===action.card);if(hand){p.hand=p.hand.filter(c=>c.uid!==action.card);p.backrow.push({...hand,setTurn:s.turn,faceUp:true});}else p.backrow.find(c=>c.uid===action.card)!.faceUp=true;
  note(s,`${p.name} ativou Polimerização.`);response(s,{kind:'fusion',actor:index,card:action.card,extra:action.extra,materials:action.materials,position:action.position},'main');
 }else if(action.kind==='spell'){
  let c=p.hand.find(c=>c.uid===action.card);if(c){p.hand=p.hand.filter(c=>c.uid!==action.card);p.backrow.push({...c,setTurn:s.turn,faceUp:true});}else{const back=p.backrow.find(c=>c.uid===action.card)!;back.faceUp=true;c=back;}
  note(s,`${p.name} ativou ${card(c.id).name}.`);
  if(s.phase==='response'){
   if(!isQuickPlaySpell(c.id))throw new Error('Só Magias Rápidas podem responder.');
   s.chain.push({actor:index,card:c.uid,id:c.id,target:action.target??''});s.passes=0;s.priority=1-index;
  }else response(s,{kind:'spell',actor:index,card:c.uid,id:c.id,...action.target?{target:action.target}:{},...action.position?{position:action.position}:{}},'main');
 }else if(action.kind==='position'){
  const m=p.monsters.find(m=>m.uid===action.card)!;m.faceUp=true;m.position=action.mode==='def'?'def':'atk';m.changed=s.turn;note(s,`${p.name} mudou a posição de ${card(m.id).name}.`);response(s,action.mode==='flip'?{kind:'flip',actor:index,card:m.uid,id:m.id}:{kind:'none'},'main');
 }else if(action.kind==='battle')response(s,{kind:'battle'},'main');
 else if(action.kind==='end')response(s,{kind:'end'},s.phase as 'main'|'battle');
 else if(action.kind==='attack'){
  const m=p.monsters.find(m=>m.uid===action.card)!;m.attacked=s.turn;note(s,`${p.name} declarou um ataque com ${card(m.id).name}.`);response(s,{kind:'attack',actor:index,card:m.uid,target:action.target,stage:'declare'},'battle');
 }else if(action.kind==='choose'){
  if(s.choice?.source==='monsterRecruit'){
   const pending=s.pending,choice=s.choice;
   if(pending.kind!=='monsterEffect'||!choice.targets.includes(action.target))throw new Error('Invocação inválida.');
   const op=getMonsterEffect(pending.id)?.operation;
   if(op?.kind!=='specialSummon')throw new Error('Invocação inválida.');
   if(action.target!=='__skip__'){
    const allowed=searchDeckTargets(s,index,'atk',op.maximumAtk,op.attribute);
    if(p.monsters.length>=3||!allowed.includes(action.target))throw new Error('Monstro inelegível para Invocação-Especial.');
    const deck=p.deck,i=deck.findIndex(c=>c.uid===action.target);
    const [found]=deck.splice(i,1);
    p.monsters.push({...found,owner:index,faceUp:true,position:'atk',entered:s.turn,changed:s.turn,attacked:0,atkBoost:0,defBoost:0});
    for(let j=deck.length-1;j>0;j--){const k=randomInt(j+1);[deck[j],deck[k]]=[deck[k],deck[j]];}
    note(s,`Tomate Místico Invocou ${card(found.id).name} do Deck.`);
   }else note(s,'O jogador recusou a Invocação-Especial de Tomate Místico.');
   s.choice=undefined;s.pending={kind:'none'};s.phase=s.resume;
   if(action.target!=='__skip__')response(s,{kind:'specialSummon',actor:index,card:action.target,id:card(p.monsters.find(m=>m.uid===action.target)!.id).id},s.resume,1-index);
  }else if(s.choice?.source==='monsterSearch'){
   const pending=s.pending;
   if(pending.kind!=='monsterEffect'||!s.choice.targets.includes(action.target))throw new Error('Busca inválida.');
   const source=getMonsterEffect(pending.id),op=source?.operation;
   if(op?.kind!=='search')throw new Error('Busca inválida.');
   const pool=searchDeckTargets(s,index,op.stat,op.maximum);
   if(!pool.includes(action.target))throw new Error('Monstro não é elegível para a busca.');
   const deck=p.deck,i=deck.findIndex(c=>c.uid===action.target);
   const [found]=deck.splice(i,1);p.hand.push(found);
   for(let j=deck.length-1;j>0;j--){const k=randomInt(j+1);[deck[j],deck[k]]=[deck[k],deck[j]];}
   s.blockedEffectNames??=[{},{}];s.blockedEffectNames[index][found.id]=s.turn;
   s.choice=undefined;s.pending={kind:'none'};s.phase=s.resume;
   note(s,`Busca de ${card(pending.id).name}: ${card(found.id).name} foi adicionada à mão.`);
  }else if(s.choice?.source==='monsterTarget'){
   const pending=s.pending;
   if(pending.kind!=='monsterEffect'||!s.choice.targets.includes(action.target))throw new Error('Alvo de efeito inválido.');
   const e=getMonsterEffect(pending.id);
   if(e?.operation.kind==='destroy')monsterDestructionTarget(e,s.choice.targets,action.target);
   s.choice=undefined;
   response(s,{...pending,target:action.target},s.resume,1-index);
  }else if(s.choice?.source==='monsterDestroy'){
   // Backwards compatibility for stored duels created by the early prototype.
   note(s,'Efeito de monstro destruiu o alvo.');graveMonster(s,action.target);s.choice=undefined;s.phase=s.resume;
  }else{note(s,`Fissura destruiu ${card(findMonster(s,action.target)!.m.id).name}.`);graveMonster(s,action.target);s.choice=undefined;s.phase=s.resume;}
 }
 else if(action.kind==='discard'){const c=p.hand.find(c=>c.uid===action.card)!;p.hand=p.hand.filter(c=>c.uid!==action.card);p.grave.push(c);note(s,`${p.name} descartou ${card(c.id).name}.`);if(p.hand.length<=6)nextTurn(s);}
 cleanEquips(s);settle(s);cleanEquips(s);return s;
}
export function actionLabel(s:DuelState,actor:string,a:Action){
 const p=s.players.find(p=>p.id===actor)!;const all=[...p.hand,...p.deck,...s.players.flatMap(p=>[...p.monsters,...p.backrow,...p.grave,...p.extra??[],...p.field?[p.field]:[]])];
 const name=(uid:string)=>{for(const owner of s.players){const zone=owner.monsters.findIndex(m=>m.uid===uid);if(zone>=0){const m=owner.monsters[zone];return `${owner.id===actor?'Seu':'Rival'} M${zone+1} ${m.faceUp||owner.id===actor?card(m.id).name:'virado para baixo'}`;}const back=owner.backrow.findIndex(b=>b.uid===uid);if(back>=0){const b=owner.backrow[back];return `${owner.id===actor?'Sua':'Rival'} M/A${back+1} ${b.faceUp||owner.id===actor?card(b.id).name:'virada para baixo'}`;}if(owner.field?.uid===uid)return owner.field.faceUp||owner.id===actor?card(owner.field.id).name:'Campo rival virado para baixo';}const c=all.find(c=>c.uid===uid);return c?card(c.id).name:'carta';};
 if(a.kind==='monsterEffect')return `Ativar efeito: ${name(a.card)}${a.tributes?.length?` | Tributar ${a.tributes.map(name).join(' + ')}`:''}${a.target?` → ${name(a.target)}`:''}`;
 if(a.kind==='summon')return `${a.position==='set'?'Baixar DEF':'Invocar ATK'}: ${name(a.card)}${a.tributes.length?` | Tributar ${a.tributes.map(uid=>'M'+(p.monsters.findIndex(m=>m.uid===uid)+1)).join(' + ')}`:''}`;
 if(a.kind==='field')return `Ativar ${name(a.card)} na Zona de Campo`;if(a.kind==='setField')return `Baixar ${name(a.card)} na Zona de Campo`;if(a.kind==='fusion')return `Fusão: Espadachim das Chamas (${a.position.toUpperCase()}) | Materiais: ${a.materials.map(name).join(' + ')}`;
 if(a.kind==='set')return `Baixar: ${name(a.card)}`;if(a.kind==='spell')return `Ativar: ${name(a.card)}${a.target?` → ${name(a.target)}`:''}${a.position?` (${a.position.toUpperCase()})`:''}`;
 if(a.kind==='position')return `${a.mode==='flip'?'Virar para ATK':`Mudar para ${a.mode.toUpperCase()}`}: ${name(a.card)}`;
 if(a.kind==='attack'){const target=a.target?findMonster(s,a.target):undefined;return `Atacar: ${name(a.card)} → ${target?name(target.m.uid):'direto'}`;}
 if(a.kind==='trap')return `Ativar ${name(a.card)}${a.target?` → ${name(a.target)}`:''}${a.discards?.length?` | Descartar ${a.discards.map(name).join(' + ')}`:''}`;
 if(a.kind==='choose'&&s.choice?.source==='monsterRecruit'&&a.target==='__skip__')return 'Não Invocar (Tomate Místico)';
 if(a.kind==='choose')return `${s.choice?.source==='monsterRecruit'?'Invocar do Deck':s.choice?.source==='monsterSearch'?'Buscar no Deck':s.choice?.source==='monsterTarget'?'Efeito: escolher':s.choice?.source==='monsterDestroy'?'Efeito: destruir':'Fissura: destruir'} ${name(a.target)}`;
 if(a.kind==='discard')return `Descartar: ${name(a.card)}`;
 return {battle:'Entrar na Batalha',end:'Encerrar turno',pass:'Não responder / passar',concede:'Desistir'}[a.kind];
}
