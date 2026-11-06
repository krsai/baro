import React from 'react';
import { createRoot } from 'react-dom/client';
import SearchableSelect from '../src/components/SearchableSelect';
const options = [
  ...Array.from({ length: 4 }, (_, i) => ({ id: `am-${i}`, name: 'AM01622' })),
  { id: 'am2', name: 'AM02058' }, { id: 'am3', name: 'AM02062' },
  { id: 'urd1', name: 'TKD CREW TEE(URD)' }, { id: 'urd2', name: 'TKD TRAINING PANTS(URD)' },
];
function Fixture(){const [value,setValue]=React.useState(null);return <SearchableSelect
  label="Style" value={value} onChange={(_event,next)=>setValue(next)} options={options} autoSelect={false} autoHighlight openOnFocus
  selectOnFocus clearOnBlur={false} getOptionLabel={o => o.name}
  getOptionKey={o => o.id}
  filterOptions={(items, state) => items.filter(o => o.name.toLowerCase().includes(state.inputValue.toLowerCase()))}
/>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
