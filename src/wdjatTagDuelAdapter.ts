import {
  inspectOpponentSetCard,
  type PrivateSetInspectionResult,
  type SetCardSnapshot,
  type SetCardZone,
} from './privateSetInspection';

export const A_MAN_WITH_WDJAT_ID='51351302';
export type PhysicalSeat=0|1|2|3;
export type DuelTeam=0|1;
export type SetCardSlot={readonly zone:SetCardZone;readonly index:number};
type TagSetCard={readonly uid:string;readonly id:string;readonly faceUp:boolean;readonly position?:'atk'|'def';readonly owner?:number};
type TagSetPlayer={readonly monsters:TagSetCard[];readonly backrow:TagSetCard[];readonly field?:TagSetCard|null};
type WdjatPendingView={readonly kind:string;readonly actor:number;readonly card?:string;readonly id?:string};
type WdjatChoiceView={readonly actor:number;readonly source?:string;readonly targets?:readonly string[]};
type WdjatStandbyTaskView={readonly id:string;readonly turn:number;readonly actor:number;readonly optional:boolean};
type WdjatStandbyView={
  readonly tasks:readonly WdjatStandbyTaskView[];
  readonly active?:{readonly id:string;readonly status:'choosing'|'responding'};
};
export type TagDuelSetView={
  readonly mode:'tag-classic';
  readonly active:readonly [number,number];
  readonly core:{
    readonly current:number;readonly phase?:string;readonly turn?:number;
    readonly pending?:WdjatPendingView;readonly choice?:WdjatChoiceView;readonly standby?:WdjatStandbyView;
    readonly players:readonly [TagSetPlayer,TagSetPlayer];
  };
};
type TriggerWindow='normalSummon'|'controllerStandby';
type CardNameLookup=(id:string)=>string|undefined;
function isSeat(value:number):value is PhysicalSeat{return Number.isInteger(value)&&value>=0&&value<=3;}
function physicalSeatFromUid(uid:string):PhysicalSeat|null{const m=/^m([0-3]):/.exec(uid);return m?Number(m[1]) as PhysicalSeat:null;}
export function wdjatStandbyTaskId(sourceUid:string,turn:number):string|null{
  if(physicalSeatFromUid(sourceUid)===null||!Number.isSafeInteger(turn)||turn<1)return null;
  return `wdjat:${sourceUid}:${turn}`;
}
function context(s:TagDuelSetView,sourceUid:string,trigger:TriggerWindow):{team:DuelTeam;resolverSeat:PhysicalSeat;opponent:TagSetPlayer}|null{
  if(!s||s.mode!=='tag-classic'||!Array.isArray(s.active)||!s.core||!Array.isArray(s.core.players)||s.core.players.length!==2)return null;
  const team=s.core.current;
  if(team!==0&&team!==1)return null;
  if(trigger!=='normalSummon'&&trigger!=='controllerStandby')return null;
  const resolverSeat=s.active[team];
  if(!isSeat(resolverSeat)||resolverSeat%2!==team)return null;
  const source=s.core.players[team].monsters.find(card=>card.uid===sourceUid);
  // The monster's current team field establishes its controller. Its m0:–m3:
  // UID still records physical ownership, which may differ after control change.
  if(!source||source.id!==A_MAN_WITH_WDJAT_ID||source.faceUp!==true||physicalSeatFromUid(sourceUid)===null)return null;
  if(trigger==='normalSummon'){
    const pending=s.core.pending;
    if(!pending||pending.kind!=='summon'||pending.actor!==team||pending.card!==sourceUid||pending.id!==A_MAN_WITH_WDJAT_ID)return null;
  }else{
    const turn=s.core.turn,taskId=wdjatStandbyTaskId(sourceUid,turn??0);
    const task=taskId?s.core.standby?.tasks.find(item=>item.id===taskId):undefined;
    const active=s.core.standby?.active;
    if(!task||!active||active.id!==taskId||active.status!=='choosing'||task.turn!==turn||task.actor!==team||task.optional!==false||
      s.core.phase!=='choice'||s.core.choice?.source!=='standby'||s.core.choice.actor!==team||!s.core.choice.targets?.length)return null;
  }
  return {team,resolverSeat,opponent:s.core.players[1-team]};
}
function readSlot(player:TagSetPlayer,slot:SetCardSlot):TagSetCard|null{
  if(!slot||!Number.isSafeInteger(slot.index)||slot.index<0)return null;
  if(slot.zone==='monster')return player.monsters[slot.index]??null;
  if(slot.zone==='backrow')return player.backrow[slot.index]??null;
  if(slot.zone==='field')return slot.index===0?(player.field??null):null;
  return null;
}
/** Public-safe slot list: zone/index only, never UID, card ID, name or owner. */
export function listTagDuelSetCardSlots(s:TagDuelSetView,sourceUid:string,trigger:TriggerWindow):SetCardSlot[]{
  const ctx=context(s,sourceUid,trigger);
  if(!ctx)return [];
  const slots:SetCardSlot[]=[];
  ctx.opponent.monsters.forEach((card,index)=>{if(card.faceUp===false&&card.position==='def')slots.push({zone:'monster',index});});
  ctx.opponent.backrow.forEach((card,index)=>{if(card.faceUp===false)slots.push({zone:'backrow',index});});
  if(ctx.opponent.field&&ctx.opponent.field.faceUp===false)slots.push({zone:'field',index:0});
  return slots;
}
/** Re-read the selected slot and compare its server-held UID binding before
 * creating a private inspection result. The UID must never be put in the public
 * slot list or public Discord component label/custom ID. */
export function inspectTagDuelSetCardAtSlot(
  s:TagDuelSetView,
  sourceUid:string,
  trigger:TriggerWindow,
  slot:SetCardSlot,
  expectedUid:string,
  getCardName:CardNameLookup,
):PrivateSetInspectionResult|null{
  const ctx=context(s,sourceUid,trigger);
  if(!ctx)return null;
  const target=readSlot(ctx.opponent,slot);
  if(!target||target.uid!==expectedUid||target.faceUp!==false)return null;
  if(slot.zone==='monster'&&target.position!=='def')return null;
  const physicalOwnerSeat=physicalSeatFromUid(target.uid);
  if(physicalOwnerSeat===null)return null;
  const name=getCardName(target.id);
  if(typeof name!=='string'||!name.trim())return null;
  const snapshot:SetCardSnapshot={
    uid:target.uid,id:target.id,name,
    physicalOwnerSeat,controllerTeam:(1-ctx.team) as DuelTeam,
    zone:slot.zone,index:slot.index,faceUp:false,
    ...(slot.zone==='monster'?{position:target.position}:{}),
  };
  return inspectOpponentSetCard({triggerWindow:trigger,resolverSeat:ctx.resolverSeat,resolverTeam:ctx.team,target:snapshot});
}
