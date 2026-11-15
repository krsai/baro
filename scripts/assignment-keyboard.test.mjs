import test from 'node:test';
import assert from 'node:assert/strict';
import {assignmentCollisionDetection,assignmentKeyboardCoordinates,resetAssignmentKeyboardTarget,assignmentDropEvent} from '../frontend/src/utils/assignmentKeyboard.mjs';
test('keyboard targeting works without a pointer while pointer drops outside all targets stay empty',()=>{
 const rect={left:100,top:100,width:100,height:40,right:200,bottom:140},target={id:'factory',data:{current:{dropMode:'factory-row'}}};
 const args={active:{id:'card-a'},droppableContainers:[target],droppableRects:new Map([['factory',rect]]),collisionRect:rect,pointerCoordinates:null};
 assert.equal(assignmentCollisionDetection(args)[0].id,'factory');
 assert.deepEqual(assignmentCollisionDetection({...args,pointerCoordinates:{x:10,y:10}}),[]);
});
test('keyboard target navigation excludes hidden targets and places the card center at the selected insertion slot',()=>{
 let scrolled=0;
 const make=(id,dropMode,visible=true)=>({id,data:{current:{dropMode}},node:{current:{getClientRects:()=>visible?[{}]:[],scrollIntoView:()=>scrolled++}}});
 const targets=[make('factory','factory-row'),make('hidden','factory-row',false),make('slot','factory-slot')];
 const context={droppableContainers:{getEnabled:()=>targets},droppableRects:new Map([['factory',{left:100,top:100,width:100,height:40}],['slot',{left:100,top:150,width:100,height:10}]]),over:{id:'factory'},collisionRect:{left:0,top:0,width:20,height:20}};
 const result=assignmentKeyboardCoordinates({code:'ArrowDown',preventDefault(){}},{context,currentCoordinates:{x:0,y:0}});
 assert.deepEqual(result,{x:140,y:145});assert.equal(scrolled,0,'scrolling is owned by the keyboard sensor');
});
test('a keyboard-picked insertion target survives viewport scrolling and rapid keys, but never changes pointer drop rules',()=>{
 const active={id:'card-a',data:{current:{}}},node={isConnected:true,getClientRects:()=>[{}]},targets=['a','b'].map((id,i)=>({id,node:{current:node},rect:{current:{}},data:{current:{dropMode:'factory-slot'}}}));
 const context={active,droppableContainers:{getEnabled:()=>targets},droppableRects:new Map(targets.map((row,i)=>[row.id,{left:200,top:100+i*100,width:100,height:10}])),over:{id:'source'},collisionRect:{left:0,top:0,width:300,height:200}};
 const press=code=>assignmentKeyboardCoordinates({code,preventDefault(){}},{context,currentCoordinates:{x:0,y:0}});
 press('Home');press('ArrowDown');
 active.data.current={updated:true};
 const args={active,pointerCoordinates:null,droppableContainers:targets,droppableRects:context.droppableRects,collisionRect:{left:-200,top:-500,width:300,height:200}};
 assert.equal(assignmentCollisionDetection(args)[0].id,'b');
 const pointerEvent={active,over:{id:'source'},collisions:assignmentCollisionDetection(args),activatorEvent:{type:'pointerdown'}};
 assert.equal(assignmentDropEvent(pointerEvent),pointerEvent);
 assert.equal(assignmentDropEvent({...pointerEvent,activatorEvent:{type:'keydown'}}).over.id,'b');
 assert.equal(assignmentDropEvent({...pointerEvent,collisions:[],activatorEvent:{type:'keydown'}}).over,null);
 assert.deepEqual(assignmentCollisionDetection({...args,pointerCoordinates:{x:-100,y:-100}}),[]);
 assert.deepEqual(assignmentCollisionDetection({...args,droppableContainers:[targets[0]]}),[],'a removed target cannot silently become a different target');
 resetAssignmentKeyboardTarget(active);assert.notEqual(assignmentCollisionDetection(args)[0].id,'b');
});
