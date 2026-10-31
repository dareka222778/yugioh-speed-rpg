const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {inspectDatabase,passiveCheckpoint,main}=require('../scripts/sqlite-health.cjs');
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sqlite-health16-')),file=path.join(dir,'game.sqlite'),db=new DatabaseSync(file);
 try{db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE receipts(id TEXT PRIMARY KEY,payload TEXT); CREATE TABLE games(id TEXT PRIMARY KEY,state BLOB); INSERT INTO receipts VALUES('once','paid'); INSERT INTO games VALUES('active',X'010203');");fn(db,file);}finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}}
test('M16 health: consistent per-table counts and payload bytes without modifying game data',()=>fixture((db,file)=>{
 const before=db.prepare('SELECT * FROM receipts').all(),result=inspectDatabase(db,file);
 assert.deepEqual(result.tables,[{name:'games',rows:1,payloadBytes:9},{name:'receipts',rows:1,payloadBytes:8}]);
 assert.ok(result.files.wal>0);assert.ok(result.pageSize>0);assert.equal(result.totalBytes,result.files.main+result.files.wal+result.files.shm);
 assert.deepEqual(db.prepare('SELECT * FROM receipts').all(),before);assert.equal(result.warning,false);
 assert.equal(typeof result.pageUsage.available,'boolean');if(result.pageUsage.available)assert.ok(result.pageUsage.objects.some(o=>o.name==='receipts'&&o.bytes>0));else assert.match(result.pageUsage.reason,/not physical/);
}));
test('M16 health: disk budget alerts are configurable and do not delete receipts',()=>fixture((db,file)=>{
 assert.equal(inspectDatabase(db,file,{budgetBytes:1}).budgetExceeded,true);
 const size=inspectDatabase(db,file).totalBytes;
 assert.equal(inspectDatabase(db,file,{budgetBytes:size*2,warningRatio:0.4}).warning,true);
 assert.equal(db.prepare('SELECT count(*) n FROM receipts').get().n,1);
 for(const options of [{budgetBytes:0},{budgetBytes:NaN},{warningRatio:0},{warningRatio:1.1}])assert.throws(()=>inspectDatabase(db,file,options));
}));
test('M16 health: PASSIVE checkpoint preserves committed rows and reports completed frames',()=>fixture((db,file)=>{
 const result=passiveCheckpoint(db);assert.equal(result.mode,'PASSIVE');assert.equal(result.complete,true);assert.ok(result.logFrames>0);
 assert.equal(db.prepare('SELECT payload FROM receipts').get().payload,'paid');assert.equal(inspectDatabase(db,file).tables[0].rows,1);
}));
test('M16 health: pinned reader prevents full checkpoint until released',()=>fixture((db,file)=>{
 const reader=new DatabaseSync(file);try{
  reader.exec('BEGIN');reader.prepare('SELECT * FROM games').all();
  db.exec("INSERT INTO receipts VALUES('two','paid-again')");
  const blocked=passiveCheckpoint(db);assert.equal(blocked.complete,false);assert.ok(blocked.logFrames>blocked.checkpointedFrames);
  assert.equal(reader.prepare('SELECT count(*) n FROM receipts').get().n,1);reader.exec('COMMIT');
  assert.equal(passiveCheckpoint(db).complete,true);assert.equal(reader.prepare('SELECT count(*) n FROM receipts').get().n,2);
 }finally{reader.close();}
}));
test('M16 health: uncommitted writer is not observed or committed by diagnostics',()=>fixture((db,file)=>{
 const reader=new DatabaseSync(file);try{
  db.exec("BEGIN IMMEDIATE; INSERT INTO receipts VALUES('interrupted','must-not-commit')");
  assert.equal(inspectDatabase(reader,file).tables.find(t=>t.name==='receipts').rows,1);
  passiveCheckpoint(reader);assert.equal(db.prepare('SELECT count(*) n FROM receipts').get().n,2);db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT count(*) n FROM receipts').get().n,1);
 }finally{reader.close();}
}));
test('M16 health: CLI opens existing database read-only and rejects missing/invalid arguments',()=>fixture((db,file)=>{
 assert.equal(main([file]).checkpoint,null);assert.equal(main([file,'--checkpoint-passive']).checkpoint.mode,'PASSIVE');
 assert.equal(main([file,'--budget-bytes','1','--warning-ratio','0.5']).health.warning,true);
 assert.throws(()=>main([file,'--budget-bytes','invalid']));assert.throws(()=>main([file,'--warning-ratio','2']));
 assert.throws(()=>main([file+'.missing']));assert.equal(fs.existsSync(file+'.missing'),false);
 assert.throws(()=>main([]));assert.throws(()=>main([file,'--vacuum']));
}));
test('M16 health: quoted table/column names and empty tables are supported',()=>fixture((db,file)=>{
 db.exec('CREATE TABLE "odd""table"("odd""column" TEXT)');
 assert.deepEqual(inspectDatabase(db,file).tables.find(t=>t.name==='odd"table'),{name:'odd"table',rows:0,payloadBytes:0});
}));
test('M16 health: rolled-back mutations and persisted state survive checkpoint and reopen',()=>fixture((db,file)=>{
 db.exec("BEGIN; DELETE FROM games; DELETE FROM receipts; ROLLBACK;");passiveCheckpoint(db);
 const restored=new DatabaseSync(file,{readOnly:true});try{
  assert.equal(restored.prepare('SELECT id FROM games').get().id,'active');assert.equal(restored.prepare('SELECT payload FROM receipts').get().payload,'paid');
 }finally{restored.close();}
}));
