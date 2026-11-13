/** Durable factual input projection: no images, effect text, network or DB. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {buildHistorical,outputs,verifySnapshot}=require('./import-historical.cjs');
const SNAPSHOT=path.resolve(__dirname,'../catalog/historical/2004-10-01'),REPLAY=path.resolve(__dirname,'../catalog/historical/replay-2004-10-01');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function projectInputs(cards,sets,selected){
 const keys=['id','cardType','passwords','attribute','type','level','atk','def','subcategory','monsterCardTypes','classifications'];
 const projected=cards.map(c=>{
  const out=Object.fromEntries((selected.has(c.id)?keys:['id','cardType']).filter(k=>Object.hasOwn(c,k)).map(k=>[k,c[k]]));
  if(selected.has(c.id)){out.text=Object.fromEntries(['en','pt','ja'].filter(l=>c.text?.[l]?.name).map(l=>[l,{name:c.text[l].name}]));out.externalIDs={};if(c.externalIDs?.dbID!=null)out.externalIDs.dbID=c.externalIDs.dbID;if(c.externalIDs?.ygoprodeck?.id!=null)out.externalIDs.ygoprodeck={id:c.externalIDs.ygoprodeck.id};}return out;
 });
 const index=new Map(cards.map((c,i)=>[c.id,i])),unknownReferences=[];
 const products=sets.map(p=>({id:p.id,name:Object.fromEntries(['en','ja'].filter(l=>p.name?.[l]).map(l=>[l,p.name[l]])),locales:Object.fromEntries(Object.entries(p.locales??{}).map(([l,v])=>[l,Object.fromEntries(['date','formats'].filter(k=>Object.hasOwn(v,k)).map(k=>[k,v[k]]))])),contents:p.contents.map(b=>({...Object.fromEntries(['locales','formats'].filter(k=>Object.hasOwn(b,k)).map(k=>[k,b[k]])),cardIndices:b.cards.map(c=>{if(!index.has(c.card)){index.set(c.card,projected.length+unknownReferences.length);unknownReferences.push(c.card);}return index.get(c.card);})}))}));
 return {schema:1,cards:projected,sets:products,unknownReferences};
}
function expandInputs(projection){
 if(projection.schema!==1||!Array.isArray(projection.cards)||!Array.isArray(projection.sets)||!Array.isArray(projection.unknownReferences))throw Error('Invalid factual replay input');
 const references=[...projection.cards.map(c=>c.id),...projection.unknownReferences];
 return {cards:projection.cards,sets:projection.sets.map(p=>({...p,contents:p.contents.map(b=>{const {cardIndices,...rest}=b;if(!Array.isArray(cardIndices)||cardIndices.some(i=>!Number.isSafeInteger(i)||i<0||i>=references.length))throw Error('Invalid replay reference index');return {...rest,cards:cardIndices.map(i=>({card:references[i]}))};})}))};
}
function compareReplay(projection,snapshot=SNAPSHOT){
 verifySnapshot(snapshot);const input=expandInputs(projection),report=JSON.parse(fs.readFileSync(path.join(snapshot,'audit.json'))),result=buildHistorical(input.cards,input.sets,{source:report.source,start:report.window.start,cutoff:report.window.cutoff});
 for(const [file,expected]of Object.entries(outputs(result)))if(fs.readFileSync(path.join(snapshot,file),'utf8')!==expected)throw Error('Replay differs from frozen snapshot: '+file);
 return {status:'reproduced-byte-for-byte',...result.report.counts,inputCards:input.cards.length,inputProducts:input.sets.length};
}
function createReplay(cardsPath,setsPath){
 verifySnapshot(SNAPSHOT);const report=JSON.parse(fs.readFileSync(path.join(SNAPSHOT,'audit.json'))),sourceManifest=JSON.parse(fs.readFileSync(path.join(SNAPSHOT,'manifest.json')));
 const read=(file,proof)=>{const raw=fs.readFileSync(file);if(hash(raw)!==proof.sha256||raw.length!==proof.bytes)throw Error('Raw source differs from pinned input');try{return JSON.parse(raw.toString('utf8'));}catch{throw Error('Invalid raw aggregate JSON');}};
 const cards=read(cardsPath,report.source.inputs.cards),sets=read(setsPath,report.source.inputs.sets),selected=new Set(JSON.parse(fs.readFileSync(path.join(SNAPSHOT,'cards.json'))).map(c=>c.id)),projection=projectInputs(cards,sets,selected);
 const result=compareReplay(projection),encoded=zlib.gzipSync(Buffer.from(JSON.stringify(projection))).toString('base64')+'\n';
 const proof={schema:1,note:'Lossless projection of fields used for this fixed historical audit; full raw files are not reconstructed. No art/effect text is retained.',rawInputs:report.source.inputs,snapshotFiles:sourceManifest.files,archiveSHA256:hash(Buffer.from(encoded)),archiveBytes:Buffer.byteLength(encoded)};
 const files={'source.json.gz.b64':encoded,'manifest.json':JSON.stringify(proof,null,2)+'\n'};
 if(fs.existsSync(REPLAY)){if(Object.entries(files).every(([f,v])=>fs.existsSync(path.join(REPLAY,f))&&fs.readFileSync(path.join(REPLAY,f),'utf8')===v))return {...result,archive:'unchanged'};throw Error('Replay directory differs; no overwrite allowed');}
 const stage=fs.mkdtempSync(path.join(path.dirname(REPLAY),'.replay-stage-'));try{for(const [f,v]of Object.entries(files))fs.writeFileSync(path.join(stage,f),v,{flag:'wx'});fs.renameSync(stage,REPLAY);}finally{if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true,force:true});}
 return {...result,archive:'created',archiveBytes:Buffer.byteLength(encoded)};
}
function verifyReplay(){
 const proof=JSON.parse(fs.readFileSync(path.join(REPLAY,'manifest.json'))),snapshot=JSON.parse(fs.readFileSync(path.join(SNAPSHOT,'manifest.json'))),file=path.join(REPLAY,'source.json.gz.b64');if(fs.statSync(file).size>8*1024*1024)throw Error('Replay archive exceeds size limit');const encoded=fs.readFileSync(file);
 if(proof.schema!==1||hash(encoded)!==proof.archiveSHA256||encoded.length!==proof.archiveBytes||JSON.stringify(proof.rawInputs)!==JSON.stringify(snapshot.source.inputs)||JSON.stringify(proof.snapshotFiles)!==JSON.stringify(snapshot.files))throw Error('Replay archive/provenance checksum mismatch');
 const raw=zlib.gunzipSync(Buffer.from(encoded.toString('utf8').trim(),'base64'),{maxOutputLength:64*1024*1024});return compareReplay(JSON.parse(raw.toString('utf8')));
}
if(require.main===module){try{const a=process.argv.slice(2);const result=a.length===0||a.length===1&&a[0]==='--verify'?verifyReplay():a.length===5&&a[0]==='--create'&&a[1]==='--cards'&&a[3]==='--sets'?createReplay(a[2],a[4]):(()=>{throw Error('Use --verify or --create --cards cards.json --sets sets.json');})();console.log(JSON.stringify(result,null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={projectInputs,expandInputs,verifyReplay};
