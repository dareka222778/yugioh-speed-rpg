import type {Card} from './cardCatalog';
import type {TagDuel} from './tagDuel';
import {getPlayableCard} from './effectRegistry';

export const ARSENAL_BUG_ID='42364374';
export type ArsenalBugRaceLookup=(id:string)=>Pick<Card,'kind'|'race'>|undefined;
export type ArsenalBugModifier=Readonly<{
  atk:number;
  def:number;
  otherFaceUpInsects:number;
  applies:boolean;
  reason:'no-other-insect'|'other-insect-present'|'source-face-down'|'effect-negated';
}>;

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('Arsenal Bug sem proprietário físico válido.');
  return Number(match[1]);
}

const neutral=(reason:'source-face-down'|'effect-negated'|'other-insect-present',count=0):ArsenalBugModifier=>({
  atk:0,def:0,otherFaceUpInsects:count,applies:false,reason
});

/**
 * Returns a stat delta, not an absolute stat replacement: the engine composes
 * this -1000/-1000 with Equip/Field/other modifiers after determining the
 * card's own continuous condition. The lookup may resolve dynamically changed
 * Types; the default uses the printed card metadata.
 */
export function arsenalBugModifier(
  state:TagDuel,
  sourceUid:string,
  effectNegated=false,
  lookup:ArsenalBugRaceLookup=getPlayableCard
):ArsenalBugModifier{
  if(!state||state.mode!=='tag-classic'||!Array.isArray(state.core?.players)||state.core.players.length!==2||!Array.isArray(state.members)||state.members.length!==4){
    throw new Error('Arsenal Bug exige um estado TagDuel clássico válido.');
  }
  const seat=physicalSeat(sourceUid);
  if(!state.members[seat])throw new Error('Proprietário físico de Arsenal Bug inexistente.');
  const matches=state.core.players.flatMap((player,team)=>player.monsters.filter(monster=>monster.uid===sourceUid).map(monster=>({monster,team})));
  if(matches.length!==1)throw new Error('Arsenal Bug precisa estar em uma única Zona de Monstros.');
  const {monster:source,team}=matches[0];
  if(source.id!==ARSENAL_BUG_ID)throw new Error('A origem não é Arsenal Bug.');
  if(seat%2!==team)throw new Error('Arsenal Bug não pertence fisicamente à equipe controladora.');
  if(source.faceUp!==true)return neutral('source-face-down');
  if(effectNegated)return neutral('effect-negated');

  const otherFaceUpInsects=state.core.players[team].monsters.filter(monster=>
    monster.uid!==sourceUid&&monster.faceUp===true&&
    lookup(monster.id)?.kind==='monster'&&lookup(monster.id)?.race==='Insect'
  ).length;
  if(otherFaceUpInsects>0)return neutral('other-insect-present',otherFaceUpInsects);
  return {
    atk:-1000,
    def:-1000,
    otherFaceUpInsects:0,
    applies:true,
    reason:'no-other-insect'
  };
}
