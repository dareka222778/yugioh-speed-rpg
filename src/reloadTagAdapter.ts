import {createHash} from 'node:crypto';
import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';
import {shuffleDuel} from './duelRandom';

export const RELOAD_ID='22589918';
type Team=0|1;
type SourceLocation='hand'|'backrow';
type Phase='main'|'battle'|'response';

export type ReloadTagDuel=TagDuel&{
  reloadActivationIds?:string[];
  reloadPending?:ReloadPlan[];
  reloadResolvedIds?:string[];
};
export type ReloadEvent={
  activationId:string;
  actorSeat:number;
  sourceUid:string;
};
export type ReloadPlan=ReloadEvent&{
  actorTeam:Team;
  sourceOwnerSeat:number;
  sourceLocation:SourceLocation;
  sourceSetTurn:number|null;
  turn:number;
  handCount:number;
  deckCount:number;
  handCommitment:string;
  deckCommitment:string;
  activationPhase:Phase;
  activationCurrent:Team;
};
export type ReloadActivation={status:'activated';state:ReloadTagDuel;plan:ReloadPlan};
export type ReloadResolution={
  status:'resolved'|'negated'|'duplicate';
  state:ReloadTagDuel;
  activationId:string;
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
function assertClassicShape(duel:ReloadTagDuel):void{
  if(!duel||duel.mode!=='tag-classic'||!duel.core||
    !Array.isArray(duel.core.players)||duel.core.players.length!==2||
    !Array.isArray(duel.active)||duel.active.length!==2||
    !Array.isArray(duel.members)||duel.members.length!==4||
    !Array.isArray(duel.core.chain)||!duel.reserves){
    throw new Error('Estado TagDuel clássico inválido.');
  }
}
function inventorySnapshot(duel:ReloadTagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function assertSameInventory(before:Map<string,string>,duel:ReloadTagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('Reload alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('Reload alterou a identidade física: '+uid);
  }
}
function assertPhysicalRules(duel:ReloadTagDuel):void{
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
  // The Field Zone is independent from the three shared Spell/Trap Zones.
}
function physicalHolder(duel:ReloadTagDuel,seat:number){
  const team=(seat%2) as Team;
  const held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
  if(!held)throw new Error('A mão/Deck físico do participante não está disponível.');
  return held;
}
function assertPrivateDeckOwner(duel:ReloadTagDuel,seat:number):void{
  const prefix='m'+seat+':',holder=physicalHolder(duel,seat);
  if([...holder.hand,...holder.deck].some(card=>!card.uid.startsWith(prefix))){
    throw new Error('Reload exige mão e Deck do proprietário físico ativo.');
  }
}
function locateSource(
  duel:ReloadTagDuel,actorSeat:number,sourceUid:string
):{location:SourceLocation;ownerSeat:number;setTurn:number|null}{
  const team=(actorSeat%2) as Team,holder=physicalHolder(duel,actorSeat);
  const hand=holder.hand.find(card=>card.uid===sourceUid&&card.id===RELOAD_ID);
  const field=duel.core.players[team].backrow.find(card=>card.uid===sourceUid&&card.id===RELOAD_ID);
  const opposingField=duel.core.players[1-team].backrow.find(card=>card.uid===sourceUid&&card.id===RELOAD_ID);
  if(opposingField)throw new Error('Reload preparada está na Zona de Magias/Armadilhas adversária.');
  if(hand&&field)throw new Error('Reload aparece em duas zonas.');
  if(hand){
    const ownerSeat=physicalSeat(sourceUid);
    if(ownerSeat!==actorSeat)throw new Error('Reload na mão deve pertencer ao assento físico ativo.');
    return {location:'hand',ownerSeat,setTurn:null};
  }
  if(field){
    if(field.faceUp)throw new Error('Reload já está com a face para cima.');
    return {location:'backrow',ownerSeat:physicalSeat(sourceUid),setTurn:Number.isInteger(field.setTurn)?field.setTurn:null};
  }
  throw new Error('Reload não está na mão física ativa nem na backrow compartilhada da equipe.');
}
function commitment(cards:readonly {uid:string;id:string}[],ordered=false):string{
  const values=cards.map(card=>card.uid+':'+card.id);
  if(!ordered)values.sort();
  return createHashHex(values.join(String.fromCharCode(0)));
}
function createHashHex(value:string):string{
  // A local, deterministic commitment; the random order itself comes from the
  // duel's persisted HMAC stream in duelRandom.ts.
  return createHash('sha256').update(value).digest('hex');
}
function samePlan(a:ReloadPlan,b:ReloadPlan):boolean{
  return a.activationId===b.activationId&&a.actorSeat===b.actorSeat&&
    a.sourceUid===b.sourceUid&&a.actorTeam===b.actorTeam&&
    a.sourceOwnerSeat===b.sourceOwnerSeat&&a.sourceLocation===b.sourceLocation&&
    a.sourceSetTurn===b.sourceSetTurn&&a.turn===b.turn&&
    a.handCount===b.handCount&&a.deckCount===b.deckCount&&
    a.handCommitment===b.handCommitment&&a.deckCommitment===b.deckCommitment&&
    a.activationPhase===b.activationPhase&&a.activationCurrent===b.activationCurrent;
}
function assertPlanBase(input:ReloadTagDuel,plan:ReloadPlan):void{
  if(!plan||!validActivationId(plan.activationId)||!Number.isInteger(plan.actorSeat)||
    plan.actorSeat<0||plan.actorSeat>3||!validTeam(plan.actorTeam)||
    plan.actorTeam!==plan.actorSeat%2||plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||
    (plan.sourceLocation!=='hand'&&plan.sourceLocation!=='backrow')||
    !(plan.sourceSetTurn===null||Number.isInteger(plan.sourceSetTurn))||
    !Number.isInteger(plan.turn)||plan.turn!==input.core.turn||
    !Number.isInteger(plan.handCount)||plan.handCount<0||
    !Number.isInteger(plan.deckCount)||plan.deckCount<0||
    !/^[a-f0-9]{64}$/.test(plan.handCommitment)||!/^[a-f0-9]{64}$/.test(plan.deckCommitment)||
    !['main','battle','response'].includes(plan.activationPhase)||
    !validTeam(plan.activationCurrent)||input.active[plan.actorTeam]!==plan.actorSeat||
    !(input.reloadActivationIds??[]).includes(plan.activationId)){
    throw new Error('Plano de Reload obsoleto ou inválido.');
  }
}
function activationWindow(duel:ReloadTagDuel,team:Team,location:SourceLocation):boolean{
  const core=duel.core;
  if(core.priority!==team||core.damageStep||core.turnEnding||core.choice)return false;
  const ownOpen=(core.current===team&&
    (core.phase==='main'||core.phase==='battle')&&
    core.pending.kind==='none'&&core.chain.length===0);
  const response=core.phase==='response'&&core.chain.length>0;
  if(location==='hand')return core.current===team&&(ownOpen||response);
  return ownOpen||response;
}
function sendSourceToOriginalOwnerGrave(duel:ReloadTagDuel,plan:ReloadPlan):void{
  const ownerTeam=(plan.sourceOwnerSeat%2) as Team;
  const field=duel.core.players[plan.actorTeam].backrow;
  const index=field.findIndex(card=>card.uid===plan.sourceUid);
  if(index>=0){
    const [source]=field.splice(index,1);
    duel.core.players[ownerTeam].grave.push(source);
    return;
  }
  if(duel.core.players[ownerTeam].grave.some(card=>card.uid===plan.sourceUid))return;
  if(duel.core.players[1-ownerTeam].grave.some(card=>card.uid===plan.sourceUid)){
    throw new Error('Reload foi enviada ao Cemitério da equipe que não é proprietária.');
  }
  throw new Error('Reload não está no campo controlado nem no Cemitério do proprietário original.');
}

/** Quick-Play activation: from hand on your turn; from Set only after a later turn, including response windows. */
export function activateReload(
  input:ReloadTagDuel,event:ReloadEvent
):ReloadActivation{
  assertPhysicalRules(input);
  if(!event||!validActivationId(event.activationId)||typeof event.sourceUid!=='string'||
    !Number.isInteger(event.actorSeat)||event.actorSeat<0||event.actorSeat>3){
    throw new Error('Evento de Reload inválido.');
  }
  const actorTeam=(event.actorSeat%2) as Team;
  if(input.active[actorTeam]!==event.actorSeat){
    throw new Error('Somente o assento físico ativo da equipe pode ativar Reload.');
  }
  if((input.reloadActivationIds??[]).includes(event.activationId)){
    throw new Error('Esta ativação de Reload já foi registrada.');
  }
  const source=locateSource(input,event.actorSeat,event.sourceUid);
  if(source.location==='hand'&&input.core.players[actorTeam].backrow.length>=3){
    throw new Error('Não há Zona de Magias/Armadilhas livre para ativar Reload.');
  }
  if(source.location==='backrow'&&
    (source.setTurn===null||source.setTurn>=input.core.turn)){
    throw new Error('Quick-Play baixada só pode ser ativada em um turno posterior ao de sua preparação.');
  }
  if(!activationWindow(input,actorTeam,source.location)){
    throw new Error('Reload exige prioridade legal fora da Damage Step; da mão, somente no próprio turno.');
  }
  assertPrivateDeckOwner(input,event.actorSeat);
  const actor=physicalHolder(input,event.actorSeat);
  const handAfterActivation=source.location==='hand'?
    actor.hand.filter(card=>card.uid!==event.sourceUid):actor.hand;
  const plan:ReloadPlan=Object.freeze({
    ...event,actorTeam,sourceOwnerSeat:source.ownerSeat,sourceLocation:source.location,
    sourceSetTurn:source.setTurn,turn:input.core.turn,handCount:handAfterActivation.length,
    deckCount:actor.deck.length,handCommitment:commitment(handAfterActivation),
    deckCommitment:commitment(actor.deck,true),activationPhase:input.core.phase as Phase,
    activationCurrent:input.core.current as Team
  });
  const next=structuredClone(input) as ReloadTagDuel;
  next.reloadActivationIds=[...(next.reloadActivationIds??[]),event.activationId];
  next.reloadPending=[...(next.reloadPending??[]),plan];
  if(source.location==='hand'){
    const holder=physicalHolder(next,event.actorSeat);
    const index=holder.hand.findIndex(card=>card.uid===event.sourceUid&&card.id===RELOAD_ID);
    if(index<0)throw new Error('Reload saiu da mão durante a ativação.');
    const [card]=holder.hand.splice(index,1);
    next.core.players[actorTeam].backrow.push({...card,faceUp:true,setTurn:next.core.turn});
  }else{
    const card=next.core.players[actorTeam].backrow.find(item=>item.uid===event.sourceUid);
    if(!card)throw new Error('Reload saiu da Zona de Magias/Armadilhas durante a ativação.');
    card.faceUp=true;
  }
  assertPhysicalRules(next);
  return {status:'activated',state:next,plan};
}

/** Return the remaining hand to that physical Deck, shuffle with the persisted duel RNG, then draw the same count. */
export function resolveReload(
  input:ReloadTagDuel,plan:ReloadPlan,effectNegated=false
):ReloadResolution{
  assertPhysicalRules(input);
  assertPlanBase(input,plan);
  if(typeof effectNegated!=='boolean')throw new Error('Estado de negação de Reload inválido.');
  const resolved=input.reloadResolvedIds??[];
  if(resolved.includes(plan.activationId)){
    return {status:'duplicate',state:input,activationId:plan.activationId};
  }
  const stored=(input.reloadPending??[]).find(item=>item.activationId===plan.activationId);
  if(!stored||!samePlan(stored,plan)){
    throw new Error('Plano de Reload não corresponde ao registro imutável da ativação.');
  }
  const before=inventorySnapshot(input),beforeHandCounts=[0,1,2,3].map(seat=>physicalHolder(input,seat).hand.length);
  const beforeDeckCounts=[0,1,2,3].map(seat=>physicalHolder(input,seat).deck.length);
  const logBefore=JSON.stringify(input.core.log),randomCounterBefore=input.core.random?.counter??0;
  const next=structuredClone(input) as ReloadTagDuel;
  if(!effectNegated){
    const actor=physicalHolder(next,plan.actorSeat);
    if(commitment(actor.hand)!==plan.handCommitment||
      commitment(actor.deck,true)!==plan.deckCommitment||
      actor.hand.length!==plan.handCount||actor.deck.length!==plan.deckCount){
      throw new Error('A mão ou o Deck mudou após a ativação de Reload.');
    }
    const count=actor.hand.length;
    actor.deck.push(...actor.hand.splice(0));
    shuffleDuel(actor.deck,next.core);
    actor.hand.push(...actor.deck.splice(0,count));
  }
  sendSourceToOriginalOwnerGrave(next,plan);
  next.reloadPending=(next.reloadPending??[]).filter(item=>item.activationId!==plan.activationId);
  next.reloadResolvedIds=[...resolved,plan.activationId];
  assertSameInventory(before,next);
  for(let seat=0;seat<4;seat++){
    const expectedHand=beforeHandCounts[seat];
    const expectedDeck=beforeDeckCounts[seat];
    const actualHand=physicalHolder(next,seat).hand.length;
    const actualDeck=physicalHolder(next,seat).deck.length;
    if(actualHand!==expectedHand||actualDeck!==expectedDeck){
      throw new Error('Reload alterou a quantidade de cartas da mão/Deck físico do assento '+seat+'.');
    }
  }
  assertPhysicalRules(next);
  if(JSON.stringify(next.core.log)!==logBefore){
    throw new Error('Reload publicou identidades privadas no log do duelo.');
  }
  if(effectNegated&&(next.core.random?.counter??0)!==randomCounterBefore){
    throw new Error('Reload negada consumiu o fluxo de sorteio.');
  }
  if(!effectNegated&&plan.handCount>0&&(next.core.random?.counter??0)<=randomCounterBefore){
    throw new Error('Reload não consumiu o fluxo HMAC persistido para embaralhar o Deck.');
  }
  return {status:effectNegated?'negated':'resolved',state:next,activationId:plan.activationId};
}
