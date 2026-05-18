import React, { useEffect } from 'react';
import { AppProvider } from './contexts/AppContext';
import { Layout } from './components/Layout';

const editableSelector = [
  'input',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
].join(',');

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(editableSelector));
};

const App: React.FC = () => {
  useEffect(() => {
    const preventNonEditableTextAction = (event: Event) => {
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
    };

    document.addEventListener('contextmenu', preventNonEditableTextAction);
    document.addEventListener('selectstart', preventNonEditableTextAction);

    return () => {
      document.removeEventListener('contextmenu', preventNonEditableTextAction);
      document.removeEventListener('selectstart', preventNonEditableTextAction);
    };
  }, []);

  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
};

export default App;
