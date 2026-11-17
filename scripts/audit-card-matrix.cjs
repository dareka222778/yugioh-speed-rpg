/** Auditable evidence inventory for the currently certified cards.
 * A reference to a suite or a literal card ID is NOT proof that every effect
 * and interaction was exercised. Do not promote cards from this report. */
const fs=require('node:fs');
const path=require('node:path');
const {enabledCardIds,getCardStatus,getEffect,getPlayableCard}=require('../dist/effectRegistry');
const {cardCertifications}=require('../dist/cardCertifications');
const {getMonsterDefinition}=require('../dist/monsterEffects');
const {cardRulesPT}=require('../dist/cardText');
const {RULES_VERSION}=require('../dist/rulesProfile');

function buildCardMatrix(){
 const rows=enabledCardIds.map(id=>{
  const card=getPlayableCard(id),effect=getEffect(id),certificate=cardCertifications[id];
  if(!card||!effect||!certificate||getCardStatus(id)?.stage!=='certified')throw Error(`Carta não certificada na matriz: ${id}`);
  const monster=effect.kind==='monsterEffect'?getMonsterDefinition(id):undefined;
  const suites=certificate.suites.map(file=>{
   const target=path.resolve(__dirname,'..',file);
   if(!fs.existsSync(target))throw Error(`Evidência ausente: ${file}`);
   const source=fs.readFileSync(target,'utf8');
   return {file,mentionsCardId:new RegExp(`(?<!\\d)${id}(?!\\d)`).test(source)};
  });
  const text=cardRulesPT(id);
  if(!text.trim())throw Error(`Descrição operacional vazia: ${id}`);
  return {
   id,namePT:card.name,englishName:card.englishName,kind:card.kind,
   monsterType:card.monsterType??null,effectKind:effect.kind,
   trigger:monster?.effect.trigger??null,
   operation:monster?.effect.operation.kind??null,
   suites,descriptionPT:text,descriptionCharacters:text.length,source:card.source,
   evidence:'mechanical-fingerprint-and-referenced-suite',
   directIdMention:suites.some(s=>s.mentionsCardId),
   manualEffectReview:effect.kind!=='normal'&&effect.kind!=='fusion',
  };
 }).sort((a,b)=>a.namePT.localeCompare(b.namePT,'pt-BR'));
 const effectRows=rows.filter(row=>row.manualEffectReview);
 const kinds=Object.fromEntries([...new Set(rows.map(row=>row.effectKind))].sort().map(kind=>[kind,rows.filter(row=>row.effectKind===kind).length]));
 return {
  schema:1,release:require('../package.json').version,rulesVersion:RULES_VERSION,scope:'registered-and-certified-only',
  warning:'Suite references and literal ID mentions do not prove full effect/timing/combination coverage. Historical availability, official Portuguese wording and Discord behavior require separate reviews.',
  totals:{certified:rows.length,requiresEffectReview:effectRows.length,indirectTestReferences:effectRows.filter(row=>!row.directIdMention).length},
  effectKinds:kinds,cards:rows,
 };
}
if(require.main===module){
 const report=buildCardMatrix();
 if(process.argv.includes('--write')){
  const destination=path.resolve(__dirname,'../validation/card-matrix-v016.json');
  fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
  console.log(`Matriz gravada em ${path.relative(process.cwd(),destination)}`);
 }
 console.log(JSON.stringify({totals:report.totals,effectKinds:report.effectKinds,warning:report.warning},null,2));
}
module.exports={buildCardMatrix};
