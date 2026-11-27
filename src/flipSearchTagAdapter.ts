import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {rulesFor} from './rulesProfile';
import {getPlayableCard} from './effectRegistry';

export const CAT_OF_ILL_OMEN_ID='24140059';
export const AN_OWL_OF_LUCK_ID='23927567';
export const NECROVALLEY_ID='47355498';
type Team=0|1;
type Seat=0|1|2|3;
export type FlipSearchEffect='cat-trap'|'owl-field';
export type FlipSearchLookup=(cardId:string)=>FlipSearchEffect|undefined;
export type NecrovalleyPredicate=(duel:TagDuel)=>boolean;
export type FlipSearchEvent={activationId:string;actorSeat:Seat;sourceUid:string};
export type FlipSearchPlan=FlipSearchEvent&{
  actorTeam:Team;
  sourceOwnerSeat:Seat;
  sourceCardId:string;
  effect:FlipSearchEffect;
  turn:number;
  activationCurrent:Team;
  activationPhase:TagDuel['core']['phase'];
  cursorAtActivation:number;
};
export type FlipSearchSession=TagDuel&{
  flipSearchActivationIds?:string[];
  flipSearchPending?:FlipSearchPlan[];
  flipSearchResolvedIds?:string[];
};
export type FlipSearchChoice={selectedUid:string;destination:'top'|'hand'};
export type FlipSearchReceipt={
  visibility:'private';
  privateSeat:Seat;
  activationId:string;
  effect:FlipSearchEffect;
  sourceUid:string;
  selectedUid:string|null;
  selectedCardId:string|null;
  destination:'top'|'hand'|null;
  status:'searched-to-top'|'added-to-hand'|'no-valid-card'|'effect-negated';
};
export type FlipSearchActivation={status:'triggered';state:FlipSearchSession;plan:FlipSearchPlan};
export type FlipSearchResolution={
  status:'searched-to-top'|'added-to-hand'|'no-valid-card'|'negated'|'duplicate';
  state:FlipSearchSession;
  receipt:FlipSearchReceipt|null;
};

export function defaultFlipSearchEffect(id:string):FlipSearchEffect|undefined{return defaultLookup(id);}
const defaultLookup:FlipSearchLookup=(id)=>{
  if(id===CAT_OF_ILL_OMEN_ID)return 'cat-trap';
  if(id===AN_OWL_OF_LUCK_ID)return 'owl-field';
  return undefined;
};
export function hasNecrovalleyOnField(duel:TagDuel):boolean{
  return duel.core.players.some(player=>player.field?.id===NECROVALLEY_ID&&player.field.faceUp===true);
}
function validSeat(value:unknown):value is Seat{return Number.isInteger(value)&&Number(value)>=0&&Number(value)<=3;}
function validTeam(value:unknown):value is Team{return value===0||value===1;}
function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.trim().length>0&&value.length<=128&&!/[\u0000-\u001f]/.test(value);
}
function physicalSeat(uid:string):Seat{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('UID físico 2v2 inválido: '+uid);
  return Number(match[1]) as Seat;
}
function physicalHolder(duel:FlipSearchSession,seat:Seat){
  const team=(seat%2) as Team;
  const holder=duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
  if(!holder)throw new Error('Deck físico do participante não está disponível.');
  return holder;
}
function inventorySnapshot(duel:FlipSearchSession):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function assertSameInventory(before:Map<string,string>,duel:FlipSearchSession):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('Busca FLIP alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('Busca FLIP alterou a identidade física: '+uid);
}
function assertPhysicalRules(duel:FlipSearchSession):void{
  if(duel.mode!=='tag-classic')throw new Error('Busca FLIP exige TagDuel clássico.');
  assertTagDuel(duel);
  const rules=rulesFor(duel.core);
  if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
    rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
    throw new Error('Perfil de regras não corresponde ao Speed RPG clássico.');
  }
  const extraUids=new Set<string>();
  for(const player of duel.core.players){
    if(player.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');
    if(player.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');
    for(const card of player.extra??[])extraUids.add(card.uid);
  }
  for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
  const counts=Array.from({length:4},()=>({main:0,extra:0}));
  for(const card of inventorySnapshot(duel).keys()){
    const seat=physicalSeat(card);
    if(extraUids.has(card))counts[seat].extra++;
    else counts[seat].main++;
  }
  for(let seat=0;seat<4;seat++){
    if(counts[seat].main<rules.mainDeckMin||counts[seat].main>rules.mainDeckMax){
      throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    }
    if(counts[seat].extra>rules.extraDeckMax)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
  }
  // The Field Zone is intentionally separate from the three shared backrow slots.
}
function assertPrivateDeckOwner(duel:FlipSearchSession,seat:Seat):void{
  const prefix='m'+seat+':',holder=physicalHolder(duel,seat);
  if(holder.deck.some(card=>!card.uid.startsWith(prefix))){
    throw new Error('A busca exige o Deck privado do assento ativo.');
  }
}
function findSource(
  duel:FlipSearchSession,actorSeat:Seat,sourceUid:string,lookup:FlipSearchLookup
):{ownerSeat:Seat;cardId:string;effect:FlipSearchEffect}{
  const team=(actorSeat%2) as Team;
  const source=duel.core.players[team].monsters.find(card=>card.uid===sourceUid);
  if(!source)throw new Error('Monstro da busca FLIP não está no campo da equipe controladora.');
  if(source.faceUp!==true)throw new Error('Efeito FLIP exige que o monstro esteja com a face para cima.');
  const effect=lookup(source.id);
  if(effect!=='cat-trap'&&effect!=='owl-field')throw new Error('Monstro não pertence à família de busca FLIP admitida.');
  return {ownerSeat:physicalSeat(source.uid),cardId:source.id,effect};
}
function samePlan(a:FlipSearchPlan,b:FlipSearchPlan):boolean{
  return a.activationId===b.activationId&&a.actorSeat===b.actorSeat&&a.sourceUid===b.sourceUid&&
    a.actorTeam===b.actorTeam&&a.sourceOwnerSeat===b.sourceOwnerSeat&&a.sourceCardId===b.sourceCardId&&
    a.effect===b.effect&&a.turn===b.turn&&a.activationCurrent===b.activationCurrent&&
    a.activationPhase===b.activationPhase&&a.cursorAtActivation===b.cursorAtActivation;
}
function assertPlanBase(input:FlipSearchSession,plan:FlipSearchPlan):void{
  if(!plan||!validActivationId(plan.activationId)||!validSeat(plan.actorSeat)||
    !validTeam(plan.actorTeam)||plan.actorTeam!==plan.actorSeat%2||
    !validSeat(plan.sourceOwnerSeat)||plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||
    typeof plan.sourceCardId!=='string'||!plan.sourceCardId||
    (plan.effect!=='cat-trap'&&plan.effect!=='owl-field')||
    !Number.isInteger(plan.turn)||plan.turn!==input.core.turn||
    !validTeam(plan.activationCurrent)||!Number.isInteger(plan.cursorAtActivation)||
    plan.cursorAtActivation<0||plan.cursorAtActivation>3||
    !['main','battle','response','choice','discard','finished'].includes(plan.activationPhase)||
    !(input.flipSearchActivationIds??[]).includes(plan.activationId)){
    throw new Error('Plano de busca FLIP obsoleto ou inválido.');
  }
  const stored=(input.flipSearchPending??[]).find(item=>item.activationId===plan.activationId);
  if(!stored||!samePlan(stored,plan))throw new Error('Plano FLIP não corresponde ao registro imutável do gatilho.');
}
function eligible(cardId:string,effect:FlipSearchEffect):boolean{
  const card=getPlayableCard(cardId);
  if(!card)return false;
  return effect==='cat-trap'?card.kind==='trap':card.kind==='spell'&&card.field===true;
}
function zoneCounts(duel:FlipSearchSession){
  return [0,1,2,3].map(seat=>{
    const held=physicalHolder(duel,seat as Seat);
    return {deck:held.deck.length,hand:held.hand.length};
  });
}
function assertZoneCounts(
  before:ReturnType<typeof zoneCounts>,after:ReturnType<typeof zoneCounts>,actorSeat:Seat,
  destination:'top'|'hand'|null
):void{
  for(let seat=0;seat<4;seat++){
    const moved=seat===actorSeat&&destination!==null;
    const expectedDeck=before[seat].deck-(moved&&destination==='hand'?1:0);
    const expectedHand=before[seat].hand+(moved&&destination==='hand'?1:0);
    if(after[seat].deck!==expectedDeck||after[seat].hand!==expectedHand){
      throw new Error('Busca FLIP alterou Deck/mão de um assento não autorizado.');
    }
  }
}

/** Records a resolved face-up FLIP trigger; the host must call this only from the engine's Flip-event hook. */
export function activateFlipSearch(
  input:FlipSearchSession,event:FlipSearchEvent,lookup:FlipSearchLookup=defaultLookup
):FlipSearchActivation{
  assertPhysicalRules(input);
  if(input.core.phase==='finished')throw new Error('Duelo encerrado.');
  if(!event||!validActivationId(event.activationId)||!validSeat(event.actorSeat)||
    typeof event.sourceUid!=='string'||!event.sourceUid){
    throw new Error('Evento de busca FLIP inválido.');
  }
  const actorTeam=(event.actorSeat%2) as Team;
  if(input.active[actorTeam]!==event.actorSeat){
    throw new Error('Somente o participante ativo da equipe pode resolver a escolha privada.');
  }
  if((input.flipSearchActivationIds??[]).includes(event.activationId)){
    throw new Error('Este gatilho FLIP já foi registrado.');
  }
  const source=findSource(input,event.actorSeat,event.sourceUid,lookup);
  assertPrivateDeckOwner(input,event.actorSeat);
  const plan:FlipSearchPlan=Object.freeze({
    ...event,actorTeam,sourceOwnerSeat:source.ownerSeat,sourceCardId:source.cardId,effect:source.effect,
    turn:input.core.turn,activationCurrent:input.core.current as Team,
    activationPhase:input.core.phase,cursorAtActivation:input.cursor
  });
  const next=structuredClone(input) as FlipSearchSession;
  next.flipSearchActivationIds=[...(next.flipSearchActivationIds??[]),event.activationId];
  next.flipSearchPending=[...(next.flipSearchPending??[]),plan];
  assertPhysicalRules(next);
  return {status:'triggered',state:next,plan};
}

/** Selects from the active participant's current private Deck at resolution, not at trigger time. */
export function resolveFlipSearch(
  input:FlipSearchSession,plan:FlipSearchPlan,choice:FlipSearchChoice|null=null,effectNegated=false,
  hasNecrovalley:NecrovalleyPredicate=hasNecrovalleyOnField
):FlipSearchResolution{
  assertPhysicalRules(input);
  if(plan&&typeof plan.activationId==='string'&&(input.flipSearchResolvedIds??[]).includes(plan.activationId)){
    return {status:'duplicate',state:input,receipt:null};
  }
  assertPlanBase(input,plan);
  if(typeof effectNegated!=='boolean')throw new Error('Estado de negação FLIP inválido.');
  if(effectNegated&&choice!==null)throw new Error('Efeito negado não pode selecionar carta.');
  const before=inventorySnapshot(input),beforeZones=zoneCounts(input);
  const logBefore=JSON.stringify(input.core.log),randomBefore=input.core.random?.counter??0;
  const next=structuredClone(input) as FlipSearchSession;
  const actor=physicalHolder(next,plan.actorSeat);
  let status:FlipSearchReceipt['status'];
  let selectedUid:string|null=null,selectedCardId:string|null=null,destination:'top'|'hand'|null=null;
  if(effectNegated){
    status='effect-negated';
  }else{
    const candidates=actor.deck.filter(card=>eligible(card.id,plan.effect));
    if(candidates.length===0){
      if(choice!==null)throw new Error('Não há carta válida no Deck privado para selecionar.');
      status='no-valid-card';
    }else{
      if(!choice||typeof choice.selectedUid!=='string'||!['top','hand'].includes(choice.destination)){
        throw new Error('Selecione uma carta válida do Deck privado e seu destino.');
      }
      const index=actor.deck.findIndex(card=>card.uid===choice.selectedUid);
      if(index<0)throw new Error('A carta selecionada não está no Deck físico do participante ativo.');
      const card=actor.deck[index];
      if(!eligible(card.id,plan.effect))throw new Error('Tipo de carta incompatível com o efeito FLIP.');
      if(physicalSeat(card.uid)!==plan.actorSeat)throw new Error('A seleção não pertence ao Deck físico do participante ativo.');
      if(choice.destination==='hand'&&!hasNecrovalley(next)){
        throw new Error('Somente Necrovalley face-up no campo permite adicionar a carta à mão.');
      }
      const [selected]=actor.deck.splice(index,1);
      if(choice.destination==='top')actor.deck.unshift(selected);
      else actor.hand.push(selected);
      selectedUid=selected.uid;selectedCardId=selected.id;destination=choice.destination;
      status=choice.destination==='top'?'searched-to-top':'added-to-hand';
    }
  }
  next.flipSearchPending=(next.flipSearchPending??[]).filter(item=>item.activationId!==plan.activationId);
  next.flipSearchResolvedIds=[...(next.flipSearchResolvedIds??[]),plan.activationId];
  const receipt:FlipSearchReceipt={
    visibility:'private',privateSeat:plan.actorSeat,activationId:plan.activationId,effect:plan.effect,
    sourceUid:plan.sourceUid,selectedUid,selectedCardId,destination,status
  };
  assertSameInventory(before,next);
  assertZoneCounts(beforeZones,zoneCounts(next),plan.actorSeat,destination);
  assertPrivateDeckOwner(next,plan.actorSeat);
  assertPhysicalRules(next);
  if(JSON.stringify(next.core.log)!==logBefore)throw new Error('Busca FLIP publicou informação privada no log.');
  if((next.core.random?.counter??0)!==randomBefore)throw new Error('Busca FLIP consumiu aleatoriedade sem necessidade.');
  return {status:status==='effect-negated'?'negated':status,state:next,receipt};
}
