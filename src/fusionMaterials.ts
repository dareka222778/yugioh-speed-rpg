/** A named Fusion recipe can use one material substitute, never two.
 * Exact material matches are consumed first, including repeated names. The
 * remaining unmatched material may replace exactly one named requirement.
 * The caller decides which currently available monsters have an effective
 * substitution effect (for example, face-up monster effects can be negated).
 */
export function fusionMaterialsMatch(
 recipe:readonly string[],
 materials:readonly string[],
 canSubstitute:(id:string)=>boolean
):boolean{
 if(!recipe.length||recipe.length!==materials.length)return false;
 const needed=[...recipe],unmatched:string[]=[];
 for(const id of materials){
  const index=needed.indexOf(id);
  if(index<0)unmatched.push(id);
  else needed.splice(index,1);
 }
 return needed.length===0||needed.length===1&&unmatched.length===1&&canSubstitute(unmatched[0]);
}
