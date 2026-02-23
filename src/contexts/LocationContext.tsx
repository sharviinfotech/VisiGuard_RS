import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface LocationContextType {
  selectedLocationId: string;
  setSelectedLocationId: (id: string) => void;
}

const LocationContext = createContext<LocationContextType>({
  selectedLocationId: 'all',
  setSelectedLocationId: () => {},
});

export function LocationProvider({ children }: { children: ReactNode }) {
  const [selectedLocationId, setSelectedLocationIdState] = useState<string>(
    () => localStorage.getItem('selectedLocationId') || 'all'
  );

  const setSelectedLocationId = (id: string) => {
    setSelectedLocationIdState(id);
    localStorage.setItem('selectedLocationId', id);
    // Also fire a custom event for any legacy listeners
    window.dispatchEvent(new CustomEvent('locationChanged', { detail: { locationId: id } }));
  };

  // Sync from localStorage/custom event so all tabs update
  useEffect(() => {
    const handleLocationChanged = (e: CustomEvent) => {
      setSelectedLocationIdState(e.detail.locationId);
    };
    window.addEventListener('locationChanged', handleLocationChanged as EventListener);
    return () => window.removeEventListener('locationChanged', handleLocationChanged as EventListener);
  }, []);

  return (
    <LocationContext.Provider value={{ selectedLocationId, setSelectedLocationId }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocationContext);
}
