export type RitualRule={monsterId?:string;minimumLevel?:number;attribute?:'EARTH'|'DARK';exact?:true};
export function ritualRuleIssues(r:any):string[]{
 if(!r||Object.keys(r).some(k=>!['monsterId','minimumLevel','attribute','exact'].includes(k)))return ['invalid-ritual-recipe'];
 const named=/^\d{8}$/.test(r.monsterId)&&Number.isSafeInteger(r.minimumLevel)&&r.minimumLevel>=1&&r.minimumLevel<=12&&r.attribute===undefined&&r.exact===undefined;
 const filtered=['EARTH','DARK'].includes(r.attribute)&&r.exact===true&&r.monsterId===undefined&&r.minimumLevel===undefined;
 return named||filtered?[]:['invalid-ritual-recipe'];
}
