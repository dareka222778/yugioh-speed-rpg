/** Generic chain resolution. Links resolve last-in, first-out.
 * Costs are paid on activation (outside this resolver); negating a link
 * prevents its effect, but never refunds a previously paid cost.
 */
export type ChainLink = {actor:number;card:string;id:string;target:string;negated?:boolean};
export function resolveChainLinks<T extends ChainLink>(
 links:readonly T[],
 apply:(link:T)=>void,
 onNegated?:(link:T)=>void
):void {
 for(let i=links.length-1;i>=0;i--){
  const link=links[i];
  if(link.negated){onNegated?.(link);continue;}
  apply(link);
 }
}
export function negateChainLink<T extends ChainLink>(links:readonly T[],cardUid:string):T[]{
 const index=links.findIndex(link=>link.card===cardUid);
 if(index<0)throw new Error('Chain link not found.');
 return links.map((link,i)=>i===index?{...link,negated:true}:link);
}
