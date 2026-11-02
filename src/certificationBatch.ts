import {engineCard,getCardStatus,getEffect} from './effectRegistry';
import {definitionFingerprint} from './cardRegistry';
import {getMonsterDefinition} from './monsterEffects';
import {getEffectModel} from './effectModels';
export type CertificationCandidate={namespace:string;id:string;fingerprint:string;suites:readonly string[]};
/** Read-only admission planning. Neither certification, enabling, distribution
 * nor an inventory grant is a side effect of reviewing a historical batch. */
export function planCertificationBatch(candidates:readonly CertificationCandidate[]){
 const seen=new Set<string>();
 return candidates.map(candidate=>{
  const issues:string[]=[];
  if(candidate.namespace!=='passcode')issues.push('unsupported-identity-namespace');
  if(!/^\d{8}$/.test(candidate.id))issues.push('invalid-passcode');
  const key=candidate.namespace+':'+candidate.id;if(seen.has(key))issues.push('duplicate-candidate');seen.add(key);
  const card=engineCard(candidate.id),effect=getEffect(candidate.id),status=getCardStatus(candidate.id);
  if(!card||!effect||!status||status.issues.length)issues.push('definition-not-validated');
  const currentFingerprint=card&&effect?definitionFingerprint(card,effect,{monster:getMonsterDefinition,model:getEffectModel}):undefined;
  if(!currentFingerprint||candidate.fingerprint!==currentFingerprint)issues.push('fingerprint-mismatch');
  if(!candidate.suites.length||candidate.suites.some(s=>!/^tests\/[A-Za-z0-9_-]+\.test\.cjs$/.test(s)))issues.push('missing-or-invalid-regressions');
  return {namespace:candidate.namespace,id:candidate.id,currentStage:status?.stage??'unknown',fingerprint:currentFingerprint,readyForReview:issues.length===0,issues,suites:[...candidate.suites]};
 });
}
