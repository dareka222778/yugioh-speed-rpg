// A historical printing is real, but its existence alone cannot enable a card.
// Select from the frozen catalog, independently of the policy under test.
const rows=require('../catalog/historical/2004-10-01/cards.json');
const manifest=require('../catalog/engine-v9/manifest.json');
const active=new Set(require('../catalog/engine-v9/'+manifest.current+'.json').cards.map(c=>c.id));
module.exports=rows.find(c=>c.passwords.length&&!c.passwords.some(id=>active.has(id)))?.passwords[0]??'00000000';
