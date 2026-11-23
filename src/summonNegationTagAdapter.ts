import type {DuelState} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const SOLEMN_JUDGMENT_ID='41420027';
export const HORN_OF_HEAVEN_ID='98069388';

type Team=0|1;
type CardKind='spell'|'trap'|'monster';
export type SummonNegationLookup=(id:string)=>{kind:CardKind}|undefined;
export type SummonNegationAction={kind:'trap';card:string;target:''};
type PendingSummonKind='summon'|'flip'|'specialSummon';
type PendingActivationKind='spell'|'field'|'fusion';
type ResponseRef=
 |{kind:'pending-summon';pendingKind:PendingSummonKind;actor:Team;card:string;id:string}
 |{kind:'pending-activation';pendingKind:PendingActivationKind;actor:Team;card:string;id:string}
 |{kind:'chain-activation';actor:Team;card:string;id:string};
type Activation={
 activationId:string;
 sourceUid:string;
 sourceId:string;
 sourceOwnerSeat:number;
 controllerTeam:Team;
 controllerSeat:number;
 turn:number;
 response:ResponseRef;
 paidLp:number;
 tributePaid:boolean;
};
export type SummonNegationSession={
 duel:TagDuel;
 pending:Record<string,Activation>;
 resolved:string[];
};
export type SummonNegationResolution={
 activationId:string;
 cardId:string;
 sourceActivationNegated:boolean;
 effectApplied:boolean;
 targetActivationNegated:boolean;
 targetDestroyed:boolean;
 targetUid:string;
 paidLp:number;
 tributePaid:boolean;
 sourceSentToGrave:boolean;
};

function physicalSeat(uid:string):number{
 const m=/^m([0-3]):/.exec(uid);
 if(!m)throw new Error('UID físico 2v2 inválido: '+uid);
 return Number(m[1]);
}
function assertClassicShape(d:TagDuel):void{
 if(!d||d.mode!=='tag-classic'||!d.core||!Array.isArray(d.core.players)||d.core.players.length!==2||
   !Array.isArray(d.active)||d.active.length!==2||!Array.isArray(d.members)||d.members.length!==4||
   !Array.isArray(d.core.chain)||!d.reserves)throw new Error('Estado TagDuel clássico inválido.');
}
function inventorySnapshot(d:TagDuel):Map<string,string>{
 const out=new Map<string,string>();
 for(const c of tagInventory(d).filter(x=>x.entityKind!=='token')){
  if(out.has(c.uid))throw new Error('UID físico duplicado: '+c.uid);
  physicalSeat(c.uid);out.set(c.uid,c.id);
 }
 return out;
}
function handSnapshot(d:TagDuel):string[]{
 const out:string[]=[];
 for(const p of d.core.players)for(const c of p.hand)out.push(c.uid);
 for(const h of Object.values(d.reserves))for(const c of h.hand)out.push(c.uid);
 return out.sort();
}
function assertHandsUnchanged(before:string[],d:TagDuel):void{
 if(JSON.stringify(before)!==JSON.stringify(handSnapshot(d)))throw new Error('A negação alterou uma mão privada.');
}
function assertSameInventory(before:Map<string,string>,d:TagDuel):void{
 const after=inventorySnapshot(d);
 if(after.size!==before.size)throw new Error('A negação alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A negação alterou a identidade física: '+uid);
}
function assertPhysicalRules(d:TagDuel):void{
 assertClassicShape(d);
 const all=inventorySnapshot(d),extra=new Set<string>(),extras=[0,0,0,0];
 for(let team=0;team<2;team++){
  const p=d.core.players[team];
  if(p.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');
  if(p.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');
  for(const c of p.extra??[]){extra.add(c.uid);extras[physicalSeat(c.uid)]++;}
 }
 for(const [seat,h] of Object.entries(d.reserves)){
  for(const c of h.extra??[]){extra.add(c.uid);extras[physicalSeat(c.uid)]++;}
  if(!/^\d$/.test(seat))throw new Error('Assento físico de reserva inválido.');
 }
 const main=[0,0,0,0];
 for(const uid of all.keys())if(!extra.has(uid))main[physicalSeat(uid)]++;
 for(let seat=0;seat<4;seat++){
  if(main[seat]<20||main[seat]>30)throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
  if(extras[seat]>5)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A mão é limitada a seis na End Phase; este adapter não executa descarte de mão.
}
function holderForSeat(d:TagDuel,seat:number){
 const team=(seat%2) as Team;
 return d.active[team]===seat?d.core.players[team]:d.reserves[String(seat)];
}
function sourceCard(d:TagDuel,team:Team,uid:string){
 return d.core.players[team].backrow.find(c=>c.uid===uid);
}
function monsterOnField(core:DuelState,team:Team,uid:string){
 return core.players[team].monsters.find(m=>m.uid===uid);
}
function cardOnField(core:DuelState,team:Team,uid:string){
 const p=core.players[team];
 const back=p.backrow.find(c=>c.uid===uid&&c.faceUp);
 if(back)return back;
 return p.field?.uid===uid&&p.field.faceUp?p.field:undefined;
}
function responseFor(id:string,team:Team,core:DuelState,lookup:SummonNegationLookup):ResponseRef|undefined{
 const opponent=(1-team) as Team,last=core.chain.at(-1);
 if(last){
  if(id!==SOLEMN_JUDGMENT_ID||last.actor!==opponent||last.negated)return;
  const kind=lookup(last.id)?.kind;
  if(kind!=='spell'&&kind!=='trap')return;
  const activated=cardOnField(core,opponent,last.card);
  if(!activated||activated.id!==last.id)return;
  return {kind:'chain-activation',actor:last.actor as Team,card:last.card,id:last.id};
 }
 const pending=core.pending;
 if(pending.kind==='summon'||pending.kind==='flip'||pending.kind==='specialSummon'){
  if(pending.actor!==opponent)return;
  const m=monsterOnField(core,opponent,pending.card);
  if(!m||lookup(m.id)?.kind!=='monster'||(pending.id&&pending.id!==m.id))return;
  if(id===HORN_OF_HEAVEN_ID&&pending.kind==='flip')return;
  return {kind:'pending-summon',pendingKind:pending.kind,actor:pending.actor as Team,card:pending.card,id:m.id};
 }
 if(id!==SOLEMN_JUDGMENT_ID||pending.actor!==opponent||
   (pending.kind!=='spell'&&pending.kind!=='field'&&pending.kind!=='fusion'))return;
 const activated=cardOnField(core,opponent,pending.card);
 if(!activated)return;
 const kind=lookup(activated.id)?.kind;
 if(kind!=='spell'&&kind!=='trap')return;
 return {kind:'pending-activation',pendingKind:pending.kind,actor:pending.actor as Team,card:pending.card,id:activated.id};
}
function findLink(core:DuelState,r:Extract<ResponseRef,{kind:'chain-activation'}>){
 return core.chain.find(l=>l.actor===r.actor&&l.card===r.card&&l.id===r.id);
}
function removeControlledCard(core:DuelState,team:Team,uid:string){
 const p=core.players[team],i=p.backrow.findIndex(c=>c.uid===uid);
 if(i>=0)return p.backrow.splice(i,1)[0];
 if(p.field?.uid===uid){const f=p.field;p.field=null;return f;}
 return;
}
function moveCardToOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
 if(core.players.some(p=>p.grave.some(c=>c.uid===uid)))return false;
 const c=removeControlledCard(core,controller,uid);
 if(!c)return false;
 core.players[(physicalSeat(uid)%2) as Team].grave.push({uid:c.uid,id:c.id});
 return true;
}
function moveMonsterToOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
 if(core.players.some(p=>p.grave.some(c=>c.uid===uid)))return false;
 const p=core.players[controller],i=p.monsters.findIndex(m=>m.uid===uid);
 if(i<0)return false;
 const [m]=p.monsters.splice(i,1);
 core.players[(physicalSeat(uid)%2) as Team].grave.push({uid:m.uid,id:m.id});
 return true;
}
function targetIsCurrent(core:DuelState,r:ResponseRef):boolean{
 if(r.kind==='pending-summon'){
  const p=core.pending;
  const m=monsterOnField(core,r.actor,r.card);
  return core.chain.length===0&&p.kind===r.pendingKind&&p.actor===r.actor&&p.card===r.card&&
   !core.pendingNegated&&(!p.id||p.id===r.id)&&!!m&&m.id===r.id;
 }
 if(r.kind==='pending-activation'){
  const p=core.pending;
  const card=cardOnField(core,r.actor,r.card);
  return core.chain.length===0&&p.kind===r.pendingKind&&p.actor===r.actor&&p.card===r.card&&
   !core.pendingNegated&&(!p.id||p.id===r.id)&&!!card&&card.id===r.id;
 }
 const target=findLink(core,r);
 const card=cardOnField(core,r.actor,r.card);
 return !!target&&core.chain.at(-1)===target&&!target.negated&&!!card&&card.id===r.id;
}
function negateTarget(core:DuelState,r:ResponseRef):{negated:boolean;destroyed:boolean}|undefined{
 if(!targetIsCurrent(core,r))return;
 if(r.kind==='pending-summon'){
  core.pendingNegated=true;
  return {negated:true,destroyed:moveMonsterToOwnerGrave(core,r.actor,r.card)};
 }
 if(r.kind==='pending-activation'){
  core.pendingNegated=true;
  return {negated:true,destroyed:moveCardToOwnerGrave(core,r.actor,r.card)};
 }
 const target=findLink(core,r);
 if(!target)return;
 target.negated=true;
 return {negated:true,destroyed:moveCardToOwnerGrave(core,r.actor,r.card)};
}

export function createSummonNegationSession(duel:TagDuel):SummonNegationSession{
 assertPhysicalRules(duel);
 return {duel:structuredClone(duel),pending:{},resolved:[]};
}
export function summonNegationActions(duel:TagDuel,lookup:SummonNegationLookup):SummonNegationAction[]{
 assertClassicShape(duel);
 const c=duel.core;
 if(c.phase!=='response'||(c.priority!==0&&c.priority!==1))return [];
 const team=c.priority as Team,seat=duel.active[team];
 if(!Number.isSafeInteger(seat)||duel.members[seat]?.team!==team)return [];
 return c.players[team].backrow
  .filter(x=>x.id===SOLEMN_JUDGMENT_ID||x.id===HORN_OF_HEAVEN_ID)
  .filter(x=>!x.faceUp&&Number.isSafeInteger(x.setTurn)&&x.setTurn<c.turn)
  .filter(x=>x.id!==SOLEMN_JUDGMENT_ID||c.players[team].lp>1)
  .filter(x=>x.id!==HORN_OF_HEAVEN_ID||c.players[team].monsters.length>0)
  .filter(x=>!!responseFor(x.id,team,c,lookup))
  .map(x=>({kind:'trap',card:x.uid,target:''}));
}
export function activateSummonNegation(
 input:SummonNegationSession,
 sourceUid:string,
 activationId:string,
 lookup:SummonNegationLookup,
 tributeUid?:string
):SummonNegationSession{
 if(!activationId||input.pending[activationId]||input.resolved.includes(activationId))throw new Error('ID de ativação ausente ou duplicado.');
 assertPhysicalRules(input.duel);
 const team=input.duel.core.priority;
 if(team!==0&&team!==1)throw new Error('Equipe sem prioridade de resposta.');
 const seat=input.duel.active[team];
 if(!summonNegationActions(input.duel,lookup).some(a=>a.card===sourceUid))throw new Error('A Counter Trap não está legal para a janela atual.');
 const source=sourceCard(input.duel,team as Team,sourceUid);
 if(!source||source.faceUp||source.setTurn>=input.duel.core.turn)throw new Error('Counter Trap não está Set e liberada para ativação.');
 const response=responseFor(source.id,team as Team,input.duel.core,lookup);
 if(!response)throw new Error('A Counter Trap não corresponde à Invocação/ativação atual.');
 const owner=physicalSeat(sourceUid);
 if(owner%2!==team)throw new Error('A Counter Trap não pertence fisicamente à equipe controladora.');
 if(source.id===SOLEMN_JUDGMENT_ID&&tributeUid)throw new Error('Solemn Judgment não exige Tributo.');
 if(source.id===HORN_OF_HEAVEN_ID&&!tributeUid)throw new Error('Horn of Heaven exige Tributar um monstro.');
 const before=inventorySnapshot(input.duel),hands=handSnapshot(input.duel),next=structuredClone(input);
 let paidLp=0,tributePaid=false;
 if(source.id===SOLEMN_JUDGMENT_ID){
  const lp=next.duel.core.players[team].lp;
  if(lp<=1)throw new Error('PV insuficientes para pagar metade dos LP.');
  paidLp=Math.ceil(lp/2);
  next.duel.core.players[team].lp=lp-paidLp;
 }else if(source.id===HORN_OF_HEAVEN_ID&&tributeUid){
  const p=next.duel.core.players[team],i=p.monsters.findIndex(m=>m.uid===tributeUid);
  if(i<0)throw new Error('O Tributo deve ser um monstro no campo compartilhado da equipe.');
  const [m]=p.monsters.splice(i,1);
  next.duel.core.players[(physicalSeat(m.uid)%2) as Team].grave.push({uid:m.uid,id:m.id});
  tributePaid=true;
 }
 const nsource=sourceCard(next.duel,team as Team,sourceUid);
 if(!nsource)throw new Error('A Counter Trap saiu do campo antes do registro.');
 nsource.faceUp=true;
 next.duel.core.chain.push({actor:team,card:sourceUid,id:source.id,target:''});
 next.duel.core.priority=1-team;
 next.duel.core.passes=0;
 next.pending[activationId]={
  activationId,sourceUid,sourceId:source.id,sourceOwnerSeat:owner,
  controllerTeam:team as Team,controllerSeat:seat,turn:next.duel.core.turn,response,
  paidLp,tributePaid
 };
 assertSameInventory(before,next.duel);
 assertHandsUnchanged(hands,next.duel);
 assertPhysicalRules(next.duel);
 return next;
}
export function resolveSummonNegation(
 input:SummonNegationSession,
 activationId:string,
 lookup:SummonNegationLookup,
 options:{sourceActivationNegated?:boolean}={}
):{session:SummonNegationSession;result:SummonNegationResolution}{
 const a=input.pending[activationId];
 if(!a||input.resolved.includes(activationId))throw new Error('Ativação de Counter Trap ausente ou já resolvida.');
 assertPhysicalRules(input.duel);
 const before=inventorySnapshot(input.duel),hands=handSnapshot(input.duel),next=structuredClone(input),core=next.duel.core;
 const own=core.chain.findIndex(l=>l.actor===a.controllerTeam&&l.card===a.sourceUid&&l.id===a.sourceId);
 if(own!==core.chain.length-1)throw new Error('A Counter Trap só pode resolver no topo da corrente.');
 core.chain.pop();
 const targetKind=lookup(a.response.id)?.kind;
 const expectedKind=a.response.kind==='pending-summon'?'monster':targetKind==='spell'||targetKind==='trap'?targetKind:undefined;
 const targetAvailable=targetIsCurrent(core,a.response)&&!!expectedKind;
 let targetActivationNegated=false,targetDestroyed=false,effectApplied=false;
 if(!options.sourceActivationNegated&&targetAvailable){
  const result=negateTarget(core,a.response);
  targetActivationNegated=!!result?.negated;
  targetDestroyed=!!result?.destroyed;
  effectApplied=targetActivationNegated;
 }
 const sourceSentToGrave=moveCardToOwnerGrave(core,a.controllerTeam,a.sourceUid);
 delete next.pending[activationId];
 next.resolved.push(activationId);
 assertSameInventory(before,next.duel);
 assertHandsUnchanged(hands,next.duel);
 assertPhysicalRules(next.duel);
 return {session:next,result:{
  activationId,cardId:a.sourceId,sourceActivationNegated:!!options.sourceActivationNegated,
  effectApplied,targetActivationNegated,targetDestroyed,targetUid:a.response.card,
  paidLp:a.paidLp,tributePaid:a.tributePaid,sourceSentToGrave
 }};
}
