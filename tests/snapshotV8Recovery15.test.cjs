const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Database=require('better-sqlite3');
const tool=require('../scripts/sqlite-snapshot.cjs'),facade=require('../dist/duelEngine');
test('v8 candidate: SQLite online backup retains catalog, pinned pending state and deterministic continuation',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'v8-snapshot15-')),source=path.join(root,'source.sqlite'),db=new Database(source);
 try{
  const engine=facade.getArchivedDefinitionResolver('engine-v8'),cards=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
  let s=engine.createDuel([{id:'a',name:'A',cards},{id:'b',name:'B',cards}],undefined,0,{randomSeed:'15'.repeat(32)});s.turn=3;s.players[0].hand=[{uid:'heal',id:'38199696'}];s.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}];
  const action=facade.legalActions(s,'a').find(a=>a.kind==='spell');assert.ok(action);s=facade.step(s,'a',action);assert.equal(s.phase,'response');
  db.pragma('journal_mode=WAL');db.exec('CREATE TABLE saves(id INTEGER PRIMARY KEY,state TEXT)');db.prepare('INSERT INTO saves VALUES(1,?)').run(JSON.stringify(s));
  const saved=await tool.snapshot(source,root);assert.equal(saved.manifest.resolverManifests['engine-v8'].length,64);assert.deepEqual(saved.manifest.catalogVersions,['engine-v7','engine-v8']);
  const destination=path.join(root,'restored.sqlite');tool.restore(saved.folder,destination);const restored=new Database(destination,{readonly:true});let copy;try{copy=JSON.parse(restored.prepare('SELECT state FROM saves WHERE id=1').get().state);}finally{restored.close();}
  assert.deepEqual(copy,s);const pass={kind:'pass'},actor=s.players[facade.decisionPlayer(s)].id;assert.deepEqual(facade.step(copy,actor,pass),facade.step(s,actor,pass));
  const manifest=require('../catalog/engine-v8/manifest.json'),artifact=path.join(saved.folder,'catalog/engine-v8',manifest.revisions[0].file),bytes=fs.readFileSync(artifact);
  fs.appendFileSync(artifact,' ');assert.throws(()=>tool.verify(saved.folder),/Catalog/);fs.writeFileSync(artifact,bytes);assert.equal(tool.verify(saved.folder).integrity,'ok');
 }finally{db.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('snapshot compatibility: format-1 backups containing only v7 catalogs remain restorable',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'v7-snapshot15-')),source=path.join(root,'source.sqlite'),db=new Database(source);
 try{db.exec('CREATE TABLE audit(id INTEGER PRIMARY KEY);INSERT INTO audit VALUES(1)');const saved=await tool.snapshot(source,root),file=path.join(saved.folder,'manifest.json'),m=JSON.parse(fs.readFileSync(file));
  delete m.catalogVersions;delete m.resolverManifests['engine-v8'];for(const key of Object.keys(m.catalogArtifacts))if(key.startsWith('catalog/engine-v8/'))delete m.catalogArtifacts[key];fs.writeFileSync(file,JSON.stringify(m));
  assert.equal(tool.verify(saved.folder).integrity,'ok');tool.restore(saved.folder,path.join(root,'restored.sqlite'));
 }finally{db.close();fs.rmSync(root,{recursive:true,force:true});}
});
