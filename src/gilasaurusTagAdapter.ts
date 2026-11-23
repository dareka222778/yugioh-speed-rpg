import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {synchronizeCardLifetimes} from './cardLifetime';
import {tagInventory,type TagDuel} from './tagDuel';

export const GILASAURUS_ID='45894482';

type Team=0|1;
type Core=TagDuel['core'];
type Monster=Core['players'][number]['monsters'][number];
type Lookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;

type PendingActivation={
  sourceUid:string;
  controllerTeam:Team;
  controllerSeat:number;
  opponentTeam:Team;
  opponentSeat:number;
  turn:number;
};

export type GilasaurusMemory={
  pending:Record<string,PendingActivation>;
  resolved:Record<string,true>;
};
export type GilasaurusState=TagDuel&{gilasaurus?:GilasaurusMemory};

export type GilasaurusSummonEvent={
  kind:'special-summon';
  sourceUid:string;
  turn:number;
  method:'gilasaurus-hand'|'normal'|'other-special';
  successful:boolean;
};

export type GilasaurusSummonPlan={
  kind:'gilasaurus-self-summon';
  sourceUid:string;
  cardId:typeof GILASAURUS_ID;
  ownerSeat:number;
  controllerTeam:Team;
  activeSeat:number;
  turn:number;
  activationId:string;
};

export type GilasaurusOpponentChoicePlan={
  kind:'gilasaurus-opponent-choice';
  sourceUid:string;
  activationId:string;
  controllerTeam:Team;
  opponentTeam:Team;
  opponentSeat:number;
  turn:number;
  reviveUid?:string;
};

const cardLookup:Lookup=id=>getPlayableCard(id);

function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=128&&!/\s/.test(value);
}

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID Gilasaurus sem proprietário físico válido.');
  return Number(match[1]);
}

function assertState(state:GilasaurusState):void{
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
    throw Error('Estado TagDuel clássico/rotação inválido para Gilasaurus.');

  const expectedReserves=[0,1,2,3].filter(seat=>!state.active.includes(seat));
  const reserveKeys=Object.keys(state.reserves).map(Number).sort((a,b)=>a-b);
  if(reserveKeys.length!==2||reserveKeys.some((seat,index)=>seat!==expectedReserves[index]))
    throw Error('Reservas físicas TagDuel inválidas para Gilasaurus.');

  for(const [team,player] of state.core.players.entries()){
    if(player.id!=='tag-team-'+team||!Array.isArray(player.deck)||!Array.isArray(player.hand)||
      !Array.isArray(player.monsters)||player.monsters.length>3||
      !Array.isArray(player.backrow)||player.backrow.length>3||
      !Array.isArray(player.grave)||!Array.isArray(player.extra??[])||(player.extra??[]).length>5||
      state.active[team]%2!==team)
      throw Error('Zonas 3+3, Extra Deck ou representante ativo inválidos para Gilasaurus.');
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
        throw Error('Zona privada da reserva contém carta de outro proprietário físico.');
  }

  const cards=tagInventory(state);
  const uids=cards.map(card=>card.uid);
  if(cards.some(card=>typeof card.uid!=='string'||!/^m[0-3]:/.test(card.uid)||
    typeof card.id!=='string'||!card.id)||new Set(uids).size!==uids.length)
    throw Error('Inventário físico inválido ou UID duplicado no TagDuel.');

  const memory=state.gilasaurus;
  if(memory!==undefined&&(!memory||typeof memory!=='object'||
    !memory.pending||typeof memory.pending!=='object'||
    !memory.resolved||typeof memory.resolved!=='object'||
    Object.entries(memory.pending).some(([id,value])=>!validActivationId(id)||!value||
      typeof value.sourceUid!=='string'||(value.controllerTeam!==0&&value.controllerTeam!==1)||
      !Number.isInteger(value.controllerSeat)||(value.opponentTeam!==0&&value.opponentTeam!==1)||
      !Number.isInteger(value.opponentSeat)||value.controllerSeat<0||value.controllerSeat>3||
      value.opponentSeat<0||value.opponentSeat>3||!Number.isSafeInteger(value.turn))||
    Object.entries(memory.resolved).some(([id,value])=>!validActivationId(id)||value!==true)))
    throw Error('Memória de ativações Gilasaurus inválida.');
}

function assertOpenMain(state:GilasaurusState,team:Team):void{
  if(state.core.phase!=='main'||state.core.current!==team||
    state.core.pending.kind!=='none'||state.core.chain.length>0||
    state.core.choice||state.core.handFlow)
    throw Error('Gilasaurus só pode iniciar seu Special Summon na Main Phase sem decisão pendente.');
}

function sourceContext(state:GilasaurusState,uid:string,lookup:Lookup):{
  ownerSeat:number;controllerTeam:Team;activeSeat:number
}{
  assertState(state);
  if(typeof uid!=='string'||!uid)throw Error('UID da fonte Gilasaurus ausente.');
  const ownerSeat=physicalSeat(uid);
  const team=(ownerSeat%2) as Team;
  if(state.members[ownerSeat]?.team!==team||state.active[team]!==ownerSeat)
    throw Error('Gilasaurus deve pertencer à mão do representante físico ativo.');
  const matches=state.core.players.flatMap((player,teamIndex)=>player.hand
    .filter(card=>card.uid===uid)
    .map(card=>({card,team:teamIndex as Team})));
  if(matches.length!==1||matches[0].team!==team)
    throw Error('Gilasaurus deve existir uma única vez na mão ativa de sua equipe.');
  if(matches[0].card.id!==GILASAURUS_ID)
    throw Error('A carta da mão não é Gilasaurus.');
  const metadata=lookup(matches[0].card.id);
  if(!metadata||metadata.kind!=='monster'||metadata.monsterType!=='effect')
    throw Error('Definição de Gilasaurus não admitida.');
  return {ownerSeat,controllerTeam:team,activeSeat:state.active[team]};
}

function inventorySnapshot(state:GilasaurusState):string{
  const cards=tagInventory(state);
  const uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)throw Error('Inventário físico duplicado antes da resolução Gilasaurus.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}

function assertConserved(before:string,after:GilasaurusState):void{
  if(inventorySnapshot(after)!==before)
    throw Error('Gilasaurus alterou ou perdeu uma identidade física do inventário.');
}

function pendingActivation(state:GilasaurusState,activationId:string):PendingActivation{
  if(!validActivationId(activationId))throw Error('activationId Gilasaurus inválido.');
  const pending=state.gilasaurus?.pending?.[activationId];
  if(!pending)throw Error('Ativação Gilasaurus ausente, já resolvida ou obsoleta.');
  if(state.core.turn!==pending.turn||state.core.current!==pending.controllerTeam||
    state.active[pending.controllerTeam]!==pending.controllerSeat||
    state.active[pending.opponentTeam]!==pending.opponentSeat||
    pending.opponentTeam!==(1-pending.controllerTeam))
    throw Error('Contexto de equipe/turno da ativação Gilasaurus mudou.');
  return pending;
}

function isReviveEligible(
  state:GilasaurusState,
  team:Team,
  uid:string,
  lookup:Lookup
):boolean{
  const ownerSeat=physicalSeat(uid);
  if(ownerSeat%2!==team||state.members[ownerSeat]?.team!==team)return false;
  const matches=state.core.players[team].grave.filter(card=>card.uid===uid);
  if(matches.length!==1||matches[0].entityKind==='token')return false;
  const card=matches[0];
  const metadata=lookup(card.id);
  if(!metadata||metadata.kind!=='monster')return false;
  if((metadata.monsterType==='fusion'||metadata.monsterType==='ritual')&&!card.properlySummoned)
    return false;
  return true;
}

/** Lists current legal GY choices at resolution time; the opponent's choice is not targeted on activation. */
export function getGilasaurusOpponentCandidates(
  state:GilasaurusState,
  activationId:string,
  lookup:Lookup=cardLookup
):string[]{
  assertState(state);
  const pending=pendingActivation(state,activationId);
  if(state.core.players[pending.opponentTeam].monsters.length>=3)return [];
  return state.core.players[pending.opponentTeam].grave
    .filter(card=>isReviveEligible(state,pending.opponentTeam,card.uid,lookup))
    .map(card=>card.uid);
}

/** The self-Special Summon procedure is distinct from a Normal Summon or another effect's summon. */
export function planGilasaurusSelfSummon(
  state:GilasaurusState,
  event:GilasaurusSummonEvent,
  sourceUid:string,
  activationId:string,
  lookup:Lookup=cardLookup
):GilasaurusSummonPlan{
  assertState(state);
  if(!event||event.kind!=='special-summon'||event.sourceUid!==sourceUid||
    event.turn!==state.core.turn||event.method!=='gilasaurus-hand'||event.successful!==true||
    !validActivationId(activationId))
    throw Error('Gilasaurus exige seu próprio Special Summon bem-sucedido da mão.');
  if(state.gilasaurus?.pending?.[activationId]||state.gilasaurus?.resolved?.[activationId])
    throw Error('activationId Gilasaurus já utilizado.');
  const source=sourceContext(state,sourceUid,lookup);
  assertOpenMain(state,source.controllerTeam);
  if(state.core.players[source.controllerTeam].monsters.length>=3)
    throw Error('A equipe de Gilasaurus não possui Zona de Monstro livre.');
  if(state.gilasaurus?.pending?.[activationId]||state.gilasaurus?.resolved?.[activationId])
    throw Error('activationId Gilasaurus já utilizado.');
  return {
    kind:'gilasaurus-self-summon',sourceUid,cardId:GILASAURUS_ID,
    ownerSeat:source.ownerSeat,controllerTeam:source.controllerTeam,
    activeSeat:source.activeSeat,turn:state.core.turn,activationId
  };
}

/** Moves Gilasaurus from the active physical hand to its team's shared field and persists its opponent trigger. */
export function resolveGilasaurusSelfSummon(
  input:GilasaurusState,
  plan:GilasaurusSummonPlan,
  lookup:Lookup=cardLookup
):{status:'summoned';state:GilasaurusState;trigger:GilasaurusOpponentChoicePlan}{
  assertState(input);
  if(!plan||plan.kind!=='gilasaurus-self-summon'||plan.cardId!==GILASAURUS_ID||
    !validActivationId(plan.activationId)||plan.turn!==input.core.turn||
    plan.controllerTeam!==input.core.current||input.active[plan.controllerTeam]!==plan.activeSeat||
    physicalSeat(plan.sourceUid)!==plan.ownerSeat||plan.ownerSeat!==plan.activeSeat)
    throw Error('Plano de Special Summon Gilasaurus obsoleto ou inválido.');
  assertOpenMain(input,plan.controllerTeam);
  const source=sourceContext(input,plan.sourceUid,lookup);
  if(source.ownerSeat!==plan.ownerSeat||source.controllerTeam!==plan.controllerTeam||
    source.activeSeat!==plan.activeSeat||input.core.players[plan.controllerTeam].monsters.length>=3||
    input.gilasaurus?.pending?.[plan.activationId]||input.gilasaurus?.resolved?.[plan.activationId])
    throw Error('Fonte ou Zona de Monstro Gilasaurus mudou antes do Special Summon.');

  const before=inventorySnapshot(input);
  const next=structuredClone(input) as GilasaurusState;
  const hand=next.core.players[plan.controllerTeam].hand;
  const index=hand.findIndex(card=>card.uid===plan.sourceUid);
  if(index<0)throw Error('Gilasaurus não está mais na mão ativa.');
  const [ref]=hand.splice(index,1);
  const monster:Monster={
    ...ref,owner:plan.ownerSeat,faceUp:true,position:'atk',
    entered:plan.turn,changed:plan.turn,attacked:0,atkBoost:0,defBoost:0
  };
  next.core.players[plan.controllerTeam].monsters.push(monster);
  const pending={...(next.gilasaurus?.pending??{})};
  pending[plan.activationId]={
    sourceUid:plan.sourceUid,controllerTeam:plan.controllerTeam,
    controllerSeat:plan.activeSeat,opponentTeam:(1-plan.controllerTeam) as Team,
    opponentSeat:next.active[1-plan.controllerTeam],turn:plan.turn
  };
  next.gilasaurus={
    pending,
    resolved:{...(next.gilasaurus?.resolved??{})}
  };
  synchronizeCardLifetimes(next.core);
  assertState(next);
  assertConserved(before,next);
  const trigger:GilasaurusOpponentChoicePlan={
    kind:'gilasaurus-opponent-choice',sourceUid:plan.sourceUid,
    activationId:plan.activationId,controllerTeam:plan.controllerTeam,
    opponentTeam:(1-plan.controllerTeam) as Team,
    opponentSeat:next.active[1-plan.controllerTeam],turn:plan.turn
  };
  return {status:'summoned',state:next,trigger};
}

/** The opponent may decline or select one currently eligible monster from their shared team GY. */
export function planGilasaurusOpponentChoice(
  state:GilasaurusState,
  activationId:string,
  reviveUid?:string,
  lookup:Lookup=cardLookup
):GilasaurusOpponentChoicePlan{
  assertState(state);
  const pending=pendingActivation(state,activationId);
  if(reviveUid!==undefined&&!getGilasaurusOpponentCandidates(state,activationId,lookup).includes(reviveUid))
    throw Error('O monstro escolhido não está elegível no Cemitério da equipe adversária.');
  return {
    kind:'gilasaurus-opponent-choice',sourceUid:pending.sourceUid,
    activationId,controllerTeam:pending.controllerTeam,
    opponentTeam:pending.opponentTeam,opponentSeat:pending.opponentSeat,
    turn:pending.turn,...(reviveUid!==undefined?{reviveUid}:{})
  };
}

/** Resolves the opponent's optional revival. Source removal after activation does not cancel the trigger. */
export function resolveGilasaurusOpponentChoice(
  input:GilasaurusState,
  plan:GilasaurusOpponentChoicePlan,
  effectNegated=false,
  lookup:Lookup=cardLookup
):{
  status:'revived'|'declined'|'no-legal-monster'|'negated';
  state:GilasaurusState;
  summonedUid?:string;
  ownerSeat?:number;
  controllerTeam:Team;
}{
  assertState(input);
  if(!plan||plan.kind!=='gilasaurus-opponent-choice')
    throw Error('Plano de escolha Gilasaurus inválido.');
  const pending=pendingActivation(input,plan.activationId);
  if(plan.sourceUid!==pending.sourceUid||plan.controllerTeam!==pending.controllerTeam||
    plan.opponentTeam!==pending.opponentTeam||plan.opponentSeat!==pending.opponentSeat||
    plan.turn!==pending.turn)
    throw Error('Plano de escolha Gilasaurus não corresponde à ativação pendente.');

  const candidates=effectNegated?[]:getGilasaurusOpponentCandidates(input,plan.activationId,lookup);
  if(!effectNegated&&plan.reviveUid!==undefined&&!candidates.includes(plan.reviveUid))
    throw Error('Escolha Gilasaurus ficou obsoleta antes da resolução.');
  const before=inventorySnapshot(input);
  const next=structuredClone(input) as GilasaurusState;
  const pendingMap={...(next.gilasaurus?.pending??{})};
  delete pendingMap[plan.activationId];
  const resolved={...(next.gilasaurus?.resolved??{}),[plan.activationId]:true as const};
  next.gilasaurus={pending:pendingMap,resolved};

  if(effectNegated){
    assertState(next);assertConserved(before,next);
    return {status:'negated',state:next,controllerTeam:pending.controllerTeam};
  }
  if(plan.reviveUid===undefined){
    const status=candidates.length?'declined':'no-legal-monster';
    assertState(next);assertConserved(before,next);
    return {status,state:next,controllerTeam:pending.controllerTeam};
  }

  const grave=next.core.players[pending.opponentTeam].grave;
  const index=grave.findIndex(card=>card.uid===plan.reviveUid);
  if(index<0||next.core.players[pending.opponentTeam].monsters.length>=3)
    throw Error('Cemitério ou Zona de Monstro mudou antes da escolha Gilasaurus.');
  const [ref]=grave.splice(index,1);
  const ownerSeat=physicalSeat(ref.uid);
  const monster:Monster={
    ...ref,owner:ownerSeat,faceUp:true,position:'atk',
    entered:pending.turn,changed:pending.turn,attacked:0,atkBoost:0,defBoost:0
  };
  next.core.players[pending.opponentTeam].monsters.push(monster);
  synchronizeCardLifetimes(next.core);
  assertState(next);
  assertConserved(before,next);
  return {
    status:'revived',state:next,summonedUid:monster.uid,
    ownerSeat,controllerTeam:pending.opponentTeam
  };
}
