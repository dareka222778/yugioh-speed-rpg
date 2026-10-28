export type RitualRule={monsterId:string;minimumLevel:number};
export function ritualRuleIssues(r:any):string[]{return !r||Object.keys(r).some(k=>!['monsterId','minimumLevel'].includes(k))||!/^\d{8}$/.test(r.monsterId)||!Number.isSafeInteger(r.minimumLevel)||r.minimumLevel<1||r.minimumLevel>12?['invalid-ritual-recipe']:[];}
