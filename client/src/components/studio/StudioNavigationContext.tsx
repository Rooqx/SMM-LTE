import { createContext, useContext } from "react";

export interface StudioNavContextType {
  currentPath: string;
  navigate: (href: string) => void;
}

export const StudioNavContext = createContext<StudioNavContextType>({
  currentPath: "/",
  navigate: () => {},
});

export function useStudioNav(): StudioNavContextType {
  return useContext(StudioNavContext);
}
