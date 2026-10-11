import React from 'react';
import PartnerTransactionCosts from './PartnerTransactionCosts';
import { useLanguage } from '../../context/LanguageContext';
import { useAppActions } from '../../context/AppContext';
import { OUTSOURCING_REQUEST_TEXT } from '../../components/OutsourcingServiceDialog';

const OutsourcingRecordList = () => {
  const { languageCode } = useLanguage();
  const { navigateToPath } = useAppActions();
  const labels = OUTSOURCING_REQUEST_TEXT[languageCode] || OUTSOURCING_REQUEST_TEXT.ko;
  return <PartnerTransactionCosts onNewRequest={() => navigateToPath('/outsourcing-record/new', { label: labels.addCost })} onOpenHistorical={id => navigateToPath(`/outsourcing-record/${id}`, { label: labels.historical })} />;
};

export default OutsourcingRecordList;
