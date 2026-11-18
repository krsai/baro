let approvedUntil=0;
// All registered form guards may observe the same beforeunload event. Keep a
// short approval window rather than consuming approval in its first listener.
export const isConfirmedReload=()=>performance.now()<approvedUntil;
export const reloadAfterConfirmation=(reload=()=>window.location.reload())=>{
 approvedUntil=performance.now()+1000;
 reload();
};
