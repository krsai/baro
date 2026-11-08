import {SERVICE_FEATURES} from './serviceCompany.mjs';
import {resolveFeatureByPath} from './accessControl.js';
export function subscriberMenuBlueprint(nodes,orgType){
 const allowed=feature=>orgType==='SERVICE'?SERVICE_FEATURES.includes(feature):feature!=='FREIGHT';
 return nodes.flatMap(node=>{
  if(node.isParent){const children=subscriberMenuBlueprint(node.children||[],orgType);return children.length?[{...node,children}]:[];}
  const options=node.accessChildren?.filter(child=>allowed(resolveFeatureByPath(child.path,orgType)));
  if(node.accessChildren?.length)return options.length?[{...node,accessChildren:options}]:[];
  const feature=resolveFeatureByPath(node.path,orgType);
  return !feature||allowed(feature)?[node]:[];
 });
}
