/** M20 review suite: staged definitions are exercised without enabling distribution
 * or changing the pinned v8 executable. End-to-end certification awaits a v9 runner. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const registry=require('../dist/effectRegistry');
const {mechanicalBatch20:batch,mechanicalMonsters20,mechanicalEffects20}=require('../dist/mechanicalBatch20');
const {withCatalog}=require('../dist/catalogContext');
const {continuousModifier}=require('../dist/continuousEffects');
const {equipEligible}=require('../dist/effectRegistry');
const {rulesCardName,archetypeCard}=require('../dist/cardIdentity');
const {countFormulaIssues,continuousRuleIssues}=require('../dist/continuousRules');
const {getArchivedDefinitionResolver}=require('../dist/resolverArchive');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const historical=require('../catalog/historical/2004-10-01/cards.json');
const cardsById=new Map(registry.engineCatalog.map(c=>[c.id,c]));
const staged={id:'m20-test-only',metadata:cardsById,effects:new Map(registry.engineCatalog.flatMap(c=>registry.getEffect(c.id)?[[c.id,registry.getEffect(c.id)]]:[])),statuses:new Map(registry.engineCatalog.map(c=>[c.id,registry.getCardStatus(c.id)])),data:{monsters:mechanicalMonsters20}};
for(const c of batch)staged.statuses.set(c.id,{stage:'certified',issues:[]});
const ref=(uid,id)=>({uid,id});
const mon=(uid,id,owner=0,position='atk',faceUp=true)=>({uid,id,owner,position,faceUp});
const back=(uid,id,owner=0,equippedTo)=>({uid,id,owner,faceUp:true,resolved:true,setTurn:0,...equippedTo?{equippedTo}:{}});
const player=()=>({monsters:[],backrow:[],grave:[],hand:[],deck:[],field:null});
function game(){return {players:[player(),player()],phase:'main',resume:'main',current:0,turn:3};}
const mod=(s,m,stat='atk')=>continuousModifier(s,m,stat);
const withStage=fn=>withCatalog(staged,fn);

test('M20: all 11 distinct identities match the historical registry and execute in the active v9 resolver',()=>{
 assert.equal(batch.length,11);assert.equal(new Set(batch.map(c=>c.id)).size,11);
 for(const c of batch){const original=historical.find(x=>x.passwords.includes(c.id));assert.ok(original,`${c.englishName}: historical`);assert.equal(c.konamiId,original.konamiId);assert.equal(c.englishName,original.names.en);assert.equal(c.kind,original.kind);assert.equal(original.firstObserved.world<='2004-09-30',true);
  assert.equal(registry.getCardStatus(c.id).stage,'certified');assert.equal(cardDistributionAllowed(c.id),false);
  assert.equal(getArchivedDefinitionResolver('engine-v8').getPlayableCard(c.id),undefined);
 }
 assert.equal(registry.enabledCardIds.length,782);
});
test('M20: card names, archetype identity and filter admission',()=>{
 assert.equal(rulesCardName(cardsById.get('91932350')),'Harpie Lady');
 assert.equal(archetypeCard(cardsById.get('11901678'),'Archfiend'),true);
 assert.equal(archetypeCard(cardsById.get('11901678'),'Amazoness'),false);
 assert.equal(archetypeCard(cardsById.get('47480070'),'Amazoness'),true);
 assert.deepEqual(countFormulaIssues(mechanicalMonsters20['52040216'].effect.operation.rules[0].count),[]);
 for(const id of Object.keys(mechanicalMonsters20))assert.deepEqual(continuousRuleIssues(mechanicalMonsters20[id].effect.operation.rules),[]);
 for(const bad of [{position:'back'}, {phase:'main'}, {duringOwnTurn:'yes'}])assert.ok(continuousRuleIssues([{kind:'modifier',filter:bad,atk:100,def:0}]).length);
 assert.ok(countFormulaIssues({zone:'monsters',controller:'allThree',atk:100,def:0}).length);
});
test('M20: Harpie Lady 1 buffs all WIND monsters, Pet Dragon counts both sides and aliases',()=>withStage(()=>{
 const s=game(),lady=mon('lady','91932350'),pet=mon('pet','52040216'),base=mon('base','76812113'),opp=mon('enemy-lady','76812113',1);
 s.players[0].monsters=[lady,pet,base];s.players[1].monsters=[opp];
 assert.equal(mod(s,lady),300);assert.equal(mod(s,pet),300+3*300);assert.equal(mod(s,opp),300);
 assert.equal(mod(s,pet,'def'),3*300);
 opp.faceUp=false;assert.equal(mod(s,pet),300+2*300);
 lady.faceUp=false;assert.equal(mod(s,pet),300);assert.equal(mod(s,base),0);
}));
test('M20: reciprocal Battleguard counts require same-side visible named monster',()=>withStage(()=>{
 const s=game(),swamp=mon('swamp','40453765'),lava=mon('lava','20394040');s.players[0].monsters=[swamp,lava];
 assert.equal(mod(s,swamp),500);assert.equal(mod(s,lava),500);
 lava.faceUp=false;assert.equal(mod(s,swamp),0);assert.equal(mod(s,lava),0);
 lava.faceUp=true;s.players[0].monsters=[swamp];s.players[1].monsters=[lava];assert.equal(mod(s,swamp),0);
}));
test('M20: Amazoness Paladin counts itself, Dark Magician Girl counts both graveyards',()=>withStage(()=>{
 const s=game(),paladin=mon('paladin','47480070'),another=mon('paladin-2','47480070'),girl=mon('girl','38033121');
 s.players[0].monsters=[paladin,another,girl];assert.equal(mod(s,paladin),200);s.players[1].monsters=[mon('enemy-amazon','47480070',1)];assert.equal(mod(s,paladin),200);
 s.players[0].grave=[ref('dark','46986414')];s.players[1].grave=[ref('other-dark','46986414')];assert.equal(mod(s,girl),600);s.players[0].grave=[];assert.equal(mod(s,girl),300);
}));
test('M20: Cyber Shield and Fusion Weapon enforce canonical name and Level/category boundaries',()=>{
 const shield=mechanicalEffects20['63224564'],weapon=mechanicalEffects20['27967615'];
 assert.equal(equipEligible(shield,cardsById.get('76812113')),true);
 assert.equal(equipEligible(shield,cardsById.get('91932350')),true);
 assert.equal(equipEligible(shield,cardsById.get('52040216')),false);
 assert.equal(equipEligible(weapon,cardsById.get('11901678')),false);
 assert.equal(equipEligible(weapon,cardsById.get('76812113')),false);
 const eligible=registry.engineCatalog.find(c=>c.monsterType==='fusion'&&c.level<=6);assert.ok(eligible);assert.equal(equipEligible(weapon,eligible),true);
});
test('M20: position-only Chorus field spell affects both fields, not facedown monsters',()=>withStage(()=>{
 const s=game(),a=mon('a','76812113',0,'def'),b=mon('b','76812113',1,'def'),c=mon('c','76812113',0,'atk'),d=mon('d','76812113',1,'def',false);
 s.players[0].field=back('chorus','81380218');s.players[0].monsters=[a,c];s.players[1].monsters=[b,d];
 assert.equal(mod(s,a,'def'),500);assert.equal(mod(s,b,'def'),500);assert.equal(mod(s,c,'def'),0);assert.equal(mod(s,d,'def'),0);
}));
test('M20: Banner of Courage has its bonus only on owner Battle Phase, including responses',()=>withStage(()=>{
 const s=game(),a=mon('a','76812113'),b=mon('b','76812113',1);s.players[0].monsters=[a];s.players[1].monsters=[b];s.players[0].backrow=[back('banner','10012614')];
 assert.equal(mod(s,a),0);s.phase='battle';assert.equal(mod(s,a),200);assert.equal(mod(s,b),0);
 s.phase='response';s.resume='battle';assert.equal(mod(s,a),200);
 s.current=1;assert.equal(mod(s,a),0);
}));
