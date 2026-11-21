export const navigationNodeId=node=>node.menuGroupKey&&node.isParent?`group:${node.menuGroupKey}`:`path:${node.path}`;

// Stable fallback retains new/unknown menus; permissions and parentage are untouched.
export function applyNavigationOrder(nodes,order={},parent='root'){
 const ranks=new Map((order[parent]||[]).map((id,index)=>[id,index]));
 return nodes.map((node,index)=>({node,index})).sort((a,b)=>(ranks.get(navigationNodeId(a.node))??1e6)-(ranks.get(navigationNodeId(b.node))??1e6)||a.index-b.index).map(({node})=>node.children?{...node,children:applyNavigationOrder(node.children,order,navigationNodeId(node))}:node);
}

export function moveNavigationNode(nodes,order,parent,id,delta){
 const findParent=items=>{for(const node of items){if(navigationNodeId(node)===parent)return node;const match=findParent(node.children||[]);if(match)return match;}return null;};
 const siblings=parent==='root'?nodes:findParent(nodes)?.children||[];
 const ids=siblings.map(navigationNodeId),index=ids.indexOf(id),target=index+delta;
 if(index<0||target<0||target>=ids.length)return order;
 [ids[index],ids[target]]=[ids[target],ids[index]];
 return {...order,[parent]:ids};
}
