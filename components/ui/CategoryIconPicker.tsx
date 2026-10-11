import React, { useState } from 'react';
import { CATEGORY_ICON_GROUPS } from '../../constants';
import { cn } from '../../utils';
import { Icon } from './Icon';

interface CategoryIconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

const ICON_TABS = [
  { id: 'all', label: '全部', icons: CATEGORY_ICON_GROUPS.flatMap(group => group.icons) },
  ...CATEGORY_ICON_GROUPS,
];

export const CategoryIconPicker: React.FC<CategoryIconPickerProps> = ({ value, onChange }) => {
  const [groupId, setGroupId] = useState('all');
  const group = ICON_TABS.find(item => item.id === groupId)!;

  return (
    <div>
      <div role="tablist" aria-label="分类图标" className="flex flex-wrap gap-2 mb-4">
        {ICON_TABS.map(item => (
          <button
            key={item.id}
            id={`category-icon-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={groupId === item.id}
            aria-controls="category-icon-panel"
            onClick={() => setGroupId(item.id)}
            className={cn('px-3 py-2 rounded-xl text-xs font-medium transition-colors',
              groupId === item.id ? 'bg-ios-primary text-white' : 'bg-gray-100 dark:bg-zinc-800 text-ios-subtext')}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div id="category-icon-panel" role="tabpanel" aria-labelledby={`category-icon-tab-${groupId}`} className="grid grid-cols-6 gap-3">
        {group.icons.map(icon => (
          <button
            key={icon.name}
            type="button"
            aria-label={icon.label}
            aria-pressed={value === icon.name}
            title={icon.label}
            onClick={() => onChange(icon.name)}
            className={cn('min-h-[52px] rounded-2xl border flex items-center justify-center transition-colors',
              value === icon.name ? 'bg-ios-primary text-white shadow-lg border-ios-primary/20' : 'bg-gray-50 dark:bg-zinc-800 text-ios-subtext border-gray-100 dark:border-zinc-700/70')}
          >
            <Icon name={icon.name} className="w-6 h-6" />
          </button>
        ))}
      </div>
    </div>
  );
};
