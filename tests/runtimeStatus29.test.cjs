const {test}=require('node:test'),assert=require('node:assert/strict');
const {runtimeStatus,runtimeStatusLine,runtimePingText}=require('../dist/runtimeStatus');
const {CURRENT_RESOLVER_VERSION,getArchivedDefinitionResolver}=require('../dist/resolverArchive');
const {currentCatalogRevision,getCatalogData}=require('../dist/catalogArchive');
const {releasedCardIds}=require('../dist/releasedCardIds');
const {runCatalog}=require('../dist/catalogRuntime');
test('runtime identity reports the actual active resolver, catalog and unique authorized cohort without opening SQLite',()=>{
 const s=runtimeStatus(),ids=getArchivedDefinitionResolver(CURRENT_RESOLVER_VERSION).IMPLEMENTED_DUEL_CARDS;
 assert.equal(s.engine,CURRENT_RESOLVER_VERSION);assert.equal(s.catalog,currentCatalogRevision(CURRENT_RESOLVER_VERSION));assert.equal(s.certified,new Set(ids).size);assert.equal(s.distributable,ids.filter(id=>releasedCardIds.has(id)).length);assert.equal(s.release,require('../package.json').version);
});
test('public ping and startup both expose actual engine/catalog counts instead of the obsolete 130-card literal',()=>{
 const s=runtimeStatus();for(const line of [runtimeStatusLine(),runtimePingText()]){assert.ok(line.includes(s.engine));assert.ok(line.includes(s.catalog.slice(0,12)));assert.ok(line.includes(`${s.certified} cartas habilitadas`));assert.ok(line.includes(`${s.distributable} autorizadas para distribuição`));assert.ok(line.includes('mão 6'));assert.ok(line.includes('Adicional 5'));}
});
test('inspecting an archived v7 catalog cannot change the current public runtime identity or its distribution count',()=>{
 const expected=runtimeStatus(),revision=currentCatalogRevision('engine-v7');
 runCatalog(revision,getCatalogData(revision,'engine-v7'),()=>assert.deepEqual(runtimeStatus(),expected));assert.deepEqual(runtimeStatus(),expected);
});

const fs=require('node:fs'),crypto=require('node:crypto'),{strip,runtimeImport}=require('../scripts/mission29-reviewed-extensions.cjs');
const bootstrap=()=>fs.readFileSync('src/index.ts');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const baseline=require('../docs/evidence/mission8-preserved-baseline.json').files.find(f=>f.path==='src/index.ts').sha256;
test('reviewed identity substitutions reconstruct the exact original bootstrap preservation hash',()=>{assert.equal(hash(strip('src/index.ts',bootstrap())),baseline);});
test('normalization cannot conceal an unrelated bootstrap edit or touch archived resolvers',()=>{const changed=Buffer.from(bootstrap().toString().replace("setName('ping')","setName('unexpected')"));assert.notEqual(hash(strip('src/index.ts',changed)),baseline);assert.equal(strip('src/resolvers/v8/duelEngineCurrent.ts',changed),changed);});
test('normalization rejects duplicate hooks and any dependency before dotenv',()=>{const source=bootstrap().toString();assert.throws(()=>strip('src/index.ts',Buffer.from(source.replace(runtimeImport,runtimeImport+runtimeImport))));assert.throws(()=>strip('src/index.ts',Buffer.from(runtimeImport+source.replace(runtimeImport,''))),/dotenv must remain first/);});
