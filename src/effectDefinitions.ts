// Explicit executable definitions, independent from card admission.
export type Effect=
 |{kind:'monsterEffect'|'normal'|'fusion'|'fissure'|'polymerization'|'darkHole'|'cardDestruction'|'giantTrunade'|'shieldSword'|'monsterReborn'|'changeHeart'|'blockAttack'|'deSpell'|'removeTrap'|'reinforcements'|'castleWalls'|'waboku'|'trapHole'|'justDesserts'|'magicJammer'|'sevenTools'|'potOfGreed'|'raigeki'|'mysticalSpaceTyphoon'|'bookOfMoon'|'torrentialTribute'|'bottomlessTrapHole'|'sakuretsuArmor'|'mirrorForce'}
 |{kind:'heal'|'burn';amount:number}
 |{kind:'field';races:string[];atk:number;def:number;penaltyRaces?:string[]}
 |{kind:'equip';races?:string[];attribute?:string;atk:number;def:number};
export const effectDefinitions:Record<string,Effect>={
 '40640057':{kind:'monsterEffect'},
 '54652250':{kind:'monsterEffect'},
 '07089711':{kind:'monsterEffect'},
 '31560081':{kind:'monsterEffect'},
 '28933734':{kind:'monsterEffect'},
 '60694662':{kind:'monsterEffect'},
 '11384280':{kind:'monsterEffect'},
 '26202165':{kind:'monsterEffect'},
 '78010363':{kind:'monsterEffect'},
 '77585513':{kind:'monsterEffect'},
 '54098121':{kind:'monsterEffect'},
 '83011277':{kind:'monsterEffect'},
 '77414722':{kind:'magicJammer'},
 '03819470':{kind:'sevenTools'},
 '55144522':{kind:'potOfGreed'},
 '12580477':{kind:'raigeki'},
 '05318639':{kind:'mysticalSpaceTyphoon'},
 '14087893':{kind:'bookOfMoon'},
 '53582587':{kind:'torrentialTribute'},
 '29401950':{kind:'bottomlessTrapHole'},
 '56120475':{kind:'sakuretsuArmor'},
 '44095762':{kind:'mirrorForce'},
 '38199696':{kind:'heal',amount:500},'84257639':{kind:'heal',amount:1000},'19523799':{kind:'burn',amount:800},
 '66788016':{kind:'fissure'},'24094653':{kind:'polymerization'},
 '17814387':{kind:'reinforcements'},'44209392':{kind:'castleWalls'},
 '53129443':{kind:'darkHole'},'72892473':{kind:'cardDestruction'},'42703248':{kind:'giantTrunade'},'52097679':{kind:'shieldSword'},
 '83764718':{kind:'monsterReborn'},'04031928':{kind:'changeHeart'},'25880422':{kind:'blockAttack'},'19159413':{kind:'deSpell'},'51482758':{kind:'removeTrap'},
 '12607053':{kind:'waboku'},'04206964':{kind:'trapHole'},'24068492':{kind:'justDesserts'},
 '86318356':{kind:'field',races:['Warrior','Beast-Warrior'],atk:200,def:200},
 '50913601':{kind:'field',races:['Dragon','Winged Beast','Thunder'],atk:200,def:200},
 '59197169':{kind:'field',races:['Fiend','Spellcaster'],penaltyRaces:['Fairy'],atk:200,def:200},
 '37120512':{kind:'equip',attribute:'DARK',atk:400,def:-200},
 '91595718':{kind:'equip',races:['Spellcaster'],atk:300,def:300},
 '04614116':{kind:'equip',races:['Fiend'],atk:300,def:300},
 '98374133':{kind:'equip',attribute:'EARTH',atk:400,def:-200},
 '01435851':{kind:'equip',races:['Dragon'],atk:300,def:300}
};
/** Runtime boundary for imported/staged data, in addition to TypeScript. */
const executableKinds=new Set<Effect['kind']>(['monsterEffect','normal','fusion','fissure','polymerization','darkHole','cardDestruction','giantTrunade','shieldSword','monsterReborn','changeHeart','blockAttack','deSpell','removeTrap','reinforcements','castleWalls','waboku','trapHole','justDesserts','magicJammer','sevenTools','potOfGreed','raigeki','mysticalSpaceTyphoon','bookOfMoon','torrentialTribute','bottomlessTrapHole','sakuretsuArmor','mirrorForce','heal','burn','field','equip']);
export function effectDefinitionIssues(value:unknown):string[]{
 const e=value as Effect;
 if(!e||typeof e!=='object'||!executableKinds.has(e.kind))return ['unknown-effect-operation'];
 if((e.kind==='heal'||e.kind==='burn')&&(!Number.isSafeInteger(e.amount)||e.amount<=0))return ['invalid-effect-amount'];
 if(e.kind==='field'||e.kind==='equip'){
  if(!Number.isSafeInteger(e.atk)||!Number.isSafeInteger(e.def))return ['invalid-modifier'];
  if(e.races!==undefined&&(!Array.isArray(e.races)||e.races.some(x=>typeof x!=='string'||!x)))return ['invalid-race-filter'];
  if(e.kind==='equip'&&e.attribute!==undefined&&(typeof e.attribute!=='string'||!e.attribute))return ['invalid-attribute-filter'];
  if(e.kind==='field'&&e.penaltyRaces!==undefined&&(!Array.isArray(e.penaltyRaces)||e.penaltyRaces.some(x=>typeof x!=='string'||!x)))return ['invalid-penalty-filter'];
  if(e.kind==='field'&&!e.races?.length)return ['missing-field-filter'];
 }
 return [];
}
