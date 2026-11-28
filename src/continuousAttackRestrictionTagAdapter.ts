import type {DuelState,Monster} from './duelEngine';
import {getPlayableCard} from './effectRegistry';
import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const THE_DARK_DOOR_ID='30606547';
export const LEVEL_LIMIT_AREA_B_ID='03136426';

type Team=0|1;
type AttackPending=Extract<DuelState['pending'],{kind:'attack'}>;
export type DarkDoorBattlePhaseSession={
  duel:TagDuel;
  team:Team;
  phaseId:string;
  attackedMonsterUids:string[];
};

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('UID físico 2v2 inválido: '+uid);
  return Number(match[1]);
}
function assertClassicShape(duel:TagDuel):void{
  if(!duel||duel.mode!=='tag-classic'||!duel.core||
    !Array.isArray(duel.core.players)||duel.core.players.length!==2||
    !Array.isArray(duel.active)||duel.active.length!==2||
    !Array.isArray(duel.members)||duel.members.length!==4||
    !Array.isArray(duel.core.chain)||!duel.reserves){
    throw new Error('Estado TagDuel clássico inválido.');
  }
}
function allPhysicalCards(duel:TagDuel){
  // tagInventory delegates to duelCards, which already includes teamRotation reserves.
  return tagInventory(duel);
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of allPhysicalCards(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function handSnapshot(duel:TagDuel):string[]{
  const result:string[]=[];
  for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
  for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
  return result.sort();
}
function assertHandsUnchanged(before:string[],duel:TagDuel):void{
  if(JSON.stringify(before)!==JSON.stringify(handSnapshot(duel))){
    throw new Error('A restrição contínua alterou uma mão privada.');
  }
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('A restrição contínua alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('A restrição contínua alterou a identidade física: '+uid);
  }
}
function assertPhysicalRules(duel:TagDuel):void{
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
  // Field Zone remains a separate property on each team; this adapter never
  // moves cards between zones other than the forced monster position below.
}
function monsterOnField(duel:TagDuel,team:Team,uid:string):Monster|undefined{
  return duel.core.players[team].monsters.find(monster=>monster.uid===uid);
}
function hasFaceUpContinuous(duel:TagDuel,id:string):boolean{
  return duel.core.players.some(player=>player.backrow.some(card=>card.id===id&&card.faceUp));
}
function cardLevel(monster:Monster):number{
  return Number(getPlayableCard(monster.id)?.level??0);
}

export function createDarkDoorBattlePhaseSession(
  duel:TagDuel,
  team:Team,
  phaseId:string
):DarkDoorBattlePhaseSession{
  assertPhysicalRules(duel);
  if((team!==0&&team!==1)||duel.core.current!==team){
    throw new Error('A equipe não controla a Battle Phase informada.');
  }
  if(typeof phaseId!=='string'||!phaseId.trim()){
    throw new Error('ID da Battle Phase ausente.');
  }
  return {duel:structuredClone(duel),team,phaseId,attackedMonsterUids:[]};
}

/** The Dark Door is per Battle Phase: one distinct monster per team may attack.
 * The same physical monster may attack again; a new session opens a new phase. */
export function darkDoorActive(duel:TagDuel):boolean{
  assertPhysicalRules(duel);
  return hasFaceUpContinuous(duel,THE_DARK_DOOR_ID);
}
export function darkDoorAllowsAttack(
  session:DarkDoorBattlePhaseSession,
  attackerUid:string
):boolean{
  assertPhysicalRules(session.duel);
  if(session.duel.core.current!==session.team)return false;
  const attacker=monsterOnField(session.duel,session.team,attackerUid);
  if(!attacker||!attacker.faceUp||attacker.position!=='atk')return false;
  if(!darkDoorActive(session.duel))return true;
  const distinct=[...new Set(session.attackedMonsterUids)];
  return distinct.length===0||(distinct.length===1&&distinct[0]===attackerUid);
}

/** Call for every declared attack in the phase, even if The Dark Door is not
 * face-up yet. This preserves earlier attackers if the Continuous Spell is
 * activated later in the same Battle Phase. */
export function recordDarkDoorAttack(
  input:DarkDoorBattlePhaseSession,
  attackerUid:string
):DarkDoorBattlePhaseSession{
  assertPhysicalRules(input.duel);
  const core=input.duel.core,pending=core.pending as AttackPending;
  if(core.current!==input.team||core.phase!=='response'||pending.kind!=='attack'||
    pending.stage!=='declare'||pending.actor!==input.team||pending.card!==attackerUid||
    core.pendingNegated||pending.cancelled||pending.endBattle||core.damageStep){
    throw new Error('Não existe declaração de ataque válida para registrar nesta Battle Phase.');
  }
  if(!darkDoorAllowsAttack(input,attackerUid)){
    throw new Error('The Dark Door permite apenas o monstro que já declarou o primeiro ataque.');
  }
  const next=structuredClone(input);
  if(!next.attackedMonsterUids.includes(attackerUid))next.attackedMonsterUids.push(attackerUid);
  return next;
}

export function levelLimitAreaBActive(duel:TagDuel):boolean{
  assertPhysicalRules(duel);
  return hasFaceUpContinuous(duel,LEVEL_LIMIT_AREA_B_ID);
}
export function levelLimitAreaBChanges(duel:TagDuel):string[]{
  if(!levelLimitAreaBActive(duel))return [];
  const changed:string[]=[];
  for(const player of duel.core.players)for(const monster of player.monsters){
    if(monster.faceUp&&cardLevel(monster)>=4&&monster.position!=='def')changed.push(monster.uid);
  }
  return changed;
}

/** Applies the Continuous Spell to both teams. Face-down monsters are ignored
 * until they are revealed; removing the Spell does not restore old positions. */
export function enforceLevelLimitAreaB(
  input:TagDuel
):{duel:TagDuel;changedUids:string[]}{
  assertPhysicalRules(input);
  const before=inventorySnapshot(input),hands=handSnapshot(input);
  const changedUids=levelLimitAreaBChanges(input),changed=new Set(changedUids);
  const next=structuredClone(input);
  for(const player of next.core.players)for(const monster of player.monsters){
    if(changed.has(monster.uid))monster.position='def';
  }
  assertSameInventory(before,next);
  assertHandsUnchanged(hands,next);
  assertPhysicalRules(next);
  return {duel:next,changedUids};
}
