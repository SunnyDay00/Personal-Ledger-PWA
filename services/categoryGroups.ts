import { Category, CategoryGroup, CategoryType } from '../types';

export const getLedgerGroupCategories = (categories: readonly Category[], ledgerId: string): Category[] =>
  categories.filter(category => category.ledgerId === ledgerId && !category.isDeleted)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// Use the same current catalog for the count, checked boxes and saved members.
// Older records may still contain deleted, foreign, duplicate or missing IDs.
export const getValidGroupCategoryIds = (value: unknown, availableCategories: readonly Category[]): string[] => {
  let ids = value;
  if (typeof ids === 'string') {
    try { ids = JSON.parse(ids); } catch { return []; }
  }
  if (!Array.isArray(ids)) return [];
  const available = new Set(availableCategories.map(category => category.id));
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && available.has(id)))];
};

// Ownership ignores the AddView eye toggle; hiding a group never unassigns it.
export const getCategoryGroupOwners = (
  categories: readonly Category[], groups: readonly CategoryGroup[], ledgerId: string
): Map<string, CategoryGroup> => {
  const catalog = getLedgerGroupCategories(categories, ledgerId);
  const owners = new Map<string, CategoryGroup>();
  const ordered = groups.filter(group => group.ledgerId === ledgerId && !group.isDeleted)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const group of ordered) {
    for (const id of getValidGroupCategoryIds(group.categoryIds, catalog)) {
      if (!owners.has(id)) owners.set(id, group);
    }
  }
  return owners;
};

export const normalizeExclusiveCategoryGroups = (categories: readonly Category[], groups: readonly CategoryGroup[]): CategoryGroup[] => {
  const ownership = new Map<string, Map<string, CategoryGroup>>();
  return groups.map(group => {
    if (!group.ledgerId || group.isDeleted) return group;
    if (!ownership.has(group.ledgerId)) ownership.set(group.ledgerId, getCategoryGroupOwners(categories, groups, group.ledgerId));
    const owners = ownership.get(group.ledgerId)!;
    const ids = getValidGroupCategoryIds(group.categoryIds, getLedgerGroupCategories(categories, group.ledgerId));
    return { ...group, categoryIds: ids.filter(id => owners.get(id)?.id === group.id) };
  });
};

export const replaceVisibleCategoryOrder = (all: readonly Category[], reordered: readonly Category[]): Category[] => {
  const ids = new Set(reordered.map(category => category.id));
  let index = 0;
  return all.map(category => ids.has(category.id) ? reordered[index++] : category);
};

export const buildAddCategorySections = (
  categories: readonly Category[], groups: readonly CategoryGroup[], ledgerId: string,
  type: CategoryType, visibility: Record<string, boolean> = {}
) => {
  const available = getLedgerGroupCategories(categories, ledgerId).filter(category => category.type === type);
  const owners = getCategoryGroupOwners(categories, groups, ledgerId);
  const claimed = new Set<string>();
  const sections: { group: CategoryGroup; categories: Category[] }[] = [];
  const orderedGroups = groups.filter(group => group.ledgerId === ledgerId && !group.isDeleted && visibility[group.id] !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const group of orderedGroups) {
    const members = available.filter(category => owners.get(category.id)?.id === group.id);
    if (!members.length) continue;
    members.forEach(category => claimed.add(category.id));
    sections.push({ group, categories: members });
  }
  return { groups: sections, ungrouped: available.filter(category => !claimed.has(category.id)) };
};
