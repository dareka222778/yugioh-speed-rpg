'use strict';
/** Calculation timing is not evidence of a continuous effect. Require a separate official timing review. */
function calculationTimingIssues(candidate,review){const effect=candidate?.effect,operation=candidate?.monster?.effect?.operation,rules=[...operation?.rules??[],...effect?.rules??[]],stats=[...effect?.combat??[],...rules.filter(r=>r.kind==='combat').map(r=>r.rule)];if(!stats.some(r=>r.kind==='stat'&&r.calculationOnly))return [];
 // Reviewed Konami FAQ, CID 5034, supplementary information dated 2020-04-01:
 // mandatory non-targeting field Trigger Effect. An erroneous review cannot override this fact.
 if(candidate?.card?.konamiId===5034)return ['trigger-modeled-as-continuous-combat-stat'];
 const proof=review?.timingEvidence;let official=false;try{const u=new URL(proof?.source);official=u.protocol==='https:'&&u.hostname==='www.db.yugioh-card.com'&&u.pathname==='/yugiohdb/faq_search.action'&&u.searchParams.get('cid')===String(candidate.card.konamiId)&&u.searchParams.get('ope')==='4';}catch{}
 if(!official||!['continuous','mandatory-trigger','optional-trigger'].includes(proof.classification)||typeof proof.startsChain!=='boolean'||typeof proof.explanation!=='string'||proof.explanation.trim().length<20)return ['missing-calculation-timing-review'];
 if(proof.startsChain!==(proof.classification!=='continuous'))return ['inconsistent-calculation-timing-review'];
 // The current combat-stat primitive is non-activating. Trigger effects require a different executable operation.
 return proof.startsChain||proof.classification!=='continuous'?['trigger-modeled-as-continuous-combat-stat']:[];
}
module.exports={calculationTimingIssues};
