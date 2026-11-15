export const NOTIFICATION_EVENT='baro:notification';
export function notifyGlobally(message,type='warning'){
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT,{detail:{message,type}}));
}
