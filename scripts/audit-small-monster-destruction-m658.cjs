const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const evidencePath=path.join(root,'artifacts','m658-small-monster-destruction-results.json');
if(!fs.existsSync(evidencePath))throw new Error('Evidência M658 ausente.');
const evidence=JSON.parse(fs.readFileSync(evidencePath,'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'catalog/engine-v9/manifest.json'),'utf8'));
const revision=manifest.revisions.find(item=>item.id===manifest.current);
if(!revision)throw new Error('Revisão atual do catálogo ausente.');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog/engine-v9',revision.file),'utf8'));
const ids=new Set(catalog.cards.map(card=>card.id));
if(evidence.mission!=='M658'||evidence.passed!==true||evidence.scenarioCount<35||
 evidence.completed!==evidence.scenarioCount)throw new Error('A suíte M658 não passou integralmente.');
if(evidence.inventoryConservationChecks<3||evidence.certifiedCardsBefore!==969||
 evidence.certifiedCardsAfter!==catalog.cards.length||evidence.newCertifications!==0||evidence.inventoryGrants!==0)
 throw new Error('Contagem, certificação ou inventário inesperados.');
if(ids.has('83986578')||ids.has('70138455'))throw new Error('Carta não testada foi liberada no catálogo.');
if(evidence.integratedIntoCentralResolver!==false||evidence.discordLiveValidated!==false||evidence.productionChanged!==false)
 throw new Error('A evidência exagera integração, Discord ou produção.');
const protectedFiles={
 'src/duelEngineCurrent.ts':'7e16627a2d4e1c7d0aff52fc9e63dc6b85f0f867',
 'src/monsterEffects.ts':'c8ba857e3e6534b1a42dde35e9f2a3a36e51bdf2',
 'src/cardCertifications.ts':'3725be7ab73c4ce441cdf561037acfaeaa321f6e',
 'catalog/engine-v9/manifest.json':'f59955155af85aa94b3a91231ff1a279a1d65f07'
};
for(const [file,expected] of Object.entries(protectedFiles)){
 const actual=execFileSync('git',['hash-object',file],{cwd:root,encoding:'utf8'}).trim();
 if(actual!==expected)throw new Error('Arquivo central/catálogo alterado: '+file);
}
console.log(JSON.stringify({mission:'M658',scenarios:evidence.scenarioCount,passed:evidence.completed,
 certifiedCards:catalog.cards.length,newCertifications:0,inventoryGrants:0,catalogRevision:manifest.current},null,2));
