#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
for(const [version,origin,count]of [['v1','7802a737212165c9a0100562e37cd8adc734b960',27],['v2','c02e1cdee7f513e5494c579da660795a02341f49',31],['v3','d185c098ec90a69967b92527a1afe3a3c0e50d21',32],['v4','06388402b1e304ae045b3bbeffd7fa0e9a7644ac',33],['v5','6cf78e612a04254a0ddb43bb5752cabe394c2063',34],['v6','02405e4570d180a3aec002a1a4fcc672c69c39cd',35],['v7','1bbbdd3847b9455febabffc2351456982df438a6',39]]){
const root=path.resolve(__dirname,'../src/resolvers/'+version),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.equal(manifest.originCommit,origin);assert.equal(manifest.files.length,count);
const names=new Set(manifest.files.map(file=>file.path));assert.equal(names.size,count);
for(const file of manifest.files){assert.match(file.path,/^[A-Za-z0-9]+\.ts$/);const bytes=fs.readFileSync(path.join(root,file.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256,'Archived implementation changed: '+file.path);
 for(const match of bytes.toString('utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)){const name=match[1];assert.ok(name.startsWith('node:')||name.startsWith('./')&&names.has(name.slice(2)+'.ts'),'Unpinned archive dependency '+name);}
}
console.log('engine-'+version+': '+count+' immutable source modules verified');
}
