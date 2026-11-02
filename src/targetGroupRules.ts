/** Activation-time group cardinality. Each accepted UID gets its own zone lifetime. */
export type TargetGroupRule={from:'monsters'|'backrow';action:'destroy'|'returnHand';minimum:number;maximum:number;faceDownOnly?:true};
export function targetGroupRuleIssues(value:unknown):string[]{
 if(!value||typeof value!=='object'||Array.isArray(value))return ['invalid-target-group'];const r=value as TargetGroupRule;
 if(Object.keys(r).some(k=>!['from','action','minimum','maximum','faceDownOnly'].includes(k))||!['monsters','backrow'].includes(r.from)||!['destroy','returnHand'].includes(r.action)||!Number.isSafeInteger(r.minimum)||!Number.isSafeInteger(r.maximum)||r.minimum<1||r.maximum<r.minimum||r.maximum>3||r.faceDownOnly!==undefined&&r.faceDownOnly!==true)return ['invalid-target-group'];return [];
}
