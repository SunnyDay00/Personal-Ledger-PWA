import { describe, expect, it } from 'vitest';
import { Category, CategoryGroup } from '../types';
import { buildAddCategorySections, getCategoryGroupOwners, getLedgerGroupCategories, getValidGroupCategoryIds, normalizeExclusiveCategoryGroups, replaceVisibleCategoryOrder } from './categoryGroups';

const category = (id: string, ledgerId = 'current', order = 0, isDeleted = false): Category => ({
  id, ledgerId, name: id, type: 'expense', icon: 'Circle', order, isDeleted,
});

const group = (id: string, categoryIds: string[], order = 0, extra: Partial<CategoryGroup> = {}): CategoryGroup => ({
  id, name: id, categoryIds, ledgerId: 'current', order, ...extra,
});

describe('category grouping in expense and income entry', () => {
  it('enables legacy groups by default and assigns overlapping members once in group order', () => {
    const result = buildAddCategorySections([category('a'), category('b'), category('c')], [
      group('later', ['a', 'b', 'b'], 2), group('first', ['a'], 1),
    ], 'current', 'expense');
    expect(result.groups.map(section => [section.group.id, section.categories.map(item => item.id)]))
      .toEqual([['first', ['a']], ['later', ['b']]]);
    expect(result.ungrouped.map(item => item.id)).toEqual(['c']);
    const displayed = [...result.groups.flatMap(section => section.categories), ...result.ungrouped].map(item => item.id);
    expect(new Set(displayed).size).toBe(displayed.length);
  });

  it('returns hidden owners to the normal grid without assigning their members to another group', () => {
    const groups = [group('first', ['a']), group('second', ['a', 'b'], 1)];
    const result = buildAddCategorySections([category('a'), category('b'), category('c')], groups,
      'current', 'expense', { first: false });
    expect(result.groups[0].group.id).toBe('second');
    expect(result.groups[0].categories.map(item => item.id)).toEqual(['b']);
    expect(result.ungrouped.map(item => item.id)).toEqual(['a', 'c']);
    const hidden = buildAddCategorySections([category('a'), category('b')], groups,
      'current', 'expense', { first: false, second: false });
    expect(hidden.groups).toEqual([]);
    expect(hidden.ungrouped.map(item => item.id)).toEqual(['a', 'b']);
  });

  it('separates income and expense while excluding deleted, missing and foreign categories/groups', () => {
    const categories = [category('expense'), { ...category('income'), type: 'income' as const },
      category('deleted', 'current', 0, true), category('foreign', 'other')];
    const groups = [group('mixed', ['expense', 'income', 'deleted', 'missing', 'foreign']),
      group('foreign-group', ['expense'], -1, { ledgerId: 'other' }),
      group('deleted-group', ['income'], -1, { isDeleted: true }), group('empty', ['missing'])];
    expect(buildAddCategorySections(categories, groups, 'current', 'expense').groups.map(section =>
      [section.group.id, section.categories.map(item => item.id)])).toEqual([['mixed', ['expense']]]);
    expect(buildAddCategorySections(categories, groups, 'current', 'income').groups.map(section =>
      [section.group.id, section.categories.map(item => item.id)])).toEqual([['mixed', ['income']]]);
  });
});

describe('exclusive category group ownership', () => {
  it('normalizes legacy overlaps, ignores stale groups and keeps ownership independent of eye visibility', () => {
    const categories = [category('a'), category('b'), category('c')];
    const groups = [group('first', ['a', 'a']), group('later', ['a', 'b'], 1), group('deleted', ['c'], 0, { isDeleted: true })];
    const owners = getCategoryGroupOwners(categories, groups, 'current');
    expect(owners.get('a')?.id).toBe('first');
    expect(owners.get('b')?.id).toBe('later');
    expect(owners.has('c')).toBe(false);
    const normalized = normalizeExclusiveCategoryGroups(categories, groups);
    expect(normalized.find(item => item.id === 'later')?.categoryIds).toEqual(['b']);
    expect(groups[1].categoryIds).toEqual(['a', 'b']);
  });

  it('reorders filtered categories without moving hidden category slots', () => {
    const all = [category('grouped1'), category('a'), category('grouped2'), category('b')];
    expect(replaceVisibleCategoryOrder(all, [all[3], all[1]]).map(item => item.id))
      .toEqual(['grouped1', 'b', 'grouped2', 'a']);
  });
});

describe('current ledger category group membership', () => {
  it('makes counts and saved selections exclude stale, foreign and repeated references', () => {
    const catalog = getLedgerGroupCategories([
      category('餐饮'), category('买菜'), category('旧分类', 'current', 0, true), category('其他账本', 'other'),
    ], 'current');
    const ids = ['餐饮', '买菜', '旧分类', '其他账本', '已丢失', '餐饮'];
    expect(getValidGroupCategoryIds(ids, catalog)).toEqual(['餐饮', '买菜']);
    expect(getValidGroupCategoryIds(ids, catalog)).toHaveLength(2);
  });

  it('uses the latest names, active state and order without mutating the category state', () => {
    const categories = [category('a', 'current', 2), category('b', 'current', 1)];
    const oldSelection = ['a', 'b'];
    const updated = [
      { ...categories[0], name: '最新名称', order: 0 },
      { ...categories[1], isDeleted: true },
      category('新增分类', 'current', 1),
    ];
    const catalog = getLedgerGroupCategories(updated, 'current');
    expect(catalog.map(item => item.name)).toEqual(['最新名称', '新增分类']);
    expect(getValidGroupCategoryIds(oldSelection, catalog)).toEqual(['a']);
    expect(categories.map(item => item.id)).toEqual(['a', 'b']);
    expect(getValidGroupCategoryIds(oldSelection, getLedgerGroupCategories(updated, 'other'))).toEqual([]);
  });

  it('handles empty and legacy JSON membership using the same valid catalog', () => {
    const catalog = getLedgerGroupCategories([category('a')], 'current');
    expect(getValidGroupCategoryIds('["a","a","old"]', catalog)).toEqual(['a']);
    expect(getValidGroupCategoryIds(undefined, catalog)).toEqual([]);
    expect(getValidGroupCategoryIds('invalid', catalog)).toEqual([]);
  });
});
