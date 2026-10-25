/** Local Discord message contracts, including constraints not checked by builders. */
export function validateDiscordPayload<T extends Record<string,any>>(payload:T):T{
 const json=(x:any)=>typeof x?.toJSON==='function'?x.toJSON():x;
 if(payload.content!==undefined&&payload.content!==null&&(typeof payload.content!=='string'||payload.content.length>2000))throw new Error('Mensagem excede o limite de texto do Discord.');
 const embeds=(payload.embeds??[]).map(json);if(embeds.length>10)throw new Error('Quantidade de embeds inválida.');
 let text=0;for(const e of embeds){for(const v of [e.title,e.description,e.footer?.text,e.author?.name,...(e.fields??[]).flatMap((f:any)=>[f.name,f.value])])text+=String(v??'').length;
  if((e.title?.length??0)>256||(e.description?.length??0)>4096||(e.fields?.length??0)>25||(e.footer?.text?.length??0)>2048||(e.fields??[]).some((f:any)=>!f.name||!f.value||f.name.length>256||f.value.length>1024))throw new Error('Embed fora dos limites do Discord.');
 }
 if(text>6000)throw new Error('Os embeds excedem 6000 caracteres.');
 const rows=(payload.components??[]).map(json),ids=new Set<string>();if(rows.length>5)throw new Error('Painel excede cinco linhas.');
 for(const row of rows){if(row.type!==1||!Array.isArray(row.components)||!row.components.length||row.components.length>5)throw new Error('Linha de componentes inválida.');
  for(const c of row.components){
   if(c.custom_id!==undefined){if(typeof c.custom_id!=='string'||!c.custom_id.length||c.custom_id.length>100||ids.has(c.custom_id))throw new Error('Painel contém identificador repetido ou inválido.');ids.add(c.custom_id);}
   if(c.type===3){if(row.components.length!==1||!c.options?.length||c.options.length>25||new Set(c.options.map((o:any)=>o.value)).size!==c.options.length||c.options.some((o:any)=>!o.label||o.label.length>100||typeof o.value!=='string'||!o.value.length||o.value.length>100))throw new Error('Menu de opções inválido.');}
  }
 }
 return payload;
}
