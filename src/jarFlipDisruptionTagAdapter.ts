import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {rulesFor} from './rulesProfile';
import {getPlayableCard} from './effectRegistry';
import {removeToken} from './tokens';

type Team=0|1;
type Seat=0|1|2|3;
type Counts=Record<Seat,number>;
type Zones=Record<Seat,{deck:number;hand:number}>;

export const MORPHING_JAR_ID='33508719';
export const CYBER_JAR_ID='34124316';
export type JarFlipEffect='morphing-jar'|'cyber-jar';
export type JarFlipLookup=(cardId:string)=>JarFlipEffect|undefined;
export type JarFlipEvent={activationId:string;actorSeat:Seat;sourceUid:string};
export type JarFlipPlan=JarFlipEvent&{
  actorTeam:Team;
  sourceOwnerSeat:Seat;
  sourceCardId:string;
  effect:JarFlipEffect;
  affectedSeats:[Seat,Seat];
  turn:number;
  activationCurrent:Team;
  activationPhase:TagDuel['core']['phase'];
  cursorAtActivation:number;
};
export type JarFlipSession=TagDuel&{
  jarFlipActivationIds?:string[];
  jarFlipPending?:JarFlipPlan[];
  jarFlipResolvedIds?:string[];
};
export type JarFlipChoices=Readonly<Record<string,'attack'|'set'>>;
export type JarFlipReceipt={
  visibility:'public';
  activationId:string;
  effect:JarFlipEffect;
  sourceUid:string;
  affectedSeats:[Seat,Seat];
  status:'resolved'|'deckout-pending'|'effect-negated';
  discardedCounts:Counts;
  drawnCounts:Counts;
  deckOutSeats:Seat[];
  destroyedMonsterCount:number;
  destroyedTokenCount:number;
  revealed:Array<{seat:Seat;cardIds:string[]}>;
  summonedFaceUpCounts:Counts;
  summonedFaceDownCounts:Counts;
  addedToHandCounts:Counts;
  deckShortSeats:Seat[];
};
export type JarFlipActivation={status:'triggered';state:JarFlipSession;plan:JarFlipPlan};
export type JarFlipResolution={
  status:'resolved'|'deckout-pending'|'negated'|'duplicate';
  state:JarFlipSession;
  receipt:JarFlipReceipt|null;
};

const defaultLookup:JarFlipLookup=(id)=>{
  if(id===MORPHING_JAR_ID)return 'morphing-jar';
  if(id===CYBER_JAR_ID)return 'cyber-jar';
  return undefined;
};
export function defaultJarFlipEffect(id:string):JarFlipEffect|undefined{return defaultLookup(id);}

function validSeat(value:unknown):value is Seat{
  return typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=3;
}
function validTeam(value:unknown):value is Team{return value===0||value===1;}
function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.trim().length>0&&value.length<=128&&!/[\u0000-\u001f]/.test(value);
}
function physicalSeat(uid:string):Seat{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('UID físico 2v2 inválido: '+uid);
  return Number(match[1]) as Seat;
}
function activeSeats(duel:TagDuel):[Seat,Seat]{
  if(!validSeat(duel.active[0])||!validSeat(duel.active[1]))throw new Error('Participantes ativos inválidos.');
  return [duel.active[0],duel.active[1]];
}
function physicalHolder(duel:TagDuel,seat:Seat){
  const team=(seat%2) as Team;
  const holder=duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
  if(!holder)throw new Error('Deck privado do participante não está disponível.');
  return holder;
}
function zeroCounts():Counts{return {0:0,1:0,2:0,3:0};}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('Efeito FLIP alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('Efeito FLIP alterou a identidade física: '+uid);
}
function zoneCounts(duel:TagDuel):Zones{
  const result={} as Zones;
  for(const seat of [0,1,2,3] as Seat[]){
    const holder=physicalHolder(duel,seat);
    result[seat]={deck:holder.deck.length,hand:holder.hand.length};
  }
  return result;
}
function assertZoneCounts(before:Zones,after:Zones,plan:JarFlipPlan,receipt:JarFlipReceipt):void{
  for(const seat of [0,1,2,3] as Seat[]){
    let expectedDeck=before[seat].deck;
    let expectedHand=before[seat].hand;
    if(plan.affectedSeats.includes(seat)){
      if(plan.effect==='morphing-jar'){
        expectedDeck-=receipt.drawnCounts[seat];
        expectedHand=receipt.drawnCounts[seat];
      }else{
        const revealed=receipt.revealed.find(item=>item.seat===seat)?.cardIds.length??0;
        expectedDeck-=revealed;
        expectedHand+=receipt.addedToHandCounts[seat];
      }
    }
    if(after[seat].deck!==expectedDeck||after[seat].hand!==expectedHand){
      throw new Error('Efeito FLIP alterou Deck/mão de um assento não autorizado: '+seat+'.');
    }
  }
}
function assertUnchangedZones(before:Zones,after:Zones):void{
  for(const seat of [0,1,2,3] as Seat[]){
    if(before[seat].deck!==after[seat].deck||before[seat].hand!==after[seat].hand){
      throw new Error('Efeito negado alterou Deck/mão do assento '+seat+'.');
    }
  }
}
function assertPrivateZones(duel:TagDuel):void{
  for(const seat of [0,1,2,3] as Seat[]){
    const holder=physicalHolder(duel,seat),prefix='m'+seat+':';
    if(holder.deck.some(card=>!card.uid.startsWith(prefix))||holder.hand.some(card=>!card.uid.startsWith(prefix))){
      throw new Error('Efeito FLIP cruzou Deck/mão privado do assento '+seat+'.');
    }
  }
}
function assertPhysicalRules(duel:JarFlipSession):void{
  if(duel.mode!=='tag-classic')throw new Error('Efeito FLIP de Jar exige TagDuel clássico.');
  assertTagDuel(duel);
  const rules=rulesFor(duel.core);
  if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
    rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
    throw new Error('Perfil de regras não corresponde ao Speed RPG clássico.');
  }
  for(const player of duel.core.players){
    if(player.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');
    if(player.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');
  }
  const extraUids=new Set<string>();
  for(const player of duel.core.players)for(const card of player.extra??[])extraUids.add(card.uid);
  for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
  const counts=[0,1,2,3].map(()=>({main:0,extra:0}));
  for(const uid of inventorySnapshot(duel).keys()){
    const seat=physicalSeat(uid);
    if(extraUids.has(uid))counts[seat].extra++;
    else counts[seat].main++;
  }
  for(let seat=0;seat<4;seat++){
    if(counts[seat].main<rules.mainDeckMin||counts[seat].main>rules.mainDeckMax){
      throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    }
    if(counts[seat].extra>rules.extraDeckMax)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
  }
  assertPrivateZones(duel);
  // A Field Zone permanece separada das três Spell/Trap Zones.
}
function findSource(
  duel:JarFlipSession,actorSeat:Seat,sourceUid:string,lookup:JarFlipLookup
):{ownerSeat:Seat;cardId:string;effect:JarFlipEffect}{
  const team=(actorSeat%2) as Team;
  const source=duel.core.players[team].monsters.find(card=>card.uid===sourceUid);
  if(!source)throw new Error('Monstro FLIP não está no campo da equipe controladora.');
  if(source.faceUp!==true)throw new Error('Efeito FLIP exige que o monstro esteja com a face para cima.');
  const effect=lookup(source.id);
  if(effect!=='morphing-jar'&&effect!=='cyber-jar')throw new Error('Monstro não pertence à família Jar admitida.');
  return {ownerSeat:physicalSeat(source.uid),cardId:source.id,effect};
}
function samePlan(a:JarFlipPlan,b:JarFlipPlan):boolean{
  return a.activationId===b.activationId&&a.actorSeat===b.actorSeat&&a.sourceUid===b.sourceUid&&
    a.actorTeam===b.actorTeam&&a.sourceOwnerSeat===b.sourceOwnerSeat&&a.sourceCardId===b.sourceCardId&&
    a.effect===b.effect&&JSON.stringify(a.affectedSeats)===JSON.stringify(b.affectedSeats)&&
    a.turn===b.turn&&a.activationCurrent===b.activationCurrent&&a.activationPhase===b.activationPhase&&
    a.cursorAtActivation===b.cursorAtActivation;
}
function assertPlanBase(input:JarFlipSession,plan:JarFlipPlan):void{
  if(!plan||!validActivationId(plan.activationId)||!validSeat(plan.actorSeat)||
    !validTeam(plan.actorTeam)||plan.actorTeam!==plan.actorSeat%2||
    !validSeat(plan.sourceOwnerSeat)||plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||
    typeof plan.sourceCardId!=='string'||!plan.sourceCardId||
    (plan.effect!=='morphing-jar'&&plan.effect!=='cyber-jar')||
    !Array.isArray(plan.affectedSeats)||plan.affectedSeats.length!==2||
    !validSeat(plan.affectedSeats[0])||!validSeat(plan.affectedSeats[1])||
    !Number.isInteger(plan.turn)||plan.turn!==input.core.turn||
    !validTeam(plan.activationCurrent)||!Number.isInteger(plan.cursorAtActivation)||
    plan.cursorAtActivation<0||plan.cursorAtActivation>3||
    !['main','battle','response','choice','discard','finished'].includes(plan.activationPhase)||
    !(input.jarFlipActivationIds??[]).includes(plan.activationId)){
    throw new Error('Plano FLIP Jar obsoleto ou inválido.');
  }
  const stored=(input.jarFlipPending??[]).find(item=>item.activationId===plan.activationId);
  if(!stored||!samePlan(stored,plan))throw new Error('Plano FLIP Jar não corresponde ao registro imutável do gatilho.');
  const active=activeSeats(input);
  if(active[0]!==plan.affectedSeats[0]||active[1]!==plan.affectedSeats[1]||
    input.active[plan.actorTeam]!==plan.actorSeat||input.cursor!==plan.cursorAtActivation||
    input.core.current!==plan.activationCurrent){
    throw new Error('Rotação 2v2 mudou antes da resolução do efeito FLIP Jar.');
  }
}
function eligibleForCyberJar(cardId:string):boolean{
  const info=getPlayableCard(cardId);
  return !!info&&info.kind==='monster'&&typeof info.level==='number'&&info.level<=4&&
    info.monsterType!=='ritual'&&!info.fusion;
}
function destroyAllMonsters(duel:JarFlipSession):{destroyedMonsterCount:number;destroyedTokenCount:number}{
  let destroyedMonsterCount=0,destroyedTokenCount=0;
  for(const team of [0,1] as Team[]){
    for(const monster of [...duel.core.players[team].monsters]){
      destroyedMonsterCount++;
      if(monster.entityKind==='token'){
        if(!removeToken(duel.core,monster.uid,'destroy'))throw new Error('Ficha sem registro de criação.');
        destroyedTokenCount++;
        continue;
      }
      duel.core.players[team].monsters=duel.core.players[team].monsters.filter(card=>card.uid!==monster.uid);
      const ownerTeam=(physicalSeat(monster.uid)%2) as Team;
      duel.core.players[ownerTeam].grave.push({
        uid:monster.uid,id:monster.id,
        ...(monster.properlySummoned?{properlySummoned:true}:{})
      });
    }
  }
  const fieldUids=new Set(duel.core.players.flatMap(player=>player.monsters.map(monster=>monster.uid)));
  for(const team of [0,1] as Team[]){
    const player=duel.core.players[team];
    const orphaned=player.backrow.filter(card=>card.equippedTo!==undefined&&!fieldUids.has(card.equippedTo));
    player.backrow=player.backrow.filter(card=>!orphaned.some(item=>item.uid===card.uid));
    for(const card of orphaned){
      const ownerTeam=(physicalSeat(card.uid)%2) as Team;
      duel.core.players[ownerTeam].grave.push({uid:card.uid,id:card.id});
    }
  }
  return {destroyedMonsterCount,destroyedTokenCount};
}
function baseReceipt(plan:JarFlipPlan,status:JarFlipReceipt['status']):JarFlipReceipt{
  return {
    visibility:'public',activationId:plan.activationId,effect:plan.effect,sourceUid:plan.sourceUid,
    affectedSeats:[...plan.affectedSeats],status,discardedCounts:zeroCounts(),drawnCounts:zeroCounts(),
    deckOutSeats:[],destroyedMonsterCount:0,destroyedTokenCount:0,revealed:[],
    summonedFaceUpCounts:zeroCounts(),summonedFaceDownCounts:zeroCounts(),addedToHandCounts:zeroCounts(),
    deckShortSeats:[]
  };
}

/** Registers a face-up FLIP event. The host must call it only after the engine confirms the flip. */
export function activateJarFlip(
  input:JarFlipSession,event:JarFlipEvent,lookup:JarFlipLookup=defaultLookup
):JarFlipActivation{
  assertPhysicalRules(input);
  if(input.core.phase==='finished')throw new Error('Duelo encerrado.');
  if(!event||!validActivationId(event.activationId)||!validSeat(event.actorSeat)||
    typeof event.sourceUid!=='string'||!event.sourceUid){
    throw new Error('Evento FLIP Jar inválido.');
  }
  const actorTeam=(event.actorSeat%2) as Team;
  if(input.active[actorTeam]!==event.actorSeat)throw new Error('Somente o participante ativo da equipe pode registrar o gatilho FLIP.');
  if((input.jarFlipActivationIds??[]).includes(event.activationId))throw new Error('Este gatilho FLIP Jar já foi registrado.');
  const source=findSource(input,event.actorSeat,event.sourceUid,lookup);
  const affected=Object.freeze(activeSeats(input)) as unknown as [Seat,Seat];
  const plan:JarFlipPlan=Object.freeze({
    ...event,actorTeam,sourceOwnerSeat:source.ownerSeat,sourceCardId:source.cardId,effect:source.effect,
    affectedSeats:affected,turn:input.core.turn,activationCurrent:input.core.current as Team,
    activationPhase:input.core.phase,cursorAtActivation:input.cursor
  });
  const next=structuredClone(input) as JarFlipSession;
  next.jarFlipActivationIds=[...(next.jarFlipActivationIds??[]),event.activationId];
  next.jarFlipPending=[...(next.jarFlipPending??[]),plan];
  assertPhysicalRules(next);
  return {status:'triggered',state:next,plan};
}

/** Resolves the two active team representatives; inactive partners retain private hands and Decks. */
export function resolveJarFlip(
  input:JarFlipSession,plan:JarFlipPlan,choices:JarFlipChoices={},effectNegated=false
):JarFlipResolution{
  assertPhysicalRules(input);
  if(plan&&typeof plan.activationId==='string'&&(input.jarFlipResolvedIds??[]).includes(plan.activationId)){
    return {status:'duplicate',state:input,receipt:null};
  }
  assertPlanBase(input,plan);
  if(typeof effectNegated!=='boolean'||!choices||typeof choices!=='object'||Array.isArray(choices)){
    throw new Error('Escolhas ou estado de negação FLIP Jar inválidos.');
  }
  if(effectNegated&&Object.keys(choices).length)throw new Error('Efeito negado não pode conter escolhas.');
  if(plan.effect==='morphing-jar'&&Object.keys(choices).length)throw new Error('Morphing Jar não recebe escolhas de posição.');
  const before=inventorySnapshot(input),beforeZones=zoneCounts(input);
  const logBefore=JSON.stringify(input.core.log),randomBefore=input.core.random?.counter??0;
  const next=structuredClone(input) as JarFlipSession;
  let receipt=baseReceipt(plan,effectNegated?'effect-negated':'resolved');

  if(!effectNegated&&plan.effect==='morphing-jar'){
    for(const seat of plan.affectedSeats){
      const holder=physicalHolder(next,seat),discarded=holder.hand.splice(0,holder.hand.length);
      next.core.players[seat%2].grave.push(...discarded);
      receipt.discardedCounts[seat]=discarded.length;
      const drawCount=Math.min(5,holder.deck.length);
      const drawn=holder.deck.splice(0,drawCount);
      holder.hand.push(...drawn);
      receipt.drawnCounts[seat]=drawCount;
      if(drawCount<5)receipt.deckOutSeats.push(seat);
    }
    if(receipt.deckOutSeats.length)receipt.status='deckout-pending';
  }

  if(!effectNegated&&plan.effect==='cyber-jar'){
    const destroyed=destroyAllMonsters(next);
    receipt.destroyedMonsterCount=destroyed.destroyedMonsterCount;
    receipt.destroyedTokenCount=destroyed.destroyedTokenCount;
    const revealedBySeat=plan.affectedSeats.map(seat=>{
      const holder=physicalHolder(next,seat),count=Math.min(5,holder.deck.length);
      if(count<5)receipt.deckShortSeats.push(seat);
      return {seat,cards:holder.deck.splice(0,count)};
    });
    const usedChoices=new Set<string>();
    for(const entry of revealedBySeat){
      const seat=entry.seat,team=(seat%2) as Team,holder=physicalHolder(next,seat);
      receipt.revealed.push({seat,cardIds:entry.cards.map(card=>card.id)});
      for(const card of entry.cards){
        const canSummon=eligibleForCyberJar(card.id)&&next.core.players[team].monsters.length<3;
        if(canSummon){
          const choice=choices[card.uid];
          if(choice!=='attack'&&choice!=='set'){
            throw new Error('Escolha Ataque/Defesa Baixada obrigatória para cada monstro invocável do Cyber Jar.');
          }
          usedChoices.add(card.uid);
          next.core.players[team].monsters.push({
            ...card,position:choice==='attack'?'atk':'def',faceUp:choice==='attack',
            entered:next.core.turn,changed:next.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:team
          });
          if(choice==='attack')receipt.summonedFaceUpCounts[seat]++;
          else receipt.summonedFaceDownCounts[seat]++;
        }else{
          holder.hand.push(card);
          receipt.addedToHandCounts[seat]++;
        }
      }
    }
    for(const uid of Object.keys(choices)){
      if(!usedChoices.has(uid))throw new Error('Escolha Cyber Jar contém UID que não pode ser Invocado neste efeito.');
    }
  }

  next.jarFlipPending=(next.jarFlipPending??[]).filter(item=>item.activationId!==plan.activationId);
  next.jarFlipResolvedIds=[...(next.jarFlipResolvedIds??[]),plan.activationId];
  assertSameInventory(before,next);
  if(effectNegated)assertUnchangedZones(beforeZones,zoneCounts(next));
  else assertZoneCounts(beforeZones,zoneCounts(next),plan,receipt);
  assertPhysicalRules(next);
  if(JSON.stringify(next.core.log)!==logBefore)throw new Error('Efeito FLIP Jar publicou informação privada no log.');
  if((next.core.random?.counter??0)!==randomBefore)throw new Error('Efeito FLIP Jar consumiu aleatoriedade sem necessidade.');
  return {
    status:receipt.status==='effect-negated'?'negated':receipt.status==='deckout-pending'?'deckout-pending':'resolved',
    state:next,receipt
  };
}
