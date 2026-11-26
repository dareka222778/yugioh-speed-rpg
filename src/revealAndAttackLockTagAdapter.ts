import type {DuelState} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const SWORDS_OF_REVEALING_LIGHT_ID='72302403';
export const DARK_PIERCING_LIGHT_ID='68008297';
export type RevealSpellId=typeof SWORDS_OF_REVEALING_LIGHT_ID|typeof DARK_PIERCING_LIGHT_ID;
type Team=0|1;
type RevealLocation='hand'|'backrow';
export type SwordsLock={
  activationId:string;
  sourceUid:string;
  sourceId:typeof SWORDS_OF_REVEALING_LIGHT_ID;
  controllerTeam:Team;
  activatedTurn:number;
  remainingOpponentTurns:1|2|3;
  lastCountedTurn?:number;
};
export type RevealTagDuel=TagDuel&{
  swordsOfRevealingLight?:SwordsLock[];
  revealSpellReceipts?:string[];
};
export type RevealSpellEvent={
  activationId:string;
  actorSeat:number;
  sourceUid:string;
  cardId:RevealSpellId;
};
export type RevealSpellPlan=RevealSpellEvent&{
  actorTeam:Team;
  sourceOwnerSeat:number;
  turn:number;
};
export type RevealSpellResolution={
  status:'resolved'|'negated'|'duplicate';
  state:RevealTagDuel;
  revealedUids:string[];
  lockActive:boolean;
};
export type SwordsEndPhaseResult={
  status:'advanced'|'duplicate'|'none';
  state:RevealTagDuel;
  expiredUids:string[];
};

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('UID físico 2v2 inválido: '+uid);
  return Number(match[1]);
}
function validTeam(team:unknown):team is Team{return team===0||team===1;}
function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.trim().length>0&&value.length<=128;
}
function assertClassicShape(duel:RevealTagDuel):void{
  if(!duel||duel.mode!=='tag-classic'||!duel.core||
    !Array.isArray(duel.core.players)||duel.core.players.length!==2||
    !Array.isArray(duel.active)||duel.active.length!==2||
    !Array.isArray(duel.members)||duel.members.length!==4||
    !Array.isArray(duel.core.chain)||!duel.reserves){
    throw new Error('Estado TagDuel clássico inválido.');
  }
}
function inventorySnapshot(duel:RevealTagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function handSnapshot(duel:RevealTagDuel):string[]{
  const result:string[]=[];
  for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
  for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
  return result.sort();
}
function assertSameInventory(before:Map<string,string>,duel:RevealTagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('O adapter alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('O adapter alterou a identidade física: '+uid);
  }
}
function assertHandsChangedOnlyBySource(before:string[],duel:RevealTagDuel,sourceUid:string):void{
  const expected=before.filter(uid=>uid!==sourceUid);
  if(JSON.stringify(expected)!==JSON.stringify(handSnapshot(duel))){
    throw new Error('O adapter alterou uma mão privada além da carta ativada.');
  }
}
function assertHandsUnchanged(before:string[],duel:RevealTagDuel):void{
  if(JSON.stringify(before)!==JSON.stringify(handSnapshot(duel))){
    throw new Error('O adapter alterou uma mão privada durante a End Phase.');
  }
}
function assertPhysicalRules(duel:RevealTagDuel):void{
  assertClassicShape(duel);
  const all=inventorySnapshot(duel),extra=new Set<string>(),extras=[0,0,0,0];
  for(const player of duel.core.players){
    if(player.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');
    if(player.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');
    for(const card of player.extra??[]){
      extra.add(card.uid);
      extras[physicalSeat(card.uid)]++;
    }
  }
  for(const [seat,held] of Object.entries(duel.reserves)){
    if(!/^\d$/.test(seat)||Number(seat)>3)throw new Error('Assento físico de reserva inválido.');
    for(const card of held.extra??[]){
      extra.add(card.uid);
      extras[physicalSeat(card.uid)]++;
    }
  }
  const main=[0,0,0,0];
  for(const uid of all.keys())if(!extra.has(uid))main[physicalSeat(uid)]++;
  for(let seat=0;seat<4;seat++){
    if(main[seat]<20||main[seat]>30)throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    if(extras[seat]>5)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
  }
  // The Field Zone is a separate property and is not counted as a shared S/T slot.
}
function physicalHolder(duel:RevealTagDuel,seat:number){
  const team=(seat%2) as Team;
  const held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
  if(!held)throw new Error('A mão física do participante não está disponível.');
  return held;
}
function locateSource(
  duel:RevealTagDuel,
  actorSeat:number,
  sourceUid:string,
  cardId:RevealSpellId
):{location:RevealLocation;ownerSeat:number}{
  const team=(actorSeat%2) as Team;
  const holder=physicalHolder(duel,actorSeat);
  const hand=holder.hand.find(card=>card.uid===sourceUid&&card.id===cardId);
  const field=duel.core.players[team].backrow.find(card=>card.uid===sourceUid&&card.id===cardId);
  if(hand&&field)throw new Error('A carta ativada aparece em duas zonas.');
  if(hand)return {location:'hand',ownerSeat:physicalSeat(sourceUid)};
  if(field){
    const ownerSeat=physicalSeat(sourceUid);
    if(ownerSeat%2!==team)throw new Error('A carta preparada pertence à equipe adversária.');
    return {location:'backrow',ownerSeat};
  }
  throw new Error('A carta ativada não está na mão ativa nem na Zona de Magias/Armadilhas da equipe.');
}
function sourceFaceUp(duel:RevealTagDuel,lock:SwordsLock):boolean{
  return duel.core.players[lock.controllerTeam].backrow.some(card=>
    card.uid===lock.sourceUid&&card.id===lock.sourceId&&card.faceUp
  );
}
function revealOpponentMonsters(
  duel:RevealTagDuel,
  controllerTeam:Team,
  cardId:RevealSpellId
):string[]{
  const opponent=duel.core.players[(1-controllerTeam) as Team];
  const hasFaceDown=opponent.monsters.some(monster=>!monster.faceUp);
  if(cardId===SWORDS_OF_REVEALING_LIGHT_ID&&!hasFaceDown)return [];
  const revealed:string[]=[];
  for(const monster of opponent.monsters){
    if(!monster.faceUp){
      monster.faceUp=true;
      // Revealing is not a Flip Summon: preserve the current position.
      revealed.push(monster.uid);
    }
  }
  return revealed;
}

/** Plan from the active team's Main Phase before resolving the Spell's Chain link. */
export function planRevealSpell(
  input:RevealTagDuel,
  event:RevealSpellEvent
):RevealSpellPlan{
  assertPhysicalRules(input);
  if(!event||!validActivationId(event.activationId)||
    ![SWORDS_OF_REVEALING_LIGHT_ID,DARK_PIERCING_LIGHT_ID].includes(event.cardId)||
    typeof event.sourceUid!=='string'||!Number.isInteger(event.actorSeat)||
    event.actorSeat<0||event.actorSeat>3){
    throw new Error('Evento de ativação de revelação inválido.');
  }
  const actorTeam=(event.actorSeat%2) as Team;
  if(input.core.current!==actorTeam||input.active[actorTeam]!==event.actorSeat||
    input.core.phase!=='main'||input.core.pending.kind!=='none'||
    input.core.chain.length!==0||input.core.choice||input.core.turnEnding){
    throw new Error('A Magia só pode ser ativada na Main Phase da equipe ativa.');
  }
  const receipts=input.revealSpellReceipts??[];
  if(receipts.includes(event.activationId))throw new Error('Esta ativação já foi resolvida.');
  const source=locateSource(input,event.actorSeat,event.sourceUid,event.cardId);
  if(source.ownerSeat%2!==actorTeam)throw new Error('A carta ativada não pertence à equipe ativa.');
  if(source.location==='hand'&&input.core.players[actorTeam].backrow.length>=3){
    throw new Error('Não há Zona de Magias/Armadilhas livre para ativar a Magia.');
  }
  return Object.freeze({
    ...event,actorTeam,sourceOwnerSeat:source.ownerSeat,turn:input.core.turn
  });
}

/**
 * Resolve one reveal Spell after its Chain link outcome is known. Flip triggers
 * are returned to the host as UIDs; the adapter never runs them inside the link.
 */
export function resolveRevealSpell(
  input:RevealTagDuel,
  plan:RevealSpellPlan,
  effectNegated=false
):RevealSpellResolution{
  assertPhysicalRules(input);
  if(!plan||!validActivationId(plan.activationId)||
    ![SWORDS_OF_REVEALING_LIGHT_ID,DARK_PIERCING_LIGHT_ID].includes(plan.cardId)||
    !validTeam(plan.actorTeam)||plan.actorTeam!==plan.actorSeat%2||
    !Number.isInteger(plan.actorSeat)||plan.actorSeat<0||plan.actorSeat>3||
    plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||
    plan.sourceOwnerSeat%2!==plan.actorTeam||
    plan.turn!==input.core.turn||input.core.current!==plan.actorTeam||
    input.active[plan.actorTeam]!==plan.actorSeat||typeof effectNegated!=='boolean'){
    throw new Error('Plano de revelação obsoleto ou inválido.');
  }
  const receipts=input.revealSpellReceipts??[];
  if(receipts.includes(plan.activationId)){
    return {status:'duplicate',state:input,revealedUids:[],lockActive:canTeamDeclareAttack(input,(1-plan.actorTeam) as Team)===false};
  }
  const before=inventorySnapshot(input),hands=handSnapshot(input);
  const next=structuredClone(input) as RevealTagDuel;
  const holder=physicalHolder(next,plan.actorSeat);
  const handIndex=holder.hand.findIndex(card=>card.uid===plan.sourceUid&&card.id===plan.cardId);
  const fieldIndex=next.core.players[plan.actorTeam].backrow.findIndex(card=>
    card.uid===plan.sourceUid&&card.id===plan.cardId
  );
  if(handIndex>=0&&fieldIndex>=0)throw new Error('A carta ativada aparece em duas zonas.');
  let source;
  if(handIndex>=0)source=holder.hand.splice(handIndex,1)[0];
  else if(fieldIndex>=0)source=next.core.players[plan.actorTeam].backrow.splice(fieldIndex,1)[0];
  else throw new Error('A carta ativada saiu da mão/campo antes da resolução.');
  const revealedUids=effectNegated?[]:revealOpponentMonsters(next,plan.actorTeam,plan.cardId);
  if(!effectNegated&&plan.cardId===SWORDS_OF_REVEALING_LIGHT_ID){
    next.core.players[plan.actorTeam].backrow.push({...source,setTurn:next.core.turn,faceUp:true});
    const locks=next.swordsOfRevealingLight??[];
    next.swordsOfRevealingLight=[
      ...locks.filter(lock=>lock.sourceUid!==plan.sourceUid),
      {
        activationId:plan.activationId,
        sourceUid:plan.sourceUid,
        sourceId:SWORDS_OF_REVEALING_LIGHT_ID,
        controllerTeam:plan.actorTeam,
        activatedTurn:next.core.turn,
        remainingOpponentTurns:3
      }
    ];
  }else{
    next.core.players[plan.actorTeam].grave.push(source);
  }
  next.revealSpellReceipts=[...receipts,plan.activationId];
  assertSameInventory(before,next);
  assertHandsChangedOnlyBySource(hands,next,plan.sourceUid);
  assertPhysicalRules(next);
  return {
    status:effectNegated?'negated':'resolved',
    state:next,
    revealedUids,
    lockActive:canTeamDeclareAttack(next,(1-plan.actorTeam) as Team)===false
  };
}

/** True while at least one face-up Swords source controlled by the other team remains. */
export function swordsOfRevealingLightLocksTeam(
  input:RevealTagDuel,
  attackingTeam:Team
):boolean{
  assertPhysicalRules(input);
  if(!validTeam(attackingTeam))throw new Error('Equipe atacante inválida.');
  return (input.swordsOfRevealingLight??[]).some(lock=>
    lock.controllerTeam!==attackingTeam&&lock.remainingOpponentTurns>0&&sourceFaceUp(input,lock)
  );
}
export function canTeamDeclareAttack(input:RevealTagDuel,attackingTeam:Team):boolean{
  return !swordsOfRevealingLightLocksTeam(input,attackingTeam);
}
export function assertSwordsAttackAllowed(input:RevealTagDuel,attackerUid:string):true{
  const attackingTeam=(physicalSeat(attackerUid)%2) as Team;
  if(!canTeamDeclareAttack(input,attackingTeam)){
    throw new Error('Swords of Revealing Light impede a equipe adversária de declarar ataques.');
  }
  return true;
}

/** Call once at each team's End Phase, before incrementing core.turn. */
export function advanceSwordsEndPhase(
  input:RevealTagDuel,
  endingTeam:Team,
  turn=input.core.turn
):SwordsEndPhaseResult{
  assertPhysicalRules(input);
  if(!validTeam(endingTeam)||endingTeam!==input.core.current||
    !Number.isInteger(turn)||turn!==input.core.turn){
    throw new Error('End Phase de equipe/turno inválido para Swords of Revealing Light.');
  }
  const locks=input.swordsOfRevealingLight??[];
  if(!locks.length)return {status:'none',state:input,expiredUids:[]};
  const before=inventorySnapshot(input),hands=handSnapshot(input);
  const next=structuredClone(input) as RevealTagDuel;
  const retained:SwordsLock[]=[],expiredUids:string[]=[];
  let changed=false,duplicate=false;
  for(const lock of locks){
    if(!sourceFaceUp(next,lock)){
      changed=true;
      continue;
    }
    if(lock.controllerTeam===endingTeam){
      retained.push(lock);
      continue;
    }
    if(lock.lastCountedTurn===turn){
      retained.push(lock);
      duplicate=true;
      continue;
    }
    const remaining=lock.remainingOpponentTurns-1;
    if(remaining<=0){
      const index=next.core.players[lock.controllerTeam].backrow.findIndex(card=>
        card.uid===lock.sourceUid&&card.id===SWORDS_OF_REVEALING_LIGHT_ID&&card.faceUp
      );
      if(index>=0){
        const [source]=next.core.players[lock.controllerTeam].backrow.splice(index,1);
        next.core.players[lock.controllerTeam].grave.push(source);
      }
      expiredUids.push(lock.sourceUid);
      changed=true;
    }else{
      retained.push({...lock,remainingOpponentTurns:remaining as 1|2,lastCountedTurn:turn});
      changed=true;
    }
  }
  if(!changed)return {status:duplicate?'duplicate':'none',state:input,expiredUids:[]};
  next.swordsOfRevealingLight=retained;
  assertSameInventory(before,next);
  assertHandsUnchanged(hands,next);
  assertPhysicalRules(next);
  return {status:'advanced',state:next,expiredUids};
}
