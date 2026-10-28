const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),child=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'engine-refactor-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const e=require('../dist/duelEngine'),registry=require('../dist/effectRegistry'),{starterContents}=require('../dist/cardCatalog');
const {buildCardRegistry,definitionFingerprint}=require('../dist/cardRegistry'),{getMonsterDefinition,getMonsterEffect}=require('../dist/monsterEffects');
const {getEffectModel,getDestructionModel}=require('../dist/effectModels'),{executeDestruction}=require('../dist/effectOperations');
const {createDuelRandom,randomIndex}=require('../dist/duelRandom'),{assertDuelState}=require('../dist/duelIntegrity');
const {applyDuelAction,projectTransitionEvents}=require('../dist/duelTransitions');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id='91152256')=>({uid,id});
const monster=(uid,id='91152256',owner=0,props={})=>({...ref(uid,id),owner,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...props});
const clone=s=>JSON.parse(JSON.stringify(s)),seed='ab'.repeat(32);
function game(){return e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],undefined,0,{randomSeed:seed});}
function act(s,who,kind,filter=()=>true){const a=e.legalActions(s,who).find(a=>a.kind===kind&&filter(a));assert.ok(a,kind);return e.step(s,who,a);}
function fixture(){let s=game();s.turn=3;s.players[0].monsters=[monster('sangan','26202165'),monster('cannon','11384280')];s.players[0].deck=[ref('choice'),ref('second','15025844'),ref('third','48305365'),ref('fourth','46986414')];return act(s,'a','monsterEffect',a=>a.tributes?.includes('sangan'));}

test('headless engine imports neither Discord, collection UI, SQLite nor renderer',()=>{
 const script="require('./dist/duelEngine');console.log(JSON.stringify(Object.keys(require.cache).filter(p=>/discord.js|better-sqlite3|\\/(collection|database|duelUI|duelRenderer)\\.js$/.test(p))));";
 assert.deepEqual(JSON.parse(child.execFileSync(process.execPath,['-e',script],{encoding:'utf8'})),[]);
});
test('every enabled card has explicit certification after audited family expansion',()=>{
 assert.equal(registry.enabledCardIds.length,740);assert.equal(registry.enabledCardIds.filter(id=>registry.getEffect(id).kind==='normal').length,569);
 for(const id of registry.enabledCardIds)assert.equal(registry.getCardStatus(id).stage,'certified');
 assert.equal(child.spawnSync(process.execPath,['scripts/check-card-certification.cjs'],{encoding:'utf8'}).status,0);
});
test('translated flavour/summary text cannot grant Normal Monster support',()=>{
 const source=registry.engineCard('91152256'),c={...source,id:'00000001',monsterType:undefined,summary:'Monstro Normal: sem efeito.'};
 const r=buildCardRegistry([c],{},{});assert.equal(r.statuses.get(c.id).stage,'registered');assert.equal(r.enabled.length,0);
 const structured={...c,monsterType:'normal',summary:'Texto em qualquer idioma'};const defined=buildCardRegistry([structured],{},{});assert.equal(defined.statuses.get(c.id).stage,'validated');assert.equal(defined.effects.get(c.id).kind,'normal');assert.equal(defined.enabled.length,0);
});
test('valid definitions remain staged until an explicit certificate matches the mechanical data',()=>{
 const c={...registry.engineCard('91152256'),id:'00000001'},effect={kind:'normal'},fingerprint=definitionFingerprint(c,effect,{});
 const certificates={[c.id]:{fingerprint,suites:['tests/engineRefactor.test.cjs']}};
 assert.deepEqual(buildCardRegistry([c],{},certificates).enabled,[c.id]);
 assert.throws(()=>buildCardRegistry([{...c,atk:9999}],{},certificates),/desatualizada/);
 assert.throws(()=>buildCardRegistry([c],{}, {[c.id]:{fingerprint,suites:[]}}),/Certificação inválida/);
 assert.throws(()=>buildCardRegistry([c],{}, {[c.id]:{fingerprint,suites:['../fake']}}),/Certificação inválida/);
 assert.throws(()=>buildCardRegistry([],{},certificates),/sem metadados/);
});
test('malformed imported stats, unknown operations and duplicate IDs fail closed',()=>{
 const c={...registry.engineCard('91152256'),id:'00000001'};
 assert.equal(buildCardRegistry([{...c,atk:NaN}],{},{}).statuses.get(c.id).stage,'registered');
 assert.equal(buildCardRegistry([c],{[c.id]:{kind:'interpretText'}},{}).statuses.get(c.id).stage,'registered');
 assert.throws(()=>buildCardRegistry([c,c],{},{}),/duplicado/);
 const spell={...registry.engineCard('38199696'),id:'00000002'};assert.equal(buildCardRegistry([spell],{[spell.id]:{kind:'heal',amount:-1}},{}).statuses.get(spell.id).stage,'registered');
});
test('same-model mechanical changes invalidate existing card admission',()=>{
 const c=registry.engineCard('12580477'),effect=registry.getEffect(c.id),context={model:getEffectModel,monster:getMonsterDefinition};
 const cert={fingerprint:definitionFingerprint(c,effect,context),suites:['tests/classicSpells.test.cjs']};
 assert.throws(()=>buildCardRegistry([c],{[c.id]:effect},{[c.id]:cert},{...context,model:kind=>({...getEffectModel(kind),destruction:{...getDestructionModel(kind),scope:'all'}})}),/desatualizada/);
});
test('mandatory/optional and damage timing come from explicit definitions while legacy API stays stable',()=>{
 assert.equal(getMonsterDefinition('83011277').activation.policy,'optional');assert.equal(getMonsterDefinition('26202165').activation.policy,'mandatory');
 assert.equal(getMonsterDefinition('40640057').activation.window,'opposingDamageCalculation');assert.equal(getMonsterEffect('83011277').activation,undefined);
 assert.equal(getEffectModel('castleWalls').activation.damage,'beforeCalculation');assert.equal(getEffectModel('bookOfMoon').activation.damage,'never');
 assert.equal(registry.isQuickPlaySpell('14087893'),true);assert.equal(registry.isQuickPlaySpell('17814387'),false);
});
test('the shared destruction operation selects the original set once, without confusing banishment and graveyard',()=>{
 const s=game();s.players[0].monsters=[monster('own')];s.players[1].monsters=[monster('up'),monster('down','91152256',1,{faceUp:false,position:'def'})];
 const removed=[];const services={attack:e.atk,destroy:(state,uid)=>{removed.push(uid);state.players[1].monsters=state.players[1].monsters.filter(m=>m.uid!==uid);if(uid==='up')state.players[1].monsters.push(monster('not-original','91152256',1));}};
 assert.equal(executeDestruction(s,0,getDestructionModel('raigeki'),undefined,services),2);assert.deepEqual(removed,['up','down']);assert.equal(s.players[0].monsters[0].uid,'own');assert.equal(s.players[1].monsters[0].uid,'not-original');
 const b=game();b.players[1].monsters=[monster('small','91152256',1),monster('large','48305365',1)];const banished=[];
 assert.equal(executeDestruction(b,0,getDestructionModel('bottomlessTrapHole'),'small',{destroy:()=>assert.fail('must banish'),attack:e.atk,banish:(_,uid)=>{banished.push(uid);return true;}}),0);
 assert.equal(executeDestruction(b,0,getDestructionModel('bottomlessTrapHole'),'large',{destroy:()=>assert.fail('must banish'),attack:e.atk,banish:(_,uid)=>{banished.push(uid);return true;}}),1);assert.deepEqual(banished,['large']);
});
test('seeded openings and all random stream indices reproduce after JSON restore',()=>{
 assert.deepEqual(game(),game());const a=createDuelRandom(seed),b=clone(a);
 const actual=Array.from({length:200},(_,i)=>randomIndex(a,i%30+1));assert.deepEqual(actual,Array.from({length:200},(_,i)=>randomIndex(b,i%30+1)));
 for(const invalid of [0,-1,1.5,Infinity])assert.throws(()=>randomIndex(a,invalid),/Limite/);
 assert.throws(()=>createDuelRandom('bad'),/Semente/);
});
test('post-search shuffling is deterministic, preserves input, and carries its stream across SQLite restart',()=>{
 const s=fixture(),action=e.legalActions(s,'a').find(a=>a.kind==='choose'),before=JSON.stringify(s);
 const first=e.step(s,'a',action),second=e.step(clone(s),'a',action);assert.deepEqual(clone(first),clone(second));assert.equal(JSON.stringify(s),before);assert.ok(first.random.counter>s.random.counter);
 const db=require('../dist/database').db,store=require('../dist/duelStore');db.prepare('INSERT INTO duels(id,guild_id,channel_id,status,revision,updated,state) VALUES(?,?,?,?,?,?,?)').run('rng-persist','g','c','playing',0,Date.now(),JSON.stringify(s));
 const script="const store=require('./dist/duelStore'),db=require('./dist/database'),e=require('./dist/duelEngine');const s=store.getDuel('rng-persist').state;console.log(JSON.stringify(e.step(s,'a',e.legalActions(s,'a')[0])));db.db.close();";
 assert.deepEqual(JSON.parse(child.execFileSync(process.execPath,['-e',script],{encoding:'utf8'})),clone(first));
});
test('legacy snapshots remain accepted while unsupported versions and corrupt RNG are refused',()=>{
 const legacy=game();delete legacy.random;delete legacy.rulesVersion;delete legacy.cardDefinitionsVersion;assert.doesNotThrow(()=>assertDuelState(legacy));
 for(const changes of [{rulesVersion:'other'},{cardDefinitionsVersion:999},{random:{algorithm:'hmac-sha256-v1',seed:'bad',counter:0}},{random:{...game().random,counter:-1}}])assert.throws(()=>assertDuelState({...game(),...changes}),/Estado do duelo inválido/);
});
test('structured transition events expose counts but keep drawn cards and random seed private',()=>{
 let s=game();s.turn=3;s.players[0].hand=[ref('pot','55144522')];s.players[0].deck=[ref('secret-a'),ref('secret-b','48305365')];const action=e.legalActions(s,'a').find(a=>a.kind==='spell');const out=applyDuelAction(s,'a',action);
 assert.ok(out.events.some(x=>x.type==='cardMoved'&&x.cardId==='91152256'&&x.visibility==='private'));assert.ok(out.events.some(x=>x.type==='zoneCountChanged'&&x.zone==='hand'));
 const publicEvents=JSON.stringify(projectTransitionEvents(out.events)),rivalEvents=JSON.stringify(projectTransitionEvents(out.events,'b'));assert.ok(!publicEvents.includes('secret-a'));assert.ok(!rivalEvents.includes('secret-b'));assert.ok(!JSON.stringify(out.events).includes(seed));assert.ok(JSON.stringify(projectTransitionEvents(out.events,'a')).includes('secret-a'));
 assert.ok(!JSON.stringify(require('../dist/duelUI').publicDuelData(out.state)).includes(seed));
});
test('setting a card emits a private identity while its later reveal is public',()=>{
 let s=game();s.players[0].hand=[ref('hidden','91152256')];const out=applyDuelAction(s,'a',e.legalActions(s,'a').find(a=>a.kind==='summon'&&a.position==='set'));
 assert.ok(!JSON.stringify(projectTransitionEvents(out.events)).includes('hidden'));assert.ok(JSON.stringify(projectTransitionEvents(out.events,'a')).includes('hidden'));
 const before=clone(out.state),after=clone(before);after.players[0].monsters[0].faceUp=true;
 const events=require('../dist/duelTransitions').transitionEvents(before,after);assert.ok(projectTransitionEvents(events).some(x=>x.type==='cardRevealed'&&x.uid==='hidden'));
});
test('the real store returns transition notifications without changing the persisted snapshot schema',()=>{
 const db=require('../dist/database').db,store=require('../dist/duelStore'),s=game();s.players[0].hand=[ref('normal')];db.prepare('INSERT INTO duels(id,guild_id,channel_id,status,revision,updated,state) VALUES(?,?,?,?,?,?,?)').run('events-store','g','c','playing',0,Date.now(),JSON.stringify(s));
 const ix=e.legalActions(s,'a').findIndex(a=>a.kind==='summon'&&a.position==='atk'),result=store.performDuelAction('events-store','a','g',0,ix);assert.ok(result.events.some(x=>x.type==='cardMoved'));assert.equal(result.state.events,undefined);assert.deepEqual(clone(store.getDuel('events-store').state),clone(result.state));
});
after(()=>{require('../dist/database').db.close();fs.rmSync(temp,{recursive:true,force:true});});
test('unsupported imported monster timing and costs remain staged rather than pretending to work',()=>{
 const c={...registry.engineCard('40640057'),id:'00000003'},effect={kind:'monsterEffect'};
 const variants=[
  {...getMonsterDefinition('40640057'),activation:{policy:'manual',window:'main'}},
  {...getMonsterDefinition('40640057'),effect:{trigger:'quick',operation:{kind:'draw',count:1}}},
  {activation:{policy:'mandatory',window:'flip'},effect:{trigger:'flip',cost:{kind:'discard',count:1},operation:{kind:'draw',count:1}}}
 ];
 for(const definition of variants){const r=buildCardRegistry([c],{[c.id]:effect},{},{monster:()=>definition});assert.equal(r.statuses.get(c.id).stage,'registered');assert.equal(r.enabled.length,0);}
});
test('NPC readiness rejects a card with metadata/definition when it is not admitted as playable',()=>{
 const script="process.argv.push('--require-complete');const r=require('./dist/effectRegistry');r.getPlayableCard=()=>undefined;require('./scripts/duel-readiness.cjs');";
 const out=child.spawnSync(process.execPath,['-e',script],{encoding:'utf8'});assert.equal(out.status,1);assert.equal(JSON.parse(out.stdout).complete,false);
});
test('activation models drive summon and declaration windows without erasing card-specific limits',()=>{
 const {effectActivationAllowed:allowed}=require('../dist/effectTiming');let s=game();s.turn=3;s.phase='response';s.pending={kind:'specialSummon',actor:0,card:'summoned'};
 assert.equal(allowed(s,1,getEffectModel('trapHole').activation),false);assert.equal(allowed(s,1,getEffectModel('bottomlessTrapHole').activation),true);assert.equal(allowed(s,0,getEffectModel('bottomlessTrapHole').activation),false);assert.equal(allowed(s,0,getEffectModel('torrentialTribute').activation),true);
 s.pending={kind:'attack',actor:0,card:'attacker',stage:'declare'};assert.equal(allowed(s,1,getEffectModel('mirrorForce').activation),true);s.pending.stage='damage';assert.equal(allowed(s,1,getEffectModel('mirrorForce').activation),false);
 const spell={...registry.engineCard('38199696'),id:'00000005'};assert.equal(buildCardRegistry([spell],{[spell.id]:{kind:'mirrorForce'}},{}).statuses.get(spell.id).stage,'registered');
});
