const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const evidencePath=path.join(root,'artifacts','m657-swarm-flip-results.json');
if(!fs.existsSync(evidencePath))throw new Error('Evidência de testes M657 ausente.');
const evidence=JSON.parse(fs.readFileSync(evidencePath,'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'catalog/engine-v9/manifest.json'),'utf8'));
const revision=manifest.revisions.find(item=>item.id===manifest.current);
if(!revision)throw new Error('Revisão atual do catálogo ausente.');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog/engine-v9',revision.file),'utf8'));
const ids=new Set(catalog.cards.map(card=>card.id));
const required=['15383415','41872150'];
if(evidence.mission!=='M657'||evidence.passed!==true||evidence.scenarioCount<28||
 evidence.completed!==evidence.scenarioCount)throw new Error('A suíte M657 não passou integralmente.');
if(evidence.certifiedCardsBefore!==969||evidence.certifiedCardsAfter!==catalog.cards.length||
 evidence.newCertifications!==0||evidence.inventoryGrants!==0)throw new Error('Contagem/certificação/inventário inesperados.');
if(required.some(id=>ids.has(id)))throw new Error('Uma carta não testada foi liberada no catálogo.');
if(evidence.integratedIntoCentralResolver!==false||evidence.discordLiveValidated!==false||
 evidence.productionChanged!==false)throw new Error('A evidência exagera a integração ou produção.');
for(const file of ['src/duelEngineCurrent.ts','src/monsterEffects.ts','src/cardCertifications.ts','catalog/engine-v9/manifest.json']){
 const diff=execFileSync('git',['diff','--quiet','origin/feat/rea-engine-recovery-20261026','--',file],{cwd:root,stdio:'ignore'});
 if(diff!==undefined)throw new Error('Arquivo central/catálogo alterado: '+file);
}
console.log(JSON.stringify({mission:'M657',scenarios:evidence.scenarioCount,passed:evidence.completed,
 certifiedCards:catalog.cards.length,newCertifications:0,inventoryGrants:0,catalogRevision:manifest.current},null,2));
