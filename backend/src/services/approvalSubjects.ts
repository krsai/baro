// A menu owns its own policy namespace and document snapshots. Adding a subject
// never grants access to that menu or reuses expense documents/decisions.
export interface ApprovalSubject {key:string;menuPath:string|null;hasAmount:boolean;enabled:boolean;}
export const EXPENSE_APPROVAL_SUBJECT:ApprovalSubject={key:'EXPENSE',menuPath:'/outsourcing-record',hasAmount:true,enabled:true};
export const APPROVAL_SUBJECTS:ApprovalSubject[]=[EXPENSE_APPROVAL_SUBJECT,
 {key:'BANK_LEDGER',menuPath:'/bank-ledger',hasAmount:true,enabled:true},
 {key:'NON_FINANCIAL',menuPath:null,hasAmount:false,enabled:false}];
export const approvalPolicyNamespace=(subject:ApprovalSubject,orgId:number)=>subject.key==='EXPENSE'?`EXPENSE_APPROVAL_POLICY:${orgId}`:`APPROVAL_POLICY:${subject.key}:${orgId}`;
