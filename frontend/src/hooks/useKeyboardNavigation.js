import {useEffect} from 'react';
import {installKeyboardNavigation} from '../utils/formFocus.mjs';
export default function useKeyboardNavigation(){useEffect(()=>installKeyboardNavigation(),[]);}
