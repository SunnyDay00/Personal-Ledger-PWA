
import { AppState } from '../types';
import { DEFAULT_SETTINGS } from '../constants';

const STORAGE_KEY = 'ledger_app_v1';

export const saveState = (state: AppState) => {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serializedState);
  } catch (err) {
    console.error('Could not save state', err);
  }
};

export const loadState = (): AppState | undefined => {
  try {
    const serializedState = localStorage.getItem(STORAGE_KEY);
    if (serializedState === null) {
      return undefined;
    }
    const loadedState = JSON.parse(serializedState);
    
    // Deep merge settings to ensure new fields (like enableCloudSync) exist
    if (loadedState.settings) {
        loadedState.settings = {
            ...DEFAULT_SETTINGS,
            ...loadedState.settings,
            // Ensure nested objects are merged correctly
            budget: { ...DEFAULT_SETTINGS.budget, ...(loadedState.settings.budget || {}) },
            categoryNotes: loadedState.settings.categoryNotes || {},
        };
        
        // Explicitly fix potentially undefined boolean flags from legacy data
        if (loadedState.settings.enableCloudSync === undefined) {
            loadedState.settings.enableCloudSync = false;
        }
    }
    if (!loadedState.categoryGroups) {
        loadedState.categoryGroups = [];
    }

    return loadedState;
  } catch (err) {
    console.error('Could not load state', err);
    return undefined;
  }
};
