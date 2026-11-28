const {test}=require('node:test');
const assert=require('node:assert/strict');
const {archetypeCard}=require('../dist/cardIdentity');
const {engineCard}=require('../dist/effectRegistry');

test('Cyber Saurus is not a Cyber card despite its printed name',()=>{
 const saurus=engineCard('89112729');
 assert.ok(saurus);
 assert.equal(archetypeCard(saurus,'Cyber'),false);
 assert.equal(archetypeCard({...saurus,excludedArchetypes:[]},'Cyber'),true);
});
