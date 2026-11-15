import React from 'react';
import {useFormControl} from '@mui/material/FormControl';
import AppNotice from './AppNotice';

// Field labels and required marks stay in the form; validation uses the toast.
const FieldFeedback=React.forwardRef(function FieldFeedback({children},_ref){
 const control=useFormControl();
 return control?.error&&children?<AppNotice severity="error">{children}</AppNotice>:null;
});
export default FieldFeedback;
