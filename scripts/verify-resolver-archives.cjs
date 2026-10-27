#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../src/resolvers/v1'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.equal(manifest.originCommit,'7802a737212165c9a0100562e37cd8adc734b960');assert.equal(manifest.files.length,27);
const names=new Set(manifest.files.map(file=>file.path));assert.equal(names.size,27);
for(const file of manifest.files){assert.match(file.path,/^[A-Za-z0-9]+\.ts$/);const bytes=fs.readFileSync(path.join(root,file.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256,'Archived implementation changed: '+file.path);
 for(const match of bytes.toString('utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)){const name=match[1];assert.ok(name.startsWith('node:')||name.startsWith('./')&&names.has(name.slice(2)+'.ts'),'Unpinned archive dependency '+name);}
}
console.log('engine-v1: 27 immutable source modules verified');
