/** Crosswalk only. This never registers, enables, grants or translates a card. */
const fs=require('node:fs'),path=require('node:path');
const {verifySnapshot}=require('./import-historical.cjs');
function crosswalk(history,playable){
 const matches=[],unmatched=[],ambiguous=[];
 for(const c of playable){
  const candidates=history.filter(h=>(c.konamiId!=null&&h.konamiId===c.konamiId)||h.passwords.includes(c.id));
  if(candidates.length===1)matches.push({engineId:c.id,historicalId:candidates[0].id,matchedBy:c.konamiId!=null&&candidates[0].konamiId===c.konamiId?'konami-id':'password',certificationScope:'existing-engine-only'});
  else if(candidates.length>1)ambiguous.push({engineId:c.id,candidateIds:candidates.map(h=>h.id).sort()});else unmatched.push(c.id);
 }
 return {matches,unmatched,ambiguous};
}
function audit(){
 const folder=path.resolve(__dirname,'../catalog/historical/2004-10-01'),verified=verifySnapshot(folder),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))),history=JSON.parse(fs.readFileSync(path.join(folder,'cards.json'))),registry=require('../dist/effectRegistry');
 const linked=crosswalk(history,registry.enabledCardIds.map(id=>registry.getPlayableCard(id)));
 return {schema:1,release:require('../package.json').version,scope:'crosswalk of existing admitted engine cards; not historical certification or release authorization',historicalCards:verified.union,enabledEngineCards:registry.enabledCardIds.length,matchedExistingCards:linked.matches.length,uniqueHistoricalMatches:new Set(linked.matches.map(m=>m.historicalId)).size,catalogCardsSHA256:manifest.files['cards.json'].sha256,...linked,cardsEnabledByImport:0,cardsGrantedByImport:0,animeCatalog:'not inferred from release dates'};
}
if(require.main===module){try{const r=audit();if(process.argv.includes('--write'))fs.writeFileSync(path.resolve(__dirname,'../validation/historical-admission.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({historical:r.historicalCards,enabled:r.enabledEngineCards,matched:r.matchedExistingCards,unmatched:r.unmatched,ambiguous:r.ambiguous,cardsEnabledByImport:0,cardsGrantedByImport:0},null,2));if(r.unmatched.length||r.ambiguous.length)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={crosswalk,audit};
