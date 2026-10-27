const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const e=require('../dist/duelEngine'),archive=require('../dist/resolverArchive'),r=require('../dist/effectRegistry'),{starterContents}=require('../dist/cardCatalog'),{assertDuelState,assertDuelTransition}=require('../dist/duelIntegrity');
const legacy=archive.getArchivedDefinitionResolver('engine-v1'),cards=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id)),players=[{id:'a',name:'A',cards},{id:'b',name:'B',cards}];
const restore=s=>JSON.parse(JSON.stringify(s));
test('REA-L02: legacy saves select archived executable rules, new duels explicitly select v5',()=>{
 const old=legacy.createDuel(players,()=>.5),current=e.createDuel(players,()=>.5);assert.equal(old.resolverVersion,undefined);assert.equal(current.resolverVersion,'engine-v6');
 const raw=JSON.stringify(old),pinned=archive.pinLegacyResolver(old);assert.equal(pinned.resolverVersion,'engine-v1');delete pinned.resolverVersion;assert.deepEqual(pinned,old);assert.equal(JSON.stringify(old),raw);
 assert.throws(()=>archive.pinLegacyResolver(current),/rebaixar/);
 const action=e.legalActions(old,'a')[0];assert.deepEqual(e.step(restore(old),'a',action),legacy.step(restore(old),'a',action));
});
test('REA-L02: pending effects retain archived amounts when current definitions change',()=>{
 const id=r.engineCatalog.find(c=>r.getEffect(c.id)?.kind==='heal').id,currentEffect=r.getEffect(id),original=currentEffect.amount;
 function pending(engine){let s=engine.createDuel(players,()=>.5);s.turn=3;s.players[0].hand=[{uid:'heal',id}];s.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}];return engine.step(s,'a',engine.legalActions(s,'a').find(a=>a.kind==='spell'));}
 const old=restore(pending(legacy)),newer=restore(pending(e));assert.equal(old.phase,'response');
 const settle=s=>{for(let n=0;s.phase==='response';n++){assert.ok(n<10);s=e.step(restore(s),s.players[e.decisionPlayer(s)].id,{kind:'pass'});}return s;};
 try{currentEffect.amount=original+123;assert.equal(settle(old).players[0].lp,4000+original);assert.equal(settle(newer).players[0].lp,4000+original);assert.equal(settle(pending(e)).players[0].lp,4000+original);
  const exposed=legacy.getEffect(id);exposed.amount=99999;assert.equal(legacy.getEffect(id).amount,original);
 }finally{currentEffect.amount=original;}
});
test('archived replay is deterministic across JSON interruption and refuses version substitution',()=>{
 let a=legacy.createDuel(players,undefined,0,{randomSeed:'ab'.repeat(32)}),b=restore(a);
 for(let n=0;n<40&&a.phase!=='finished';n++){const actor=a.players[e.decisionPlayer(a)].id,actions=e.legalActions(a,actor),action=actions.find(x=>x.kind==='end')??actions[0];a=e.step(a,actor,action);b=e.step(restore(b),actor,action);assert.deepEqual(restore(a),restore(b));}
 for(const version of ['future',null,3]){const bad={...a,resolverVersion:version};assert.throws(()=>assertDuelState(bad),/incompatível/);assert.throws(()=>e.legalActions(bad,'a'),/incompatível/);}
 const newState=e.createDuel(players,()=>.5);assert.throws(()=>assertDuelTransition(newState,{...newState,resolverVersion:'engine-v1'}),/resolvedor/);
});
test('archived source closure and hashes cannot silently follow current implementations',()=>{
 const root=path.resolve(__dirname,'../src/resolvers/v1'),manifest=require('../src/resolvers/v1/manifest.json');assert.equal(manifest.files.length,27);
 for(const file of manifest.files){assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file.path))).digest('hex'),file.sha256);}
});
