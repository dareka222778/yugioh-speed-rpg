const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const e=require('../dist/resolvers/v8/duelEngineCurrent');
const {runCatalog}=require('../dist/resolvers/v8/catalogRuntime');
const {definitionFingerprint}=require('../dist/resolvers/v8/cardRegistry');
const {getEffectModel,getDestructionModel}=require('../dist/resolvers/v8/effectModels');
const {destructionTargets,executeDestruction}=require('../dist/resolvers/v8/effectOperations');
const {destructionFilterIssues}=require('../dist/resolvers/v8/destructionRules');
const manifest=require('../catalog/engine-v8/manifest.json');
const baseline=require('../catalog/engine-v8/'+manifest.current+'.json');
// Test-only admission. These fixtures do not register or certify production cards.
const cases=[['26725158',4869,'Exile of the Wicked','Fiend'],['21323861',4666,'Acid Rain','Machine'],['56606928',4670,'Eternal Drought','Fish'],['20101223',4669,'Breath of Light','Rock'],['90873992',4659,'Warrior Elimination','Warrior'],['94716515',4668,'Eradicating Aerosol','Insect'],['95051344',4662,'Eternal Rest',null],['90330453',4868,'Last Day of Witch','Spellcaster']];
const data=structuredClone(baseline);
for(const [id,cid,name,race] of cases){
 const c={id,konamiId:cid,name,englishName:name,kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Test fixture; not an admission decision.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid='+cid+'&request_locale=en'};
 const effect={kind:'destroyFiltered',filter:race?{races:[race]}:{equipped:true}};
 data.cards.push(c);data.effects[id]=effect;data.certificates[id]={fingerprint:definitionFingerprint(c,effect,{model:getEffectModel}),suites:['tests/filteredDestruction15.test.cjs']};
}
const revision=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
const run=fn=>runCatalog(revision,data,fn);
const deck=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const mon=(uid,id,owner=0,faceUp=true)=>({uid,id,owner,faceUp,position:faceUp?'atk':'def',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const ofRace=race=>data.cards.find(c=>c.kind==='monster'&&c.race===race&&c.monsterType==='normal').id;
function game(id){const s=e.createDuel([{id:'a',name:'A',cards:deck},{id:'b',name:'B',cards:deck}],undefined,0,{randomSeed:'15'.repeat(32)});s.turn=3;s.players[0].hand=[{uid:'cast',id}];s.players[0].monsters=[];s.players[1].monsters=[];return s;}
function settle(s){for(let n=0;s.phase==='response';n++){assert.ok(n<20);s=e.step(s,s.players[e.decisionPlayer(s)].id,{kind:'pass'});}return s;}
function activate(s){const a=e.legalActions(s,'a').find(a=>a.kind==='spell'&&a.card==='cast');assert.ok(a);assert.equal(a.target,undefined);return e.step(s,'a',a);}
for(const [id,,name,race]of cases)test('v8 candidate: '+name+' selects its complete public group, both fields, at resolution',()=>run(()=>{
 const s=game(id),matching=ofRace(race??'Warrior'),other=ofRace(race==='Dragon'?'Warrior':'Dragon');
 s.players[0].monsters=[mon('own',matching),mon('hidden',matching,0,false)];s.players[1].monsters=[mon('enemy',matching,1),mon('other',other,1)];
 if(!race)for(const [side,uid]of [[0,'own'],[1,'enemy']])s.players[side].backrow=[{uid:'equip'+side,id:'56747793',faceUp:true,resolved:true,setTurn:0,equippedTo:uid}];
 const result=settle(activate(s));assert.deepEqual(result.players[0].monsters.map(m=>m.uid),['hidden']);assert.deepEqual(result.players[1].monsters.map(m=>m.uid),['other']);
 assert.ok(result.players[0].grave.some(c=>c.uid==='own'));assert.ok(result.players[1].grave.some(c=>c.uid==='enemy'));assert.equal(result.players[0].lp,4000);assert.equal(result.players[1].lp,4000);
}));
test('v8 candidate: absent, hidden and nonmatching monsters do not enable activation',()=>run(()=>{
 const s=game('21323861');s.players[1].monsters=[mon('hidden',ofRace('Machine'),1,false),mon('other',ofRace('Dragon'),1)];
 assert.equal(e.legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='cast'),false);
 const original=JSON.stringify(s);assert.throws(()=>e.step(s,'a',{kind:'spell',card:'cast'}));assert.equal(JSON.stringify(s),original);
}));
test('v8 candidate: response interruption restores deterministically, reevaluates filter and never replays a completed command',()=>run(()=>{
 const s=game('21323861');s.players[1].monsters=[mon('machine',ofRace('Machine'),1)];s.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}];
 const pending=activate(s);assert.equal(pending.phase,'response');
 const copy=JSON.parse(JSON.stringify(pending));assert.deepEqual(settle(pending),settle(copy));
 copy.players[1].monsters[0].faceUp=false;copy.players[1].monsters[0].position='def';assert.equal(settle(copy).players[1].monsters.length,1);
 const done=settle(pending);assert.equal(e.legalActions(done,'a').some(a=>a.card==='cast'),false);
 assert.throws(()=>e.step(done,'a',{kind:'spell',card:'cast'}));
}));
test('v8 candidate: activation negation prevents every destruction and pays only the existing counter cost',()=>run(()=>{
 const s=game('90873992');s.players[1].monsters=[mon('warrior',ofRace('Warrior'),1)];s.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}];s.players[1].hand=[{uid:'cost',id:'91152256'}];
 let pending=activate(s);const counter=e.legalActions(pending,'b').find(a=>a.kind==='trap'&&a.card==='jam');assert.ok(counter);pending=e.step(pending,'b',counter);const done=settle(pending);
 assert.equal(done.players[1].monsters.length,1);assert.ok(done.players[1].grave.some(c=>c.uid==='cost'));
}));
test('v8 candidate: equipment condition is independent of equipment ownership and checked again before resolution',()=>run(()=>{
 const s=game('95051344');s.players[1].monsters=[mon('equipped',ofRace('Warrior'),1)];s.players[0].backrow=[{uid:'equipment',id:'56747793',faceUp:true,resolved:true,setTurn:0,equippedTo:'equipped'}];
 const model=getDestructionModel(data.effects['95051344']);assert.deepEqual(destructionTargets(s,0,model),['equipped']);s.players[0].backrow=[];assert.deepEqual(destructionTargets(s,0,model),[]);
}));
test('v8 candidate: group membership and immunity are snapshotted before any mutation',()=>run(()=>{
 const s=game('21323861');s.players[0].monsters=[mon('first',ofRace('Machine')),mon('second',ofRace('Machine'))];
 const destroyed=[];const count=executeDestruction(s,0,getDestructionModel(data.effects['21323861']),undefined,{kind:'spell',attack:()=>0,destroy:(state,uid)=>{destroyed.push(uid);state.players[0].monsters.find(m=>m.uid==='second').faceUp=false;}});
 assert.equal(count,2);assert.deepEqual(destroyed,['first','second']);
}));
test('v8 candidate: invalid or unsupported filters fail closed',()=>{
 for(const v of [null,[],{}, {races:[]},{races:['Unknown']},{races:['Fiend','Fiend']},{equipped:false},{races:['Fiend'],attribute:'DARK'}])assert.ok(destructionFilterIssues(v).length,JSON.stringify(v));
 for(const v of [{races:['Fiend']},{equipped:true},{races:['Warrior'],equipped:true}])assert.deepEqual(destructionFilterIssues(v),[]);
});
test('v8 candidate: Non-Spellcasting Area prevents filtered destruction and removing its source restores susceptibility',()=>run(()=>{
 const s=game('21323861');s.players[1].monsters=[mon('machine',ofRace('Machine'),1)];
 s.players[0].backrow=[{uid:'immune',id:'20065549',faceUp:true,resolved:true,setTurn:0}];
 const protectedState=settle(activate(s));assert.equal(protectedState.players[1].monsters.length,1);
 s.players[0].backrow=[];assert.equal(settle(activate(s)).players[1].monsters.length,0);
}));
test('v8 candidate: chained equipment destruction resolves first and Eternal Rest reevaluates the equipped condition',()=>run(()=>{
 const s=game('95051344');s.players[1].monsters=[mon('equipped',ofRace('Warrior'),1)];
 s.players[0].backrow=[{uid:'equipment',id:'56747793',faceUp:true,resolved:true,setTurn:0,equippedTo:'equipped'}];
 s.players[1].backrow=[{uid:'mst',id:'05318639',faceUp:false,setTurn:0}];
 let pending=activate(s);const response=e.legalActions(pending,'b').find(a=>a.kind==='spell'&&a.card==='mst'&&a.target==='equipment');assert.ok(response);
 pending=e.step(pending,'b',response);const done=settle(pending);
 assert.equal(done.players[1].monsters.length,1);assert.ok(done.players[0].grave.some(c=>c.uid==='equipment'));
 assert.deepEqual(done,settle(JSON.parse(JSON.stringify(pending))));
}));
test('v8 candidate: archive dispatch restores v8 while default duels and all previous catalog revisions stay v7',()=>{
 const facade=require('../dist/duelEngine'),archive=require('../dist/resolverArchive');const players=[{id:'a',name:'A',cards:deck},{id:'b',name:'B',cards:deck}];
 assert.equal(facade.createDuel(players).resolverVersion,'engine-v7');
 const s=archive.getArchivedDefinitionResolver('engine-v8').createDuel(players,undefined,0,{randomSeed:'15'.repeat(32)});assert.equal(s.resolverVersion,'engine-v8');
 const action=facade.legalActions(s,'a')[0];assert.deepEqual(facade.step(s,'a',action),facade.step(JSON.parse(JSON.stringify(s)),'a',action));
 assert.equal(archive.getArchivedDefinitionResolver('engine-v7').IMPLEMENTED_DUEL_CARDS.length,741);
});
