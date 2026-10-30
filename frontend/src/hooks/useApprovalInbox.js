import {useEffect,useState} from 'react';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';
export default function useApprovalInbox(orgId,view='pending',enabled=true){
 const scope=`${orgId}:${view}:${enabled}`;
 const [result,setResult]=useState(null),[reload,setReload]=useState(0);
 useEffect(()=>subscribeWorkspaceDataChanged(detail=>{if(Number(detail.orgId)===Number(orgId)&&detail.topics?.includes('expense-approvals'))setReload(value=>value+1);}),[orgId]);
 useEffect(()=>{if(!orgId||!enabled){setResult({scope,rows:[],loading:false,error:false});return;}let alive=true;const controller=new AbortController();setResult({scope,rows:[],loading:true,error:false});
  requestJSON('/expense-approval-inbox'+buildQueryString({orgId,view}),{skipCache:true,signal:controller.signal}).then(rows=>{if(alive)setResult({scope,rows,loading:false,error:false});}).catch(error=>{if(alive&&error.name!=='AbortError')setResult({scope,rows:[],loading:false,error:true});});
  return()=>{alive=false;controller.abort();};
 },[orgId,view,enabled,scope,reload]);
 return {...(result?.scope===scope?result:{rows:[],loading:enabled,error:false}),refresh:()=>setReload(value=>value+1)};
}
