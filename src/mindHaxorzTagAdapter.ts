import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const MIND_HAXORZ_ID='75392615';
type Team=0|1;
type SetZone='monster'|'backrow'|'field';
type PrivateCard={uid:string;id:string;ownerSeat:number;zone:SetZone};
export type MindHaxorzTagDuel=TagDuel&{
  mindHaxorzActivationIds?:string[];
  mindHaxorzResolvedIds?:string[];
};
export type MindHaxorzEvent={
  activationId:string;
  actorSeat:number;
  targetSeat:number;
  sourceUid:string;
};
export type MindHaxorzPlan=MindHaxorzEvent&{
  actorTeam:Team;
  sourceOwnerSeat:number;
  sourceSetTurn:number;
  turn:number;
};
export type MindHaxorzActivation={
  status:'activated'|'lost-to-cost';
  state:MindHaxorzTagDuel;
  plan:MindHaxorzPlan;
};
export type PrivateMindHaxorzReceipt={
  activationId:string;
  recipientSeat:number;
  targetSeat:number;
  hand:Array<{uid:string;id:string;ownerSeat:number}>;
  setCards:PrivateCard[];
};
export type MindHaxorzResolution={
  status:'resolved'|'negated'|'duplicate';
  state:MindHaxorzTagDuel;
  activationId:string;
  /** Non-enumerable and transient: never serialized into public duel state/logs. */
  privateReceipt?:PrivateMindHaxorzReceipt;
};
export type PrivateMindHaxorzReveal=PrivateMindHaxorzReceipt;

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('UID físico 2v2 inválido: '+uid);
  return Number(match[1]);
}
function validTeam(team:unknown):team is Team{return team===0||team===1;}
function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.trim().length>0&&value.length<=128;
}
function assertClassicShape(duel:MindHaxorzTagDuel):void{
  if(!duel||duel.mode!=='tag-classic'||!duel.core||
    !Array.isArray(duel.core.players)||duel.core.players.length!==2||
    !Array.isArray(duel.active)||duel.active.length!==2||
    !Array.isArray(duel.members)||duel.members.length!==4||
    !Array.isArray(duel.core.chain)||!duel.reserves){
    throw new Error('Estado TagDuel clássico inválido.');
  }
}
function inventorySnapshot(duel:MindHaxorzTagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function handSnapshot(duel:MindHaxorzTagDuel):string[]{
  const result:string[]=[];
  for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
  for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
  return result.sort();
}
function assertSameInventory(before:Map<string,string>,duel:MindHaxorzTagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('Mind Haxorz alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('Mind Haxorz alterou a identidade física: '+uid);
  }
}
function assertPhysicalRules(duel:MindHaxorzTagDuel):void{
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
    if(!/^\\d$/.test(seat)||Number(seat)>3)throw new Error('Assento físico de reserva inválido.');
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
function physicalHolder(duel:MindHaxorzTagDuel,seat:number){
  const team=(seat%2) as Team;
  const held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
  if(!held)throw new Error('A mão física do participante não está disponível.');
  return held;
}
function locateSetSource(
  duel:MindHaxorzTagDuel,
  actorSeat:number,
  sourceUid:string
):{ownerSeat:number;setTurn:number}{
  const team=(actorSeat%2) as Team;
  const source=duel.core.players[team].backrow.find(card=>
    card.uid===sourceUid&&card.id===MIND_HAXORZ_ID
  );
  if(!source)throw new Error('Mind Haxorz precisa estar na Zona de Magias/Armadilhas da equipe ativa.');
  const ownerSeat=physicalSeat(source.uid);
  if(ownerSeat%2!==team)throw new Error('Mind Haxorz pertence à equipe adversária.');
  if(source.faceUp)throw new Error('Mind Haxorz já está com a face para cima.');
  if(!Number.isInteger(source.setTurn)||source.setTurn>=duel.core.turn){
    throw new Error('Mind Haxorz não pode ser ativada no mesmo turno em que foi Baixada.');
  }
  return {ownerSeat,setTurn:source.setTurn};
}
function attachPrivateReceipt(
  result:Omit<MindHaxorzResolution,'privateReceipt'>,
  receipt?:PrivateMindHaxorzReceipt
):MindHaxorzResolution{
  const output=result as MindHaxorzResolution;
  if(receipt)Object.defineProperty(output,'privateReceipt',{
    value:Object.freeze(receipt),enumerable:false,configurable:false,writable:false
  });
  return output;
}

/**
 * Activate the previously Set Normal Trap. Its 500 LP cost is paid immediately,
 * even if the effect is later negated. In a TagDuel, targetSeat selects one of the
 * two opposing physical hands; all face-down cards on the opposing shared field
 * are inspected together.
 */
export function activateMindHaxorz(
  input:MindHaxorzTagDuel,
  event:MindHaxorzEvent
):MindHaxorzActivation{
  assertPhysicalRules(input);
  if(!event||!validActivationId(event.activationId)||
    typeof event.sourceUid!=='string'||!Number.isInteger(event.actorSeat)||
    event.actorSeat<0||event.actorSeat>3||!Number.isInteger(event.targetSeat)||
    event.targetSeat<0||event.targetSeat>3){
    throw new Error('Evento de Mind Haxorz inválido.');
  }
  const actorTeam=(event.actorSeat%2) as Team;
  if(event.targetSeat%2===actorTeam)throw new Error('A mão escolhida deve pertencer à equipe adversária.');
  if(input.core.current!==actorTeam||input.active[actorTeam]!==event.actorSeat||
    !['main','battle'].includes(input.core.phase)||input.core.pending.kind!=='none'||
    input.core.chain.length!==0||input.core.choice||input.core.turnEnding){
    throw new Error('Mind Haxorz exige prioridade aberta da equipe ativa na Main/Battle Phase.');
  }
  if((input.mindHaxorzActivationIds??[]).includes(event.activationId)){
    throw new Error('Esta ativação de Mind Haxorz já foi registrada.');
  }
  const source=locateSetSource(input,event.actorSeat,event.sourceUid);
  const lp=input.core.players[actorTeam].lp;
  if(lp<500)throw new Error('PV insuficientes para pagar o custo de Mind Haxorz.');
  const plan:MindHaxorzPlan=Object.freeze({
    ...event,actorTeam,sourceOwnerSeat:source.ownerSeat,sourceSetTurn:source.setTurn,turn:input.core.turn
  });
  const next=structuredClone(input) as MindHaxorzTagDuel;
  next.mindHaxorzActivationIds=[...(next.mindHaxorzActivationIds??[]),event.activationId];
  next.core.players[actorTeam].lp-=500;
  const sourceCard=next.core.players[actorTeam].backrow.find(card=>card.uid===event.sourceUid);
  if(!sourceCard)throw new Error('Mind Haxorz saiu do campo durante a ativação.');
  sourceCard.faceUp=true;
  if(next.core.players[actorTeam].lp===0){
    next.core.phase='finished';
    next.core.winner=next.core.players[1-actorTeam].id;
    next.core.reason='Life Points';
    next.core.pending={kind:'none'};
    next.core.chain=[];
    delete next.core.choice;
    return {status:'lost-to-cost',state:next,plan};
  }
  return {status:'activated',state:next,plan};
}

/**
 * Resolve the inspection after the chain. A negated effect still pays its cost
 * and sends the Trap to the Graveyard, but creates no private reveal.
 */
export function resolveMindHaxorz(
  input:MindHaxorzTagDuel,
  plan:MindHaxorzPlan,
  effectNegated=false
):MindHaxorzResolution{
  assertPhysicalRules(input);
  if(!plan||!validActivationId(plan.activationId)||
    !Number.isInteger(plan.actorSeat)||plan.actorSeat<0||plan.actorSeat>3||
    !Number.isInteger(plan.targetSeat)||plan.targetSeat<0||plan.targetSeat>3||
    !validTeam(plan.actorTeam)||plan.actorTeam!==plan.actorSeat%2||
    plan.targetSeat%2===plan.actorTeam||
    plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||
    plan.sourceOwnerSeat%2!==plan.actorTeam||
    !Number.isInteger(plan.sourceSetTurn)||plan.sourceSetTurn>=plan.turn||
    plan.turn!==input.core.turn||input.active[plan.actorTeam]!==plan.actorSeat||
    input.core.current!==plan.actorTeam||typeof effectNegated!=='boolean'||
    !(input.mindHaxorzActivationIds??[]).includes(plan.activationId)){
    throw new Error('Plano de Mind Haxorz obsoleto ou inválido.');
  }
  const resolved=input.mindHaxorzResolvedIds??[];
  if(resolved.includes(plan.activationId)){
    return attachPrivateReceipt({status:'duplicate',state:input,activationId:plan.activationId});
  }
  const before=inventorySnapshot(input),hands=handSnapshot(input),logBefore=JSON.stringify(input.core.log);
  const next=structuredClone(input) as MindHaxorzTagDuel;
  const sourceZone=next.core.players[plan.actorTeam].backrow.findIndex(card=>card.uid===plan.sourceUid);
  if(sourceZone>=0){
    const [source]=next.core.players[plan.actorTeam].backrow.splice(sourceZone,1);
    next.core.players[plan.actorTeam].grave.push(source);
  }
  next.mindHaxorzResolvedIds=[...resolved,plan.activationId];
  let receipt:PrivateMindHaxorzReceipt|undefined;
  if(!effectNegated){
    const target=physicalHolder(next,plan.targetSeat);
    const hand=target.hand.map(card=>({
      uid:card.uid,id:card.id,ownerSeat:physicalSeat(card.uid)
    }));
    const opponentTeam=(1-plan.actorTeam) as Team;
    const opponent=next.core.players[opponentTeam];
    const setCards:PrivateCard[]=[
      ...opponent.monsters.filter(card=>!card.faceUp).map(card=>({
        uid:card.uid,id:card.id,ownerSeat:physicalSeat(card.uid),zone:'monster' as const
      })),
      ...opponent.backrow.filter(card=>!card.faceUp).map(card=>({
        uid:card.uid,id:card.id,ownerSeat:physicalSeat(card.uid),zone:'backrow' as const
      })),
      ...(opponent.field&&!opponent.field.faceUp?[{
        uid:opponent.field.uid,id:opponent.field.id,
        ownerSeat:physicalSeat(opponent.field.uid),zone:'field' as const
      }]:[])
    ].sort((a,b)=>a.zone.localeCompare(b.zone)||a.uid.localeCompare(b.uid));
    receipt={
      activationId:plan.activationId,
      recipientSeat:plan.actorSeat,
      targetSeat:plan.targetSeat,
      hand,
      setCards
    };
  }
  assertSameInventory(before,next);
  if(JSON.stringify(hands)!==JSON.stringify(handSnapshot(next))){
    throw new Error('Mind Haxorz moveu uma carta de uma mão privada.');
  }
  assertPhysicalRules(next);
  if(JSON.stringify(next.core.log)!==logBefore){
    throw new Error('Mind Haxorz publicou informações privadas no log do duelo.');
  }
  return attachPrivateReceipt({
    status:effectNegated?'negated':'resolved',
    state:next,
    activationId:plan.activationId
  },receipt);
}

/** Only the exact activating physical seat receives the hand/set-card identities. */
export function privateMindHaxorzRevealForSeat(
  resolution:MindHaxorzResolution,
  viewerSeat:number
):PrivateMindHaxorzReveal|undefined{
  const receipt=resolution?.privateReceipt;
  if(!receipt||!Number.isInteger(viewerSeat)||viewerSeat!==receipt.recipientSeat)return undefined;
  return {
    activationId:receipt.activationId,
    recipientSeat:receipt.recipientSeat,
    targetSeat:receipt.targetSeat,
    hand:receipt.hand.map(card=>({...card})),
    setCards:receipt.setCards.map(card=>({...card}))
  };
}
