import {randomInt} from 'node:crypto';
import {resolveChainLinks,type ChainLink} from './chainEngine';
import {getMonsterEffect,canActivateMonsterEffect,payMonsterEffectCost,monsterDestructionTarget} from './monsterEffects';
import {getCard} from './collection';
import {enabledCardIds,getEffect} from './effectRegistry';
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
 |{kind:'attack';card:string;target?:string}|{kind:'trap';card:string;target:string}
 |{kind:'monsterEffect';card:string;discards:string[]}
 |{kind:'choose';target:string}|{kind:'discard';card:string}
 |{kind:'battle'|'end'|'pass'|'concede'};
export type Pending={kind:'monsterEffect';actor:number;card:string;id:string}|{kind:'summon'|'flip';actor:number;card:string}|{kind:'field';actor:number;card:string}|{kind:'fusion';actor:number;card:string;extra:string;materials:string[];position:'atk'|'def'}|{kind:'none'|'end'|'battle'}|{kind:'attack';actor:number;card:string;target?:string;stage:'declare'|'damage'}|{kind:'spell';actor:number;card:string;id:string;target?:string;position?:'atk'|'def'};
export type DuelState={version:1;encounter?:{npcId:string;eventDay?:string};reward?:{dp:number;xp:number;cards:string[];first:boolean;daily:boolean;note:string};fixedOpening?:boolean;players:[DuelPlayer,DuelPlayer];turn:number;current:number;phase:'main'|'battle'|'response'|'choice'|'discard'|'finished';resume:'main'|'battle';priority:number;passes:number;pending:Pending;chain:ChainLink[];choice?:{actor:number;targets:string[];source?:'monsterDestroy'};afterMonsterEffect?:Pending;winner:string|null;reason:string;log:string[]};
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
function graveMonster(s:DuelState,uid:string){const found=findMonster(s,uid);if(found){const controller=s.players.indexOf(found.p);const owner=found.m.owner??controller;found.p.monsters=found.p.monsters.filter(m=>m.uid!==uid);s.players[owner].grave.push({uid:found.m.uid,id:found.m.id,...found.m.properlySummoned?{properlySummoned:true}:{}});cleanEquips(s);}}

function finish(s:DuelState,winner:number|null,reason:string){s.phase='finished';s.winner=winner===null?null:s.players[winner].id;s.reason=reason;note(s,`${winner===null?'Empate':`${s.players[winner].name} venceu`}: ${reason}.`);}
function checkLP(s:DuelState){if(s.players.every(p=>p.lp<=0))finish(s,null,'pontos de vida');else for(let i=0;i<2;i++)if(s.players[i].lp<=0)finish(s,1-i,'pontos de vida');}
function combos<T>(values:T[],n:number):T[][]{if(n===0)return [[]];return values.flatMap((v,i)=>combos(values.slice(i+1),n-1).map(rest=>[v,...rest]));}
function trapActions(s:DuelState,index:number):Action[]{
 const out:Action[]=[];
 for(const c of s.players[index].backrow.filter(c=>!c.faceUp&&c.setTurn<s.turn&&card(c.id).kind==='trap')){
  const effect=getEffect(c.id);if(!effect)continue;
  if(s.phase==='response'&&s.pending.kind==='attack'&&s.pending.stage==='damage'&&!['reinforcements','castleWalls'].includes(effect.kind))continue;
  if(effect.kind==='reinforcements'||effect.kind==='castleWalls')out.push(...s.players.flatMap(p=>p.monsters.filter(m=>m.faceUp).map(m=>({kind:'trap',card:c.uid,target:m.uid}) as Action)));
  else if(effect.kind==='waboku')out.push({kind:'trap',card:c.uid,target:''});
  else if(effect.kind==='justDesserts'&&s.players[1-index].monsters.length)out.push({kind:'trap',card:c.uid,target:''});
  else if(effect.kind==='trapHole'&&s.phase==='response'&&s.pending.kind==='summon'&&s.pending.actor!==index){const m=findMonster(s,s.pending.card)?.m;if(m?.faceUp&&atk(m,s)>=1000)out.push({kind:'trap',card:c.uid,target:m.uid});}
 }return out;
}

export function legalActions(s:DuelState,actor:string):Action[]{
 const index=s.players.findIndex(p=>p.id===actor);if(index<0||s.phase==='finished')return [];
 if(s.phase==='response')return index===s.priority?[...trapActions(s,index),{kind:'pass'}]:[];
 if(s.phase==='choice')return s.choice?.actor===index?s.choice.targets.map(target=>({kind:'choose',target})):[];
 if(index!==s.current)return [];
 const p=s.players[index],op=s.players[1-index];
 if(s.phase==='discard')return p.hand.map(c=>({kind:'discard',card:c.uid}));
 const actions:Action[]=[...trapActions(s,index)];
 if(s.phase==='main'){
  for(const c of p.hand){const info=card(c.id);
   if(info.kind==='monster'&&!p.summoned){const n=info.level!>=7?2:info.level!>=5?1:0;
    if(p.monsters.length-n<3)for(const tributes of combos(p.monsters.map(m=>m.uid),n))for(const position of ['atk','set'] as const)actions.push({kind:'summon',card:c.uid,position,tributes});
   }else if(info.field){actions.push({kind:'setField',card:c.uid});actions.push({kind:'field',card:c.uid});}
   else if(info.kind!=='monster'&&p.backrow.length<3)actions.push({kind:'set',card:c.uid});
  }
  if(p.field&&!p.field.faceUp)actions.push({kind:'field',card:p.field.uid});
  for(const c of [...(p.backrow.length<3?p.hand:[]),...p.backrow.filter(c=>!c.faceUp)])if(card(c.id).kind==='spell'&&!card(c.id).field){
    if(c.id==='24094653'){
      for(const extra of p.extra??[]){const recipe=card(extra.id).fusion!;const pool=[...p.hand,...p.monsters];
       for(const materials of combos(pool,recipe.length))if([...materials.map(m=>m.id)].sort().join(',')===[...recipe].sort().join(',')&&p.monsters.length-materials.filter(m=>p.monsters.some(n=>n.uid===m.uid)).length<3)
        for(const position of ['atk','def'] as const)actions.push({kind:'fusion',card:c.uid,extra:extra.uid,materials:materials.map(m=>m.uid),position});
      }
    }else actions.push(...spellActions(s,index,c));
  }
  for(const m of p.monsters){
   const e=m.faceUp?getMonsterEffect(m.id):undefined;
   if(e?.trigger==='ignition'){
    const context={lp:p.lp,handSize:p.hand.length,deckSize:p.deck.length,usedThisTurn:m.effectUsedTurn===s.turn};
    if(canActivateMonsterEffect(e,context)){
     const n=e.cost?.kind==='discard'?e.cost.count:0;
     for(const discards of combos(p.hand.map(c=>c.uid),n))actions.push({kind:'monsterEffect',card:m.uid,discards});
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
function response(s:DuelState,pending:Pending,resume:'main'|'battle',priority=1-s.current){s.pending=pending;s.resume=resume;s.phase='response';s.priority=priority;s.passes=0;s.chain=[];}
function endTurn(s:DuelState){
 for(const p of s.players)for(const m of [...p.monsters]){m.atkBoost=0;m.defBoost=0;if(m.returnTo!==undefined&&m.returnTurn===s.turn){const target=s.players[m.returnTo];if(target!==p){if(target.monsters.length<3){p.monsters=p.monsters.filter(c=>c.uid!==m.uid);target.monsters.push(m);}else graveMonster(s,m.uid);}delete m.returnTo;delete m.returnTurn;}}
 if(s.players[s.current].hand.length>6){s.phase='discard';note(s,'Descarte até ficar com 6 cartas.');return;}
 nextTurn(s);
}
function nextTurn(s:DuelState){s.current=1-s.current;s.turn++;s.phase='main';s.players[s.current].summoned=false;
 const p=s.players[s.current];const c=p.deck.shift();if(!c){finish(s,1-s.current,'não conseguiu comprar uma carta');return;}p.hand.push(c);note(s,`Turno ${s.turn}: ${p.name} comprou uma carta.`);
}
function triggerMonsterEffect(s:DuelState,actor:number,uid:string,trigger:'flip'|'onSummon'){
 const m=s.players[actor].monsters.find(m=>m.uid===uid);
 if(!m||!m.faceUp)return false;
 const e=getMonsterEffect(m.id);
 if(!e||e.trigger!==trigger)return false;
 const p=s.players[actor],ctx={lp:p.lp,handSize:p.hand.length,deckSize:p.deck.length,usedThisTurn:m.effectUsedTurn===s.turn};
 if(!canActivateMonsterEffect(e,ctx)||e.cost?.kind==='discard')return false;
 const cost=payMonsterEffectCost(e,ctx);
 p.lp-=cost.lpPaid;m.effectUsedTurn=s.turn;
 note(s,'Efeito de monstro disparado.');
 response(s,{kind:'monsterEffect',actor,card:uid,id:m.id},s.resume);
 return true;
}
function resolve(s:DuelState){
 resolveChainLinks(s.chain,link=>{
  const target=findMonster(s,link.target)?.m;const effect=getEffect(link.id);
  if(target?.faceUp){if(effect?.kind==='reinforcements')target.atkBoost+=500;else if(effect?.kind==='castleWalls')target.defBoost+=500;else if(effect?.kind==='trapHole')graveMonster(s,target.uid);}
  if(effect?.kind==='waboku')s.players[link.actor].battleProtectedUntil=s.turn;
  if(effect?.kind==='justDesserts'){const op=s.players[1-link.actor];op.lp=Math.max(0,op.lp-500*op.monsters.length);checkLP(s);}
  discardBackrow(s,link.card);},link=>{discardBackrow(s,link.card);},()=>s.phase==='finished');
 s.chain=[];if(s.phase==='finished'){s.pending={kind:'none'};return;}const pending=s.pending;s.pending={kind:'none'};s.phase=s.resume;
 if(pending.kind==='monsterEffect'){
  const p=s.players[pending.actor],e=getMonsterEffect(pending.id);
  // Activated effects remain on the chain even if their source leaves the field.
  if(!e)return;
  if(e.operation.kind==='heal')p.lp+=e.operation.amount;
  else if(e.operation.kind==='burn'){const op=s.players[1-pending.actor];op.lp=Math.max(0,op.lp-e.operation.amount);checkLP(s);}
  else if(e.operation.kind==='draw'){
   if(p.deck.length<e.operation.count){finish(s,1-pending.actor,'não conseguiu comprar uma carta');return;}
   p.hand.push(...p.deck.splice(0,e.operation.count));
  }
  if(e.operation.kind==='destroy'){
   const targets=e.operation.target==='anyMonster'?s.players.flatMap(p=>p.monsters.map(m=>m.uid)):s.players[1-pending.actor].monsters.map(m=>m.uid);
   if(targets.length){s.choice={actor:pending.actor,targets,source:'monsterDestroy'};s.phase='choice';note(s,'Escolha um monstro adversário para destruir.');return;}
  }
  note(s,'Efeito de monstro resolvido.');
  if(s.afterMonsterEffect){const followup=s.afterMonsterEffect;s.afterMonsterEffect=undefined;if(s.winner===null&&followup.kind==='attack')response(s,followup,'battle',1-followup.actor);}
  return;
 }
 if(pending.kind==='flip'||pending.kind==='summon'){
  triggerMonsterEffect(s,pending.actor,pending.card,pending.kind==='flip'?'flip':'onSummon');
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
   note(s,`${p.name} fez a Invocação-Fusão de ${card(fusion.id).name}.`);response(s,{kind:'none'},'main');
  }return;
 }
 if(pending.kind==='spell'){
  const p=s.players[pending.actor],op=s.players[1-pending.actor];const c=p.backrow.find(c=>c.uid===pending.card);
  if(getEffect(pending.id)?.kind!=='equip'){p.backrow=p.backrow.filter(c=>c.uid!==pending.card);if(c)p.grave.push({uid:c.uid,id:c.id});}
  if(resolveClassicSpell(s,pending,{destroy:graveMonster,note,finish,checkLP}))return;
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
    if(triggerMonsterEffect(s,1-pending.actor,defender.m.uid,'flip')){s.afterMonsterEffect={...pending,stage:'damage'};return;}
   }
   response(s,{...pending,stage:'damage'},'battle',1-pending.actor);return;
  }
  const opponent=s.players[1-pending.actor];
  if(!pending.target){if(opponent.monsters.length)return;const damage=opponent.battleProtectedUntil===s.turn?0:atk(a,s);opponent.lp=Math.max(0,opponent.lp-damage);note(s,`Ataque direto: ${damage} de dano.`);}
  else if(defender){const d=defender.m;const difference=atk(a,s)-(d.position==='atk'?atk(d,s):def(d,s));
   if(d.position==='atk'){
    if(difference>0){if(opponent.battleProtectedUntil!==s.turn){graveMonster(s,d.uid);opponent.lp=Math.max(0,opponent.lp-difference);}}
    else if(difference<0){if(s.players[pending.actor].battleProtectedUntil!==s.turn){graveMonster(s,a.uid);s.players[pending.actor].lp=Math.max(0,s.players[pending.actor].lp+difference);}}
    else if(atk(a,s)>0){if(s.players[pending.actor].battleProtectedUntil!==s.turn)graveMonster(s,a.uid);if(opponent.battleProtectedUntil!==s.turn)graveMonster(s,d.uid);}
   }else{if(difference>0&&opponent.battleProtectedUntil!==s.turn)graveMonster(s,d.uid);else if(difference<0&&s.players[pending.actor].battleProtectedUntil!==s.turn)s.players[pending.actor].lp=Math.max(0,s.players[pending.actor].lp+difference);}
   note(s,`${card(a.id).name} enfrentou ${card(d.id).name}. Diferença: ${Math.abs(difference)}.`);
  }
  checkLP(s);
 }
}
function settle(s:DuelState){let budget=30;while(s.phase==='response'&&!trapActions(s,s.priority).length&&budget-->0){s.passes++;s.priority=1-s.priority;if(s.passes===2)resolve(s);}if(budget<=0)throw new Error('Janela de resposta inválida.');}
export function step(input:DuelState,actor:string,action:Action):DuelState{
 const index=input.players.findIndex(p=>p.id===actor);if(index<0)throw new Error('Você não participa deste duelo.');
 if(input.phase==='finished')throw new Error('Esse duelo já terminou.');
 if(action.kind!=='concede'&&!legalActions(input,actor).some(a=>JSON.stringify(a)===JSON.stringify(action)))throw new Error('Ação inválida ou fora da sua vez. Atualize o painel.');
 const s=structuredClone(input);const p=s.players[index];
 if(action.kind==='concede'){finish(s,1-index,'desistência');return s;}
 if(action.kind==='pass'){s.passes++;s.priority=1-index;if(s.passes===2)resolve(s);}
 else if(action.kind==='trap'){
  if(s.phase!=='response')response(s,{kind:'none'},s.phase as 'main'|'battle',1-index);
  const c=p.backrow.find(c=>c.uid===action.card)!;c.faceUp=true;s.chain.push({actor:index,card:c.uid,id:c.id,target:action.target});s.passes=0;s.priority=1-index;note(s,`${p.name} ativou ${card(c.id).name}.`);
 }else if(action.kind==='monsterEffect'){
  const m=p.monsters.find(m=>m.uid===action.card)!;const e=getMonsterEffect(m.id)!;
  const cost=payMonsterEffectCost(e,{lp:p.lp,handSize:p.hand.length,deckSize:p.deck.length,usedThisTurn:m.effectUsedTurn===s.turn});
  if(action.discards.length!==cost.cardsDiscarded||new Set(action.discards).size!==action.discards.length)throw new Error('Custo de descarte inválido.');
  for(const uid of action.discards){const discarded=p.hand.find(c=>c.uid===uid);if(!discarded)throw new Error('Carta de custo indisponível.');p.hand=p.hand.filter(c=>c.uid!==uid);p.grave.push(discarded);}
  p.lp-=cost.lpPaid;m.effectUsedTurn=s.turn;
  note(s,'Efeito de monstro ativado.');
  response(s,{kind:'monsterEffect',actor:index,card:m.uid,id:m.id},'main');
 }else if(action.kind==='summon'){
  const c=p.hand.find(c=>c.uid===action.card)!;p.hand=p.hand.filter(c=>c.uid!==action.card);for(const uid of action.tributes)graveMonster(s,uid);
  p.monsters.push({...c,owner:index,position:action.position==='set'?'def':'atk',faceUp:action.position!=='set',entered:s.turn,changed:s.turn,attacked:0,atkBoost:0,defBoost:0});p.summoned=true;
  note(s,action.position==='set'?`${p.name} baixou um monstro em Defesa.`:`${p.name} invocou ${card(c.id).name}.`);response(s,action.position==='set'?{kind:'none'}:{kind:'summon',actor:index,card:c.uid},'main');
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
  note(s,`${p.name} ativou ${card(c.id).name}.`);response(s,{kind:'spell',actor:index,card:c.uid,id:c.id,...action.target?{target:action.target}:{},...action.position?{position:action.position}:{}},'main');
 }else if(action.kind==='position'){
  const m=p.monsters.find(m=>m.uid===action.card)!;m.faceUp=true;m.position=action.mode==='def'?'def':'atk';m.changed=s.turn;note(s,`${p.name} mudou a posição de ${card(m.id).name}.`);response(s,action.mode==='flip'?{kind:'flip',actor:index,card:m.uid}:{kind:'none'},'main');
 }else if(action.kind==='battle')response(s,{kind:'battle'},'main');
 else if(action.kind==='end')response(s,{kind:'end'},s.phase as 'main'|'battle');
 else if(action.kind==='attack'){
  const m=p.monsters.find(m=>m.uid===action.card)!;m.attacked=s.turn;note(s,`${p.name} declarou um ataque com ${card(m.id).name}.`);response(s,{kind:'attack',actor:index,card:m.uid,target:action.target,stage:'declare'},'battle');
 }else if(action.kind==='choose'){
  if(s.choice?.source==='monsterDestroy'){
   const target=monsterDestructionTarget({trigger:'flip',operation:{kind:'destroy',target:'opponentMonster'}},s.choice.targets,action.target);
   note(s,'Efeito de monstro destruiu o alvo.');graveMonster(s,target);
  }else{note(s,'Fissura destruiu o alvo.');graveMonster(s,action.target);}
  s.choice=undefined;s.phase=s.resume;
  if(s.afterMonsterEffect){const followup=s.afterMonsterEffect;s.afterMonsterEffect=undefined;if(s.winner===null&&followup.kind==='attack')response(s,followup,'battle',1-followup.actor);}
 }
 else if(action.kind==='discard'){const c=p.hand.find(c=>c.uid===action.card)!;p.hand=p.hand.filter(c=>c.uid!==action.card);p.grave.push(c);note(s,`${p.name} descartou ${card(c.id).name}.`);if(p.hand.length<=6)nextTurn(s);}
 cleanEquips(s);settle(s);cleanEquips(s);return s;
}
export function actionLabel(s:DuelState,actor:string,a:Action){
 const p=s.players.find(p=>p.id===actor)!;const all=[...p.hand,...s.players.flatMap(p=>[...p.monsters,...p.backrow,...p.grave,...p.extra??[],...p.field?[p.field]:[]])];
 const name=(uid:string)=>{for(const owner of s.players){const zone=owner.monsters.findIndex(m=>m.uid===uid);if(zone>=0){const m=owner.monsters[zone];return `${owner.id===actor?'Seu':'Rival'} M${zone+1} ${m.faceUp||owner.id===actor?card(m.id).name:'virado para baixo'}`;}const back=owner.backrow.findIndex(b=>b.uid===uid);if(back>=0){const b=owner.backrow[back];return `${owner.id===actor?'Sua':'Rival'} M/A${back+1} ${b.faceUp||owner.id===actor?card(b.id).name:'virada para baixo'}`;}if(owner.field?.uid===uid)return owner.field.faceUp||owner.id===actor?card(owner.field.id).name:'Campo rival virado para baixo';}const c=all.find(c=>c.uid===uid);return c?card(c.id).name:'carta';};
 if(a.kind==='monsterEffect')return `Ativar efeito: ${name(a.card)}`;
 if(a.kind==='summon')return `${a.position==='set'?'Baixar DEF':'Invocar ATK'}: ${name(a.card)}${a.tributes.length?` | Tributar ${a.tributes.map(uid=>'M'+(p.monsters.findIndex(m=>m.uid===uid)+1)).join(' + ')}`:''}`;
 if(a.kind==='field')return `Ativar ${name(a.card)} na Zona de Campo`;if(a.kind==='setField')return `Baixar ${name(a.card)} na Zona de Campo`;if(a.kind==='fusion')return `Fusão: Espadachim das Chamas (${a.position.toUpperCase()}) | Materiais: ${a.materials.map(name).join(' + ')}`;
 if(a.kind==='set')return `Baixar: ${name(a.card)}`;if(a.kind==='spell')return `Ativar: ${name(a.card)}${a.target?` → ${name(a.target)}`:''}${a.position?` (${a.position.toUpperCase()})`:''}`;
 if(a.kind==='position')return `${a.mode==='flip'?'Virar para ATK':`Mudar para ${a.mode.toUpperCase()}`}: ${name(a.card)}`;
 if(a.kind==='attack'){const target=a.target?findMonster(s,a.target):undefined;return `Atacar: ${name(a.card)} → ${target?name(target.m.uid):'direto'}`;}
 if(a.kind==='trap')return `Ativar ${name(a.card)}${a.target?` → ${name(a.target)}`:''}`;
 if(a.kind==='choose')return `${s.choice?.source==='monsterDestroy'?'Efeito':'Fissura'}: destruir ${name(a.target)}`;
 if(a.kind==='discard')return `Descartar: ${name(a.card)}`;
 return {battle:'Entrar na Batalha',end:'Encerrar turno',pass:'Não responder / passar',concede:'Desistir'}[a.kind];
}
