import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const GRACEFUL_CHARITY_ID='79571449';
type Team=0|1;
type CharityLocation='hand'|'backrow';
export type GracefulCharityTagDuel=TagDuel&{
  gracefulCharityActivationIds?:string[];
  gracefulCharityPending?:GracefulCharityPlan[];
  gracefulCharityResolvedIds?:string[];
};
export type GracefulCharityEvent={activationId:string;actorSeat:number;sourceUid:string};
export type GracefulCharityPlan=GracefulCharityEvent&{
  actorTeam:Team;sourceOwnerSeat:number;sourceLocation:CharityLocation;
  sourceSetTurn:number|null;deckCountAtActivation:number;turn:number;
};
export type GracefulCharityActivation={status:'activated';state:GracefulCharityTagDuel;plan:GracefulCharityPlan};
export type PrivateGracefulCharityReceipt={
  activationId:string;recipientSeat:number;drawnUids:string[];discardedUids:string[];
};
export type GracefulCharityResolution={
  status:'resolved'|'negated'|'duplicate';state:GracefulCharityTagDuel;activationId:string;
  /** Non-enumerable and transient: never serialize the active player's private hand choices. */
  privateReceipt?:PrivateGracefulCharityReceipt;
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
function assertClassicShape(duel:GracefulCharityTagDuel):void{
  if(!duel||duel.mode!=='tag-classic'||!duel.core||
    !Array.isArray(duel.core.players)||duel.core.players.length!==2||
    !Array.isArray(duel.active)||duel.active.length!==2||
    !Array.isArray(duel.members)||duel.members.length!==4||
    !Array.isArray(duel.core.chain)||!duel.reserves){
    throw new Error('Estado TagDuel clássico inválido.');
  }
}
function inventorySnapshot(duel:GracefulCharityTagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function handSnapshot(duel:GracefulCharityTagDuel):string[]{
  const result:string[]=[];
  for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
  for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
  return result.sort();
}
function assertSameInventory(before:Map<string,string>,duel:GracefulCharityTagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('Graceful Charity alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('Graceful Charity alterou a identidade física: '+uid);
  }
}
function assertPhysicalRules(duel:GracefulCharityTagDuel):void{
  assertClassicShape(duel);
  const all=inventorySnapshot(duel),extra=new Set<string>(),extras=[0,0,0,0];
  for(const player of duel.core.players){
    if(player.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');
    if(player.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');
    for(const card of player.extra??[]){extra.add(card.uid);extras[physicalSeat(card.uid)]++;}
  }
  for(const [seat,held] of Object.entries(duel.reserves)){
    if(!/^\d$/.test(seat)||Number(seat)>3)throw new Error('Assento físico de reserva inválido.');
    for(const card of held.extra??[]){extra.add(card.uid);extras[physicalSeat(card.uid)]++;}
  }
  const main=[0,0,0,0];
  for(const uid of all.keys())if(!extra.has(uid))main[physicalSeat(uid)]++;
  for(let seat=0;seat<4;seat++){
    if(main[seat]<20||main[seat]>30)throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    if(extras[seat]>5)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
  }
  // The Field Zone is independent from the three shared Spell/Trap Zones.
}
function physicalHolder(duel:GracefulCharityTagDuel,seat:number){
  const team=(seat%2) as Team;
  const held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
  if(!held)throw new Error('A mão/Deck físico do participante não está disponível.');
  return held;
}
function locateSource(
  duel:GracefulCharityTagDuel,actorSeat:number,sourceUid:string
):{location:CharityLocation;ownerSeat:number;setTurn:number|null}{
  const team=(actorSeat%2) as Team,holder=physicalHolder(duel,actorSeat);
  const hand=holder.hand.find(card=>card.uid===sourceUid&&card.id===GRACEFUL_CHARITY_ID);
  const field=duel.core.players[team].backrow.find(card=>card.uid===sourceUid&&card.id===GRACEFUL_CHARITY_ID);
  const opposingField=duel.core.players[1-team].backrow.find(card=>card.uid===sourceUid&&card.id===GRACEFUL_CHARITY_ID);
  if(opposingField)throw new Error('Graceful Charity preparada pertence à equipe adversária.');
  if(hand&&field)throw new Error('Graceful Charity aparece em duas zonas.');
  if(hand)return {location:'hand',ownerSeat:physicalSeat(sourceUid),setTurn:null};
  if(field){
    const ownerSeat=physicalSeat(sourceUid);
    if(ownerSeat%2!==team)throw new Error('Graceful Charity preparada pertence à equipe adversária.');
    if(field.faceUp)throw new Error('Graceful Charity já está com a face para cima.');
    return {location:'backrow',ownerSeat,setTurn:Number.isInteger(field.setTurn)?field.setTurn:null};
  }
  throw new Error('Graceful Charity não está na mão ativa nem baixada na Zona de Magias/Armadilhas da equipe.');
}
function samePlan(a:GracefulCharityPlan,b:GracefulCharityPlan):boolean{
  return a.activationId===b.activationId&&a.actorSeat===b.actorSeat&&a.sourceUid===b.sourceUid&&
    a.actorTeam===b.actorTeam&&a.sourceOwnerSeat===b.sourceOwnerSeat&&
    a.sourceLocation===b.sourceLocation&&a.sourceSetTurn===b.sourceSetTurn&&
    a.deckCountAtActivation===b.deckCountAtActivation&&a.turn===b.turn;
}
function assertHandsEqual(expected:string[],duel:GracefulCharityTagDuel):void{
  if(JSON.stringify([...expected].sort())!==JSON.stringify(handSnapshot(duel))){
    throw new Error('Graceful Charity alterou uma mão física além das três compras e dois descartes.');
  }
}
function attachPrivateReceipt(
  result:Omit<GracefulCharityResolution,'privateReceipt'>,
  receipt?:PrivateGracefulCharityReceipt
):GracefulCharityResolution{
  const output=result as GracefulCharityResolution;
  if(receipt)Object.defineProperty(output,'privateReceipt',{
    value:Object.freeze({...receipt,drawnUids:[...receipt.drawnUids],discardedUids:[...receipt.discardedUids]}),
    enumerable:false,configurable:false,writable:false
  });
  return output;
}

/** Activate from the active seat's hand or a face-down team Spell/Trap Zone in the Main Phase. */
export function activateGracefulCharity(
  input:GracefulCharityTagDuel,event:GracefulCharityEvent
):GracefulCharityActivation{
  assertPhysicalRules(input);
  if(!event||!validActivationId(event.activationId)||typeof event.sourceUid!=='string'||
    !Number.isInteger(event.actorSeat)||event.actorSeat<0||event.actorSeat>3){
    throw new Error('Evento de Graceful Charity inválido.');
  }
  const actorTeam=(event.actorSeat%2) as Team;
  if(input.core.current!==actorTeam||input.active[actorTeam]!==event.actorSeat||
    input.core.phase!=='main'||input.core.pending.kind!=='none'||
    input.core.chain.length!==0||input.core.choice||input.core.turnEnding){
    throw new Error('Graceful Charity exige prioridade aberta na Main Phase da equipe ativa.');
  }
  if((input.gracefulCharityActivationIds??[]).includes(event.activationId)){
    throw new Error('Esta ativação de Graceful Charity já foi registrada.');
  }
  const source=locateSource(input,event.actorSeat,event.sourceUid);
  if(source.ownerSeat%2!==actorTeam||(source.location==='hand'&&source.ownerSeat!==event.actorSeat)){
    throw new Error('A Magia ativada não pertence à equipe/assento permitido.');
  }
  if(source.location==='hand'&&input.core.players[actorTeam].backrow.length>=3){
    throw new Error('Não há Zona de Magias/Armadilhas livre para ativar a Magia.');
  }
  const actor=physicalHolder(input,event.actorSeat);
  if(actor.deck.length<3)throw new Error('Graceful Charity exige pelo menos três cartas no Deck para ativar.');
  const plan:GracefulCharityPlan=Object.freeze({
    ...event,actorTeam,sourceOwnerSeat:source.ownerSeat,sourceLocation:source.location,
    sourceSetTurn:source.setTurn,deckCountAtActivation:actor.deck.length,turn:input.core.turn
  });
  const next=structuredClone(input) as GracefulCharityTagDuel;
  next.gracefulCharityActivationIds=[...(next.gracefulCharityActivationIds??[]),event.activationId];
  next.gracefulCharityPending=[...(next.gracefulCharityPending??[]),plan];
  if(source.location==='hand'){
    const holder=physicalHolder(next,event.actorSeat);
    const index=holder.hand.findIndex(card=>card.uid===event.sourceUid&&card.id===GRACEFUL_CHARITY_ID);
    if(index<0)throw new Error('Graceful Charity saiu da mão durante a ativação.');
    const [card]=holder.hand.splice(index,1);
    next.core.players[actorTeam].backrow.push({...card,faceUp:true,setTurn:next.core.turn});
  }else{
    const card=next.core.players[actorTeam].backrow.find(item=>item.uid===event.sourceUid);
    if(!card)throw new Error('Graceful Charity saiu da Zona de Magias/Armadilhas durante a ativação.');
    card.faceUp=true;
  }
  assertPhysicalRules(next);
  return {status:'activated',state:next,plan};
}

/** Draw the top three cards for the activating physical seat, then discard exactly two chosen UIDs. */
export function resolveGracefulCharity(
  input:GracefulCharityTagDuel,plan:GracefulCharityPlan,discardUids:string[]|undefined,effectNegated=false
):GracefulCharityResolution{
  assertPhysicalRules(input);
  if(!plan||!validActivationId(plan.activationId)||!Number.isInteger(plan.actorSeat)||
    plan.actorSeat<0||plan.actorSeat>3||!validTeam(plan.actorTeam)||plan.actorTeam!==plan.actorSeat%2||
    plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||plan.sourceOwnerSeat%2!==plan.actorTeam||
    (plan.sourceLocation!=='hand'&&plan.sourceLocation!=='backrow')||
    (plan.sourceLocation==='hand'&&plan.sourceOwnerSeat!==plan.actorSeat)||
    !(plan.sourceSetTurn===null||Number.isInteger(plan.sourceSetTurn))||
    !Number.isInteger(plan.deckCountAtActivation)||plan.deckCountAtActivation<3||
    plan.turn!==input.core.turn||input.active[plan.actorTeam]!==plan.actorSeat||
    input.core.current!==plan.actorTeam||typeof effectNegated!=='boolean'||
    !(input.gracefulCharityActivationIds??[]).includes(plan.activationId)){
    throw new Error('Plano de Graceful Charity obsoleto ou inválido.');
  }
  const resolved=input.gracefulCharityResolvedIds??[];
  if(resolved.includes(plan.activationId)){
    return attachPrivateReceipt({status:'duplicate',state:input,activationId:plan.activationId});
  }
  const storedPlan=(input.gracefulCharityPending??[]).find(item=>item.activationId===plan.activationId);
  if(!storedPlan||!samePlan(storedPlan,plan)){
    throw new Error('Plano de Graceful Charity não corresponde ao registro imutável da ativação.');
  }
  const before=inventorySnapshot(input),hands=handSnapshot(input),logBefore=JSON.stringify(input.core.log);
  const next=structuredClone(input) as GracefulCharityTagDuel;
  const sourceIndex=next.core.players[plan.actorTeam].backrow.findIndex(card=>card.uid===plan.sourceUid);
  if(sourceIndex>=0){
    const [source]=next.core.players[plan.actorTeam].backrow.splice(sourceIndex,1);
    next.core.players[plan.actorTeam].grave.push(source);
  }else if(!next.core.players[plan.actorTeam].grave.some(card=>card.uid===plan.sourceUid)){
    throw new Error('Graceful Charity não está no campo nem no Cemitério após a ativação.');
  }
  next.gracefulCharityPending=(next.gracefulCharityPending??[]).filter(item=>item.activationId!==plan.activationId);
  next.gracefulCharityResolvedIds=[...resolved,plan.activationId];
  let drawnUids:string[]=[],discardedUids:string[]=[];
  if(!effectNegated){
    const actor=physicalHolder(next,plan.actorSeat);
    if(actor.deck.length<3)throw new Error('Deck insuficiente na resolução para comprar três cartas.');
    const drawn=actor.deck.splice(0,3);
    drawnUids=drawn.map(card=>card.uid);
    actor.hand.push(...drawn);
    if(!Array.isArray(discardUids)||discardUids.length!==2||
      new Set(discardUids).size!==2||discardUids.some(uid=>typeof uid!=='string')){
      throw new Error('Graceful Charity exige exatamente dois descartes distintos.');
    }
    const chosen=actor.hand.filter(card=>discardUids.includes(card.uid));
    if(chosen.length!==2)throw new Error('Escolha duas cartas distintas da mão física ativa após comprar.');
    discardedUids=chosen.map(card=>card.uid);
    actor.hand=actor.hand.filter(card=>!discardUids.includes(card.uid));
    next.core.players[plan.actorTeam].grave.push(...chosen);
  }else if(discardUids!==undefined&&discardUids.length>0){
    throw new Error('Uma ativação negada não pode receber descartes.');
  }
  assertSameInventory(before,next);
  const expectedHands=[...hands,...drawnUids].filter(uid=>!discardedUids.includes(uid)).sort();
  assertHandsEqual(expectedHands,next);
  assertPhysicalRules(next);
  if(JSON.stringify(next.core.log)!==logBefore){
    throw new Error('Graceful Charity alterou o log do duelo com conteúdo privado.');
  }
  return attachPrivateReceipt({
    status:effectNegated?'negated':'resolved',state:next,activationId:plan.activationId
  },!effectNegated?{activationId:plan.activationId,recipientSeat:plan.actorSeat,drawnUids,discardedUids}:undefined);
}

/** Only the activating physical seat receives the transient draw/discard receipt. */
export function privateGracefulCharityReceiptForSeat(
  resolution:GracefulCharityResolution,viewerSeat:number
):PrivateGracefulCharityReceipt|undefined{
  const receipt=resolution?.privateReceipt;
  if(!receipt||!Number.isInteger(viewerSeat)||viewerSeat!==receipt.recipientSeat)return undefined;
  return {...receipt,drawnUids:[...receipt.drawnUids],discardedUids:[...receipt.discardedUids]};
}
