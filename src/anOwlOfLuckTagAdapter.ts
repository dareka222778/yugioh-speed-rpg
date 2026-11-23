import type {Card} from './cardCatalog';
import type {TagDuel} from './tagDuel';
import {getPlayableCard} from './effectRegistry';

export const AN_OWL_OF_LUCK_ID='23927567';
export const NECROVALLEY_ID='47355498';

export type AnOwlFlipEvent=Readonly<{
  kind:'flip';
  sourceUid:string;
  turn:number;
  previousFaceUp:false;
  faceUp:true;
}>;
export type AnOwlDestination='top'|'hand';
export type AnOwlCardLookup=(id:string)=>Pick<Card,'kind'|'field'>|undefined;
export type AnOwlTarget=Readonly<{uid:string;id:string}>;
export type AnOwlResolution=
  |Readonly<{status:'no-target';state:TagDuel;destination:null;selectedUid:null;necrovalleyPresent:boolean}>
  |Readonly<{status:'resolved';state:TagDuel;destination:AnOwlDestination;selectedUid:string;necrovalleyPresent:boolean}>;

type PhysicalZones={deck:{uid:string;id:string}[];hand:{uid:string;id:string}[]};

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('An Owl of Luck sem proprietário físico válido.');
  return Number(match[1]);
}

function validateSource(state:TagDuel,event:AnOwlFlipEvent,sourceUid:string){
  if(!state||state.mode!=='tag-classic'||!state.core?.teamRotation||!Array.isArray(state.active)||state.active.length!==2||!Array.isArray(state.members)||state.members.length!==4){
    throw new Error('An Owl of Luck exige um estado TagDuel clássico válido.');
  }
  if(!event||event.kind!=='flip'||event.sourceUid!==sourceUid||event.turn!==state.core.turn||event.previousFaceUp!==false||event.faceUp!==true){
    throw new Error('Evento FLIP de An Owl of Luck ausente, obsoleto ou incompatível.');
  }
  const seat=physicalSeat(sourceUid);
  if(!state.members[seat])throw new Error('Proprietário físico de An Owl of Luck inexistente.');
  const matches=state.core.players.flatMap((player,team)=>player.monsters.filter(monster=>monster.uid===sourceUid).map(monster=>({monster,team})));
  if(matches.length!==1)throw new Error('An Owl of Luck precisa estar em uma única Zona de Monstros.');
  const {monster,team}=matches[0];
  if(monster.id!==AN_OWL_OF_LUCK_ID||monster.faceUp!==true)throw new Error('An Owl of Luck precisa estar face-up após o evento FLIP.');
  if(seat%2!==team)throw new Error('An Owl of Luck não pertence fisicamente à equipe controladora.');
  if(state.active[team]!==seat&&!state.reserves?.[seat])throw new Error('Deck/mão do proprietário físico inativo não foi preservado.');
  return {seat,team};
}

function physicalZones(state:TagDuel,seat:number):PhysicalZones{
  const team=seat%2;
  if(state.active[team]===seat)return state.core.players[team] as PhysicalZones;
  const reserve=state.reserves[String(seat)];
  if(!reserve)throw new Error('Reserva física de An Owl of Luck ausente.');
  return reserve as PhysicalZones;
}

function fieldSpell(card:Pick<Card,'kind'|'field'>|undefined):boolean{
  return card?.kind==='spell'&&card.field===true;
}

function necrovalleyPresent(state:TagDuel):boolean{
  return state.core.players.some(player=>player.field?.id===NECROVALLEY_ID&&player.field.faceUp===true);
}

function inventorySnapshot(state:TagDuel):string{
  const cards:{uid:string;id:string}[]=[];
  const add=(rows:readonly {uid:string;id:string}[]|undefined)=>{for(const row of rows??[])cards.push({uid:row.uid,id:row.id});};
  for(const player of state.core.players){
    add(player.deck);add(player.hand);add(player.monsters);add(player.backrow);add(player.grave);add(player.extra);add(player.banished);
    if(player.field)add([player.field]);
  }
  for(const reserve of Object.values(state.reserves??{})){add(reserve.deck);add(reserve.hand);add(reserve.extra);}
  cards.sort((a,b)=>a.uid.localeCompare(b.uid)||a.id.localeCompare(b.id));
  if(new Set(cards.map(card=>card.uid)).size!==cards.length)throw new Error('Inventário físico duplicado antes/depois de An Owl of Luck.');
  return JSON.stringify(cards);
}

/** Field Spell choices are read from the physical owner's Deck, including a reserve seat. */
export function anOwlOfLuckTargets(
  state:TagDuel,
  event:AnOwlFlipEvent,
  sourceUid:string,
  lookup:AnOwlCardLookup=getPlayableCard
):AnOwlTarget[]{
  const {seat}=validateSource(state,event,sourceUid);
  return physicalZones(state,seat).deck.filter(ref=>fieldSpell(lookup(ref.id))).map(ref=>({uid:ref.uid,id:ref.id}));
}

/**
 * Resolves the FLIP effect without mutating the input. The selected physical card
 * is put at index 0 (the draw engine's top-of-deck position), or returned to the
 * same physical seat's hand only if Necrovalley is face-up at resolution.
 */
export function resolveAnOwlOfLuck(
  input:TagDuel,
  event:AnOwlFlipEvent,
  sourceUid:string,
  selectedUid:string|undefined,
  destination:AnOwlDestination='top',
  lookup:AnOwlCardLookup=getPlayableCard
):AnOwlResolution{
  const {seat}=validateSource(input,event,sourceUid);
  const targets=anOwlOfLuckTargets(input,event,sourceUid,lookup);
  const hasNecrovalley=necrovalleyPresent(input);
  if(!targets.length){
    if(selectedUid!==undefined)throw new Error('An Owl of Luck não possui Field Spell elegível no Deck físico.');
    return {status:'no-target',state:structuredClone(input),destination:null,selectedUid:null,necrovalleyPresent:hasNecrovalley};
  }
  if(!selectedUid)throw new Error('Escolha um Field Spell do Deck físico.');
  if(destination!=='top'&&destination!=='hand')throw new Error('Destino de An Owl of Luck inválido.');
  if(destination==='hand'&&!hasNecrovalley)throw new Error('An Owl of Luck só pode adicionar à mão se Necrovalley estiver face-up na resolução.');
  const target=targets.find(ref=>ref.uid===selectedUid);
  if(!target)throw new Error('Field Spell selecionado não pertence ao Deck físico do proprietário.');
  const before=inventorySnapshot(input);
  const next=structuredClone(input);
  const zones=physicalZones(next,seat);
  const index=zones.deck.findIndex(ref=>ref.uid===selectedUid&&ref.id===target.id);
  if(index<0)throw new Error('Field Spell selecionado saiu do Deck antes da resolução.');
  const [selected]=zones.deck.splice(index,1);
  if(destination==='hand')zones.hand.push(selected);
  else zones.deck.unshift(selected);
  if(next.core.teamRotation)next.core.teamRotation.reserves=next.reserves as NonNullable<TagDuel['core']['teamRotation']>['reserves'];
  if(inventorySnapshot(next)!==before)throw new Error('An Owl of Luck violou a conservação de cartas físicas.');
  return {status:'resolved',state:next,destination,selectedUid,necrovalleyPresent:hasNecrovalley};
}
