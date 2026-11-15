const listeners=new Set();
let observer,frame;
const notify=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=null;for(const listener of listeners)listener();});};
export function subscribeNoticeVisibility(listener){
 listeners.add(listener);
 if(!observer){observer=new MutationObserver(notify);observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['style','class','hidden','aria-hidden','inert']});document.addEventListener('visibilitychange',notify);window.addEventListener('focus',notify);}
 return()=>{listeners.delete(listener);if(!listeners.size){observer?.disconnect();observer=null;document.removeEventListener('visibilitychange',notify);window.removeEventListener('focus',notify);if(frame)cancelAnimationFrame(frame);frame=null;}};
}
export function noticeIsVisible(anchor){
 const parent=anchor?.parentElement;
 // aria-hidden/inert also mark the active page behind an open modal. Results
 // raised by that modal still belong to the active page and must be delivered.
 return !!parent&&document.visibilityState!=='hidden'&&!parent.closest('[hidden]')&&parent.getClientRects().length>0;
}
