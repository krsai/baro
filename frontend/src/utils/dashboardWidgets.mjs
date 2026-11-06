export function normalizeDashboardWidgets(value,widgets){
 const allowed=new Set(widgets.map(widget=>widget.id)),seen=new Set();
 return (Array.isArray(value)?value:widgets.map(({id,width='half'})=>({id,width})))
  .filter(item=>item&&allowed.has(item.id)&&!seen.has(item.id)&&seen.add(item.id))
  .map(item=>({id:item.id,width:item.width==='full'?'full':'half'}));
}
export function moveDashboardWidget(layout,activeId,overId){
 const from=layout.findIndex(item=>item.id===activeId),to=layout.findIndex(item=>item.id===overId);
 if(from<0||to<0||from===to)return layout;
 const next=[...layout], [item]=next.splice(from,1);next.splice(to,0,item);return next;
}
export const dashboardWidgetStorageKey=(companyId,userId)=>`dashboard-widgets:v1:${encodeURIComponent(companyId??'system')}:${encodeURIComponent(userId??'session')}`;
