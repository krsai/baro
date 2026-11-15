import {closestCenter,pointerWithin} from '@dnd-kit/core';
const keyboardTargets=new WeakMap();
// The draggable's ref is stable across rerenders; its current payload is not.
const dragKey=active=>active?.data&&typeof active.data==='object'?active.data:null;
export function resetAssignmentKeyboardTarget(active){const key=dragKey(active);if(key)keyboardTargets.delete(key);}
export function assignmentDropEvent(event){
 if(event.activatorEvent?.type!=='keydown')return event;
 const key=dragKey(event.active),selected=key?keyboardTargets.get(key):null;
 const target=selected==null?null:event.collisions?.find(row=>row.id===selected)?.data?.droppableContainer;
 // dnd-kit's onDragOver callback precedes its asynchronous over-state update.
 // Commit the explicitly selected, currently measured target, never that old
 // over-state. Missing/removed/disabled targets cancel rather than substitute.
 const valid=target&&!target.disabled&&target.node.current?.isConnected&&target.node.current.getClientRects().length&&target.rect.current;
 return {...event,over:valid?{id:target.id,data:target.data,rect:target.rect.current,disabled:false}:null};
}

export function assignmentKeyboardCoordinates(event,{context,currentCoordinates}){
 if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.code))return;
 event.preventDefault();
 const targets=context.droppableContainers.getEnabled().filter(item=>
  ['factory-row','factory-slot','assignment-card','assignment-cancel'].includes(item.data.current?.dropMode)&&item.node.current?.getClientRects().length
 ).sort((a,b)=>{
  const ra=context.droppableRects.get(a.id),rb=context.droppableRects.get(b.id);
  return (ra?.top??0)-(rb?.top??0)||(ra?.left??0)-(rb?.left??0)||String(a.id).localeCompare(String(b.id));
 });
 if(!targets.length||!context.collisionRect)return;
 const key=dragKey(context.active),selected=key?keyboardTargets.get(key):null;
 const index=targets.findIndex(item=>item.id===(selected??context.over?.id));
 const next=event.code==='Home'?0:event.code==='End'?targets.length-1:index<0?0:Math.max(0,Math.min(targets.length-1,index+(['ArrowUp','ArrowLeft'].includes(event.code)?-1:1)));
 const target=targets[next],rect=context.droppableRects.get(target.id),active=context.collisionRect;
 if(!rect)return;
 if(key)keyboardTargets.set(key,target.id);
 return {x:currentCoordinates.x+rect.left+rect.width/2-active.left-active.width/2,y:currentCoordinates.y+rect.top+rect.height/2-active.top-active.height/2};
}

export function assignmentCollisionDetection(args){
 // Pointer behavior remains strictly pointer based. Keyboard drags have no
 // pointer coordinates, so the same drop handler needs a geometric target.
 if(!args.pointerCoordinates){
  const key=dragKey(args.active),selected=key?keyboardTargets.get(key):null;
  if(selected!=null){
   const target=args.droppableContainers.find(row=>row.id===selected);
   return target?[{id:target.id,data:{droppableContainer:target,value:0}}]:[];
  }
  return closestCenter(args);
 }
 const collisions=pointerWithin(args),activeId=String(args.active?.id||'');
 if(activeId.startsWith('assign-')||activeId.startsWith('card-')){
  const cancel=collisions.find(row=>String(row.id)==='assignment-cancel-drop');
  if(cancel)return [cancel,...collisions.filter(row=>row!==cancel)];
 }
 return collisions;
}
