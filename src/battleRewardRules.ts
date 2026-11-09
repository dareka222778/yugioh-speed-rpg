export type BattleReward=
 |{result:'drawSelf'|'drawOpponent';count:number;piercing?:true}
 |{result:'drawOpponentToSeven'|'discardOpponentRandom';piercing?:true};
export function rewardIssues(r:BattleReward):string[]{
 const draws=r?.result==='drawSelf'||r?.result==='drawOpponent';
 return !r||!['drawSelf','drawOpponent','drawOpponentToSeven','discardOpponentRandom'].includes(r.result)||Object.keys(r).some(k=>!(draws?['result','count','piercing']:['result','piercing']).includes(k))||r.piercing!==undefined&&r.piercing!==true||draws&&(!Number.isSafeInteger(r.count)||r.count<1||r.count>30)?['invalid-battle-reward']:[];
}
