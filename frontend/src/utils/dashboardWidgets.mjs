export function normalizeDashboardWidgets(value,widgets){
 const allowed=new Set(widgets.map(widget=>widget.id)),seen=new Set();
 return (Array.isArray(value)?value:widgets.map(({id,width='half'})=>({id,width})))
  .filter(item=>item&&allowed.has(item.id)&&!seen.has(item.id)&&seen.add(item.id))
  .map(item=>{const widget=widgets.find(widget=>widget.id===item.id);return {id:item.id,width:item.width==='full'?'full':'half',...(widget.options?.length?{settings:Object.fromEntries(widget.options.map(option=>[option.id,item.settings?.[option.id]!==false]))}:{})};});
}
export function moveDashboardWidget(layout,activeId,overId){
 const from=layout.findIndex(item=>item.id===activeId),to=layout.findIndex(item=>item.id===overId);
 if(from<0||to<0||from===to)return layout;
 const next=[...layout], [item]=next.splice(from,1);next.splice(to,0,item);return next;
}
export const dashboardWidgetStorageKey=(companyId,userId)=>`dashboard-widgets:v1:${encodeURIComponent(companyId??'system')}:${encodeURIComponent(userId??'session')}`;
export function resolveDashboardWidgetLayout(savedValue,widgets){
 const rawItems=savedValue?.items;
 const migrated=savedValue?.legacy&&rawItems?.length?[...rawItems.map(item=>item?.id==='production-excess'?{...item,id:'suspected-errors'}:item),...widgets.filter(widget=>widget.newDefault&&!rawItems.some(item=>item?.id===widget.id||widget.id==='suspected-errors'&&item?.id==='production-excess')).map(({id,width='half'})=>({id,width}))]:rawItems;
 const additions=Array.isArray(migrated)&&migrated.length?widgets.filter(widget=>widget.defaultTag&&!savedValue?.defaultsApplied?.includes(widget.defaultTag)&&!migrated.some(item=>item.id===widget.id)).map(({id,width='half'})=>({id,width})):[];
 return normalizeDashboardWidgets(Array.isArray(migrated)?[...migrated,...additions]:migrated,widgets);
}
