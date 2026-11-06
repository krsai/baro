// Display legacy amount-independent policies through the common condition editor.
// No settings are written until the user edits and saves.
export function ledgerApprovalBands(settings){
 if(settings.kind==='BANK_LEDGER'&&settings.version===2&&Array.isArray(settings.rules)&&settings.rules.length)return settings.rules;
 if(!Array.isArray(settings.registrationStages)||!settings.registrationStages.length)throw Error('INVALID_APPROVAL_SETTINGS');
 const scope=settings.drafterScope||{role:'ALL',gradeId:null};
 return ['USD','KRW','VND'].map(currency=>({id:'ledger-default-'+currency,name:'Ledger / '+currency,currency,min:'0',max:null,drafterRole:scope.role,drafterGradeId:scope.gradeId,stages:settings.registrationStages.map(stage=>({...stage}))}));
}
