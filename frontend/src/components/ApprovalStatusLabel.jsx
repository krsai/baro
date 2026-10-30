import React from 'react';
import StatusLabel from './StatusLabel';
import {approvalWorkflowText,approvalStatusTone} from '../constants/approvalWorkflow';
export default function ApprovalStatusLabel({status='NOT_REQUESTED',languageCode}){const t=approvalWorkflowText[languageCode]||approvalWorkflowText.en;return <StatusLabel data-approval-status={status} tone={approvalStatusTone(status)} label={t.statuses[status]||t.statuses.NOT_REQUESTED}/>;}
