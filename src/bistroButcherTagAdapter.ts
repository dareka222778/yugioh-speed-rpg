import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {synchronizeCardLifetimes} from './cardLifetime';
import {tagInventory,type TagDuel} from './tagDuel';

export const BISTRO_BUTCHER_ID='71107816';

type Team=0|1;
type Core=TagDuel['core'];
type Lookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;
type PendingActivation={
  sourceUid:string;
  sourceOwnerSeat:number;
  controllerTeam:Team;
  controllerSeat:number;
  opponentTeam:Team;
  opponentSeat:number;
  turn:number;
  battleDamage:number;
};
export type BistroButcherMemory={
  pending:Record<string,PendingActivation>;
  resolved:Record<string,true>;
};
export type BistroButcherState=TagDuel&{bistroButcher?:BistroButcherMemory};

export type BistroButcherDamageEvent={
  kind:'battle-damage-to-opponent-lp';
  sourceUid:string;
  turn:number;
  attackerTeam:Team;
  defenderTeam:Team;
  recipient:'opponent-lp';
  battleDamage:number;
  damageApplied:boolean;
  lifePointsAfterDamage:number;
  directAttack?:boolean;
};
export type BistroButcherTriggerPlan={
  kind:'bistro-butcher-trigger';
  sourceUid:string;
  sourceOwnerSeat:number;
  controllerTeam:Team;
  controllerSeat:number;
  opponentTeam:Team;
  opponentSeat:number;
  turn:number;
  battleDamage:number;
  activationId:string;
};

const cardLookup:Lookup=id=>getPlayableCard(id);

function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=128&&!/\s/.test(value);
}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID The Bistro Butcher sem proprietário físico válido.');
  return Number(match[1]);
}
function assertState(state:BistroButcherState):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||!state.core||
    !Array.isArray(state.core.players)||state.core.players.length!==2||
    !Array.isArray(state.members)||state.members.length!==4||
    !Array.isArray(state.active)||state.active.length!==2||!state.reserves||
    state.active.some((seat,team)=>!Number.isInteger(seat)||seat<0||seat>3||seat%2!==team)||
    !state.core.pending||!Array.isArray(state.core.chain)||
    !state.core.teamRotation||!Number.isSafeInteger(state.core.turn)||state.core.turn<1||
    !Number.isSafeInteger(state.cursor)||state.cursor<0||state.cursor>3||
    state.core.current!==state.cursor%2||state.active[state.core.current]!==state.cursor||
    state.core.teamRotation.cursor!==state.cursor||
    JSON.stringify(state.active)!==JSON.stringify(state.core.teamRotation.active)||
    JSON.stringify(state.reserves)!==JSON.stringify(state.core.teamRotation.reserves)||
    state.members.some((member,index)=>!member.id||!member.name||member.team!==index%2))
    throw Error('Estado TagDuel clássico/rotação inválido para The Bistro Butcher.');

  const expectedReserves=[0,1,2,3].filter(seat=>!state.active.includes(seat));
  const reserveKeys=Object.keys(state.reserves).map(Number).sort((a,b)=>a-b);
  if(reserveKeys.length!==2||reserveKeys.some((seat,index)=>seat!==expectedReserves[index]))
    throw Error('Reservas físicas TagDuel inválidas para The Bistro Butcher.');

  for(const [team,player] of state.core.players.entries()){
    if(player.id!=='tag-team-'+team||!Array.isArray(player.deck)||!Array.isArray(player.hand)||
      !Array.isArray(player.monsters)||player.monsters.length>3||
      !Array.isArray(player.backrow)||player.backrow.length>3||
      !Array.isArray(player.grave)||!Array.isArray(player.extra??[])||
      (player.extra??[]).length>5||state.active[team]%2!==team||
      !Number.isFinite(player.lp))
      throw Error('Zonas 3+3, Extra Deck ou LP inválidos para The Bistro Butcher.');
    const prefix='m'+state.active[team]+':';
    for(const card of [...player.deck,...player.hand,...(player.extra??[])])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('UID de Deck/mão/Extra deve pertencer ao representante físico ativo.');
  }
  for(const [seat,held] of Object.entries(state.reserves)){
    if(!held||!Array.isArray(held.deck)||!Array.isArray(held.hand)||
      !Array.isArray(held.extra??[])||(held.extra??[]).length>5)
      throw Error('Deck/mão/Extra da reserva física inválidos.');
    const prefix='m'+seat+':';
    for(const card of [...held.deck,...held.hand,...(held.extra??[])])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('UID de zona privada da reserva pertence a outro proprietário físico.');
  }
  const cards=tagInventory(state);
  const uids=cards.map(card=>card.uid);
  if(cards.some(card=>typeof card.uid!=='string'||!/^m[0-3]:/.test(card.uid)||
    typeof card.id!=='string'||!card.id)||new Set(uids).size!==uids.length)
    throw Error('Inventário físico inválido ou UID duplicado no TagDuel.');

  const memory=state.bistroButcher;
  if(memory!==undefined&&(!memory||typeof memory!=='object'||
    !memory.pending||typeof memory.pending!=='object'||
    !memory.resolved||typeof memory.resolved!=='object'||
    Object.entries(memory.pending).some(([id,value])=>!validActivationId(id)||!value||
      typeof value.sourceUid!=='string'||!Number.isInteger(value.sourceOwnerSeat)||
      value.sourceOwnerSeat<0||value.sourceOwnerSeat>3||
      (value.controllerTeam!==0&&value.controllerTeam!==1)||
      !Number.isInteger(value.controllerSeat)||value.controllerSeat<0||value.controllerSeat>3||
      (value.opponentTeam!==0&&value.opponentTeam!==1)||
      !Number.isInteger(value.opponentSeat)||value.opponentSeat<0||value.opponentSeat>3||
      !Number.isSafeInteger(value.turn)||!Number.isSafeInteger(value.battleDamage)||value.battleDamage<=0)||
    Object.entries(memory.resolved).some(([id,value])=>!validActivationId(id)||value!==true)))
    throw Error('Memória de ativações The Bistro Butcher inválida.');
}

function sourceContext(state:BistroButcherState,uid:string,lookup:Lookup):{
  sourceOwnerSeat:number;controllerTeam:Team;controllerSeat:number
}{
  assertState(state);
  if(typeof uid!=='string'||!uid)throw Error('UID da fonte The Bistro Butcher ausente.');
  const sourceOwnerSeat=physicalSeat(uid);
  if(state.members[sourceOwnerSeat]?.team!==sourceOwnerSeat%2)
    throw Error('Proprietário físico de The Bistro Butcher inválido.');
  const matches=state.core.players.flatMap((player,team)=>player.monsters
    .filter(monster=>monster.uid===uid)
    .map(monster=>({monster,team:team as Team})));
  if(matches.length!==1)throw Error('The Bistro Butcher deve ocupar uma única Zona de Monstro.');
  const {monster,team}=matches[0];
  if(monster.id!==BISTRO_BUTCHER_ID)
    throw Error('A fonte não é The Bistro Butcher.');
  if(!monster.faceUp||monster.position!=='atk')
    throw Error('The Bistro Butcher precisa estar face-up em Attack Position ao causar dano.');
  const metadata=lookup(monster.id);
  if(!metadata||metadata.kind!=='monster'||metadata.monsterType!=='effect')
    throw Error('Definição de The Bistro Butcher não admitida.');
  return {sourceOwnerSeat,controllerTeam:team,controllerSeat:state.active[team]};
}

function inventorySnapshot(state:BistroButcherState):string{
  const cards=tagInventory(state);
  const uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)
    throw Error('Inventário físico duplicado antes da resolução The Bistro Butcher.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,after:BistroButcherState):void{
  if(inventorySnapshot(after)!==before)
    throw Error('The Bistro Butcher alterou ou perdeu uma identidade física do inventário.');
}
function pendingActivation(state:BistroButcherState,activationId:string):PendingActivation{
  if(!validActivationId(activationId))throw Error('activationId The Bistro Butcher inválido.');
  const pending=state.bistroButcher?.pending?.[activationId];
  if(!pending)throw Error('Ativação The Bistro Butcher ausente, já resolvida ou obsoleta.');
  if(state.core.turn!==pending.turn||state.core.current!==pending.controllerTeam||
    state.active[pending.controllerTeam]!==pending.controllerSeat||
    state.active[pending.opponentTeam]!==pending.opponentSeat||
    pending.opponentTeam!==(1-pending.controllerTeam))
    throw Error('Contexto de equipe/turno da ativação The Bistro Butcher mudou.');
  return pending;
}

function finish(core:Core,winner:Team,reason:string):void{
  core.phase='finished';
  core.winner=core.players[winner].id;
  core.reason=reason;
  core.pending={kind:'none'};
  core.chain=[];
  delete core.choice;
  delete core.handFlow;
  delete core.triggerBuild;
  delete core.chainRoot;
  delete core.graveTriggers;
  delete core.summonTriggers;
  delete core.battleFlip;
  delete core.damageStep;
  core.log=[...core.log,reason].slice(-12);
}

/** The effect only triggers after positive Battle Damage is actually applied to the opposing team's LP. */
export function planBistroButcherDamageTrigger(
  state:BistroButcherState,
  event:BistroButcherDamageEvent,
  sourceUid:string,
  activationId:string,
  lookup:Lookup=cardLookup
):BistroButcherTriggerPlan{
  assertState(state);
  if(!event||event.kind!=='battle-damage-to-opponent-lp'||event.sourceUid!==sourceUid||
    event.turn!==state.core.turn||event.recipient!=='opponent-lp'||event.damageApplied!==true||
    !Number.isSafeInteger(event.battleDamage)||event.battleDamage<=0||
    (event.attackerTeam!==0&&event.attackerTeam!==1)||
    (event.defenderTeam!==0&&event.defenderTeam!==1)||
    !Number.isFinite(event.lifePointsAfterDamage)||!validActivationId(activationId))
    throw Error('The Bistro Butcher exige Battle Damage positivo aplicado aos LPs adversários.');
  if(state.bistroButcher?.pending?.[activationId]||state.bistroButcher?.resolved?.[activationId])
    throw Error('activationId The Bistro Butcher já utilizado.');
  const source=sourceContext(state,sourceUid,lookup);
  const opponentTeam=(1-source.controllerTeam) as Team;
  if(state.core.current!==source.controllerTeam||event.attackerTeam!==source.controllerTeam||
    event.defenderTeam!==opponentTeam||
    event.lifePointsAfterDamage!==state.core.players[opponentTeam].lp||
    state.core.players[opponentTeam].lp<=0||state.core.phase==='finished')
    throw Error('O dano não foi aplicado aos LPs da equipe adversária ativa para The Bistro Butcher.');
  return {
    kind:'bistro-butcher-trigger',sourceUid,sourceOwnerSeat:source.sourceOwnerSeat,
    controllerTeam:source.controllerTeam,controllerSeat:source.controllerSeat,
    opponentTeam,opponentSeat:state.active[opponentTeam],
    turn:state.core.turn,battleDamage:event.battleDamage,activationId
  };
}

/** Registers the trigger at damage time. The source may leave the field before the draw resolves. */
export function registerBistroButcherDamageTrigger(
  input:BistroButcherState,
  plan:BistroButcherTriggerPlan
):BistroButcherState{
  assertState(input);
  if(!plan||plan.kind!=='bistro-butcher-trigger'||!validActivationId(plan.activationId)||
    plan.turn!==input.core.turn||physicalSeat(plan.sourceUid)!==plan.sourceOwnerSeat||
    plan.controllerTeam!==input.core.current||input.active[plan.controllerTeam]!==plan.controllerSeat||
    plan.opponentTeam!==(1-plan.controllerTeam)||input.active[plan.opponentTeam]!==plan.opponentSeat||
    !Number.isSafeInteger(plan.battleDamage)||plan.battleDamage<=0||
    input.bistroButcher?.pending?.[plan.activationId]||input.bistroButcher?.resolved?.[plan.activationId])
    throw Error('Plano de trigger The Bistro Butcher obsoleto ou inválido.');
  const before=inventorySnapshot(input);
  const next=structuredClone(input) as BistroButcherState;
  const pending={...(next.bistroButcher?.pending??{})};
  pending[plan.activationId]={
    sourceUid:plan.sourceUid,sourceOwnerSeat:plan.sourceOwnerSeat,
    controllerTeam:plan.controllerTeam,controllerSeat:plan.controllerSeat,
    opponentTeam:plan.opponentTeam,opponentSeat:plan.opponentSeat,
    turn:plan.turn,battleDamage:plan.battleDamage
  };
  next.bistroButcher={
    pending,resolved:{...(next.bistroButcher?.resolved??{})}
  };
  synchronizeCardLifetimes(next.core);
  assertState(next);
  assertConserved(before,next);
  return next;
}

/** Draws two cards from the opponent team's active representative Deck; insufficient Deck causes a loss. */
export function resolveBistroButcherDamageTrigger(
  input:BistroButcherState,
  activationId:string,
  effectNegated=false
):{
  status:'drawn'|'deck-out'|'negated';
  state:BistroButcherState;
  drawnUids:string[];
  deckOut:boolean;
  winner:Team|null;
}{
  assertState(input);
  const pending=pendingActivation(input,activationId);
  const before=inventorySnapshot(input);
  const next=structuredClone(input) as BistroButcherState;
  const pendingMap={...(next.bistroButcher?.pending??{})};
  delete pendingMap[activationId];
  next.bistroButcher={
    pending:pendingMap,
    resolved:{...(next.bistroButcher?.resolved??{}),[activationId]:true as const}
  };
  if(effectNegated){
    assertState(next);assertConserved(before,next);
    return {status:'negated',state:next,drawnUids:[],deckOut:false,winner:null};
  }

  const opponent=next.core.players[pending.opponentTeam];
  const drawnUids:string[]=[];
  for(let i=0;i<2&&opponent.deck.length>0;i++){
    const [card]=opponent.deck.splice(0,1);
    opponent.hand.push(card);
    drawnUids.push(card.uid);
  }
  const deckOut=drawnUids.length<2;
  synchronizeCardLifetimes(next.core);
  if(deckOut)finish(next.core,pending.controllerTeam,'não conseguiu comprar uma carta');
  assertState(next);
  assertConserved(before,next);
  return {
    status:deckOut?'deck-out':'drawn',state:next,drawnUids,
    deckOut,winner:deckOut?pending.controllerTeam:null
  };
}
