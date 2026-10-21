import {createContext,useContext} from 'react';

// MainLayout owns the menu definition. The policy editor reads the same live
// tree before role filtering, including groups inaccessible to the SYSTEM user.
export const MenuBlueprintContext=createContext([]);
export const useMenuBlueprint=()=>useContext(MenuBlueprintContext);
