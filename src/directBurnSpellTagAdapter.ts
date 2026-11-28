import type {DuelState} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {rulesFor} from './rulesProfile';
import {getDuelCard,isQuickPlaySpell} from './effectRegistry';

export const FINAL_FLAME_ID='54899807';
export const RAIMEI_ID='96300057';
export const DIRECT_BURN_SPELLS={
  [FINAL_FLAME_ID]:{name:'Final Flame',opponentDamage:600},
  [RAIMEI_ID]:{name:'Raimei',opponentDamage:300}
} as const;
type Team=0|1;
type Seat=0|1|2|3;
type Definition=typeof DIRECT_BURN_SPELLS[keyof typeof DIRECT_BURN_SPELLS];
type SpellCard=NonNullable<DuelState['players'][number]['hand']>[number];
export type DirectBurnAction={kind:'spell';card:string;target:string};
type Activation={
  activationId:string;
  sourceUid:string;
  sourcePhysicalId:string;
  effectCardId:string;
  sourceOwnerSeat:Seat;
  controllerTeam:Team;
  controllerSeat:Seat;
  turn:number;
};
export type DirectBurnSession={
  duel:TagDuel;
  pending:Record<string,Activation>;
  resolved:string[];
};
export type DirectBurnResolution={
  activationId:string;
  cardId:string;
  spellName:string;
  damage:number;
  opponentLPBefore:number;
  opponentLPAfter:number;
  sourceEffectNegated:boolean;
  sourceSentToGrave:boolean;
  duelEndedByLP:boolean;
};

function isTeam(value:unknown):value is Team{return value===0||value===1;}
function physicalSeat(uid:string):Seat|null{
  const match=/^m([0-3]):/.exec(uid);
  return match?Number(match[1]) as Seat:null;
}
function definition(cardId:string):Definition|undefined{
  return Object.prototype.hasOwnProperty.call(DIRECT_BURN_SPELLS,cardId)
    ?DIRECT_BURN_SPELLS[cardId as keyof typeof DIRECT_BURN_SPELLS]
    :undefined;
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    if(physicalSeat(card.uid)===null)throw new Error('UID sem proprietário físico m0–m3.');
    result.set(card.uid,card.id);
  }
  return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('A operação alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A operação alterou a identidade física: '+uid);
}
export function assertPhysicalExtraDeckCounts(extraCounts:readonly number[],maximum=5):void{
  if(!Array.isArray(extraCounts)||extraCounts.length!==4||!Number.isSafeInteger(maximum)||maximum<0||
    extraCounts.some(count=>!Number.isSafeInteger(count)||count<0)){
    throw new Error('Contagem do Deck Adicional inválida.');
  }
  if(extraCounts.some(count=>count>maximum))throw new Error('Deck Adicional físico excede cinco cartas.');
}
/** Enforces the owner's format without forcing a hand discard before End Phase. */
export function assertDirectBurnRules(duel:TagDuel):void{
  assertTagDuel(duel);
  if(duel.mode!=='tag-classic')throw new Error('Magias de dano direto exigem TagDuel clássico.');
  const rules=rulesFor(duel.core);
  if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
    rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
    throw new Error('Perfil de regras incompatível com o proprietário.');
  }
  const extraUids=new Set<string>(),extra=[0,0,0,0],main=[0,0,0,0];
  for(const player of duel.core.players)for(const card of player.extra??[])extraUids.add(card.uid);
  for(const [seat,held] of Object.entries(duel.reserves)){
    if(!/^[0-3]$/.test(seat))throw new Error('Assento físico de reserva inválido.');
    for(const card of held.extra??[])extraUids.add(card.uid);
  }
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    const seat=physicalSeat(card.uid);
    if(seat===null)throw new Error('UID sem proprietário físico m0–m3.');
    if(extraUids.has(card.uid))extra[seat]++;
    else main[seat]++;
  }
  for(let seat=0;seat<4;seat++){
    if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax){
      throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    }
  }
  assertPhysicalExtraDeckCounts(extra,rules.extraDeckMax);
  for(const player of duel.core.players){
    if(player.monsters.length>rules.monsterZones)throw new Error('Equipe excedeu as três Monster Zones.');
    if(player.backrow.length>rules.spellTrapZones)throw new Error('Equipe excedeu as três Spell/Trap Zones.');
  }
}
function sourceCard(duel:TagDuel,team:Team,uid:string,physicalId:string):SpellCard|undefined{
  return duel.core.players[team].hand.find(card=>card.uid===uid&&card.id===physicalId);
}
/** Lists only a normal Spell from the active player's own hand; no target is selected. */
export function directBurnSpellActions(
  duel:TagDuel,
  effectCardId:string,
  options:{sourceCardId?:string}={}
):DirectBurnAction[]{
  assertDirectBurnRules(duel);
  const core=duel.core,team=core.current,def=definition(effectCardId);
  if(!def||!isTeam(team)||core.phase!=='main'||core.priority!==team||
    core.pending.kind!=='none'||core.chain.length!==0||core.turnEnding||core.damageStep||
    core.players[team].lp<=0||core.players[team].backrow.length>=rulesFor(core).spellTrapZones)return [];
  const physicalId=options.sourceCardId??effectCardId;
  const info=getDuelCard(physicalId);
  if(!info||info.kind!=='spell'||isQuickPlaySpell(physicalId))return [];
  return core.players[team].hand
    .filter(card=>card.id===physicalId&&physicalSeat(card.uid)===duel.active[team])
    .map(card=>({kind:'spell',card:card.uid,target:''}));
}
export function createDirectBurnSession(duel:TagDuel):DirectBurnSession{
  assertDirectBurnRules(duel);
  return {duel:structuredClone(duel),pending:{},resolved:[]};
}
export function activateDirectBurnSpell(
  input:DirectBurnSession,
  sourceUid:string,
  activationId:string,
  effectCardId:string,
  options:{sourceCardId?:string}={}
):DirectBurnSession{
  if(typeof activationId!=='string'||!activationId.trim()||activationId.length>128||
    input.pending[activationId]||input.resolved.includes(activationId)){
    throw new Error('ID de ativação ausente ou duplicado.');
  }
  assertDirectBurnRules(input.duel);
  const team=input.duel.core.current;
  if(!isTeam(team)||!directBurnSpellActions(input.duel,effectCardId,options).some(action=>action.card===sourceUid)){
    throw new Error('Magia de dano direto não está legal na Main Phase atual.');
  }
  const physicalId=options.sourceCardId??effectCardId;
  const ownerSeat=physicalSeat(sourceUid);
  if(ownerSeat===null||ownerSeat!==input.duel.active[team])throw new Error('Magia deve vir da mão do jogador ativo.');
  const before=inventorySnapshot(input.duel),next=structuredClone(input);
  const hand=next.duel.core.players[team].hand;
  const index=hand.findIndex(card=>card.uid===sourceUid&&card.id===physicalId);
  if(index<0)throw new Error('Magia física saiu da mão antes da ativação.');
  const [source]=hand.splice(index,1);
  next.duel.core.players[team].backrow.push({...source,faceUp:true,setTurn:next.duel.core.turn});
  next.duel.core.pending={kind:'spell',actor:team,card:sourceUid,id:physicalId};
  next.duel.core.phase='response';
  next.duel.core.resume='main';
  next.duel.core.priority=1-team;
  next.duel.core.passes=0;
  next.duel.core.pendingNegated=false;
  next.pending[activationId]={
    activationId,sourceUid,sourcePhysicalId:physicalId,effectCardId,
    sourceOwnerSeat:ownerSeat,controllerTeam:team,
    controllerSeat:next.duel.active[team] as Seat,turn:next.duel.core.turn
  };
  assertSameInventory(before,next.duel);
  assertDirectBurnRules(next.duel);
  return next;
}
function moveSourceToOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
  const index=core.players[controller].backrow.findIndex(card=>card.uid===uid);
  if(index<0)return false;
  const [source]=core.players[controller].backrow.splice(index,1);
  const ownerSeat=physicalSeat(uid);
  if(ownerSeat===null)throw new Error('Magia sem proprietário físico.');
  core.players[ownerSeat%2].grave.push({uid:source.uid,id:source.id});
  return true;
}
export function resolveDirectBurnSpell(
  input:DirectBurnSession,
  activationId:string,
  options:{effectNegated?:boolean}={}
):{session:DirectBurnSession;result:DirectBurnResolution}{
  const activation=input.pending[activationId];
  if(!activation||input.resolved.includes(activationId))throw new Error('Ativação de Magia ausente ou já resolvida.');
  assertDirectBurnRules(input.duel);
  const def=definition(activation.effectCardId);
  if(!def)throw new Error('Definição de dano direto ausente.');
  const before=inventorySnapshot(input.duel),next=structuredClone(input),core=next.duel.core;
  const pending=core.pending;
  if(core.current!==activation.controllerTeam||core.turn!==activation.turn||core.chain.length!==0||
    pending.kind!=='spell'||pending.actor!==activation.controllerTeam||
    pending.card!==activation.sourceUid||pending.id!==activation.sourcePhysicalId){
    throw new Error('A Magia não está no ponto de resolução exato.');
  }
  const sourceEffectNegated=options.effectNegated===true||core.pendingNegated===true;
  const opponent=core.players[1-activation.controllerTeam];
  const opponentLPBefore=opponent.lp;
  const damage=sourceEffectNegated?0:def.opponentDamage;
  const opponentLPAfter=Math.max(0,opponentLPBefore-damage);
  if(!sourceEffectNegated){
    opponent.lp=opponentLPAfter;
    if(damage>0&&opponentLPAfter===0){
      core.winner=core.players[activation.controllerTeam].id;
      core.reason='pontos de vida';
      core.phase='finished';
    }
  }
  const sourceSentToGrave=moveSourceToOwnerGrave(core,activation.controllerTeam,activation.sourceUid);
  delete next.pending[activationId];
  next.resolved.push(activationId);
  next.resolved=next.resolved.slice(-256);
  core.pending={kind:'none'};
  core.pendingNegated=false;
  core.priority=activation.controllerTeam;
  core.passes=0;
  if(core.phase!=='finished')core.phase='main';
  assertSameInventory(before,next.duel);
  assertDirectBurnRules(next.duel);
  return {session:next,result:{
    activationId,cardId:activation.effectCardId,spellName:def.name,damage,
    opponentLPBefore,opponentLPAfter,sourceEffectNegated,sourceSentToGrave,
    duelEndedByLP:damage>0&&opponentLPAfter===0
  }};
}
