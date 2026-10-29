/** Read Node's own JUnit counters; never manufacture success from an exit code. */
function parseSummary(xml){const result={};for(const name of ['tests','suites','pass','fail','cancelled','skipped','todo']){const found=[...xml.matchAll(new RegExp('<!-- '+name+' (\\d+) -->','g'))];if(found.length!==1)throw Error('Missing or ambiguous Node test counter: '+name);const n=Number(found[0][1]);if(!Number.isSafeInteger(n))throw Error('Invalid Node test count');result[name]=n;}return result;}
module.exports={parseSummary};
