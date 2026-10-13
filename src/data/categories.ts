import { type WowItemMetadata } from '../types/auction';

export interface CategoryChild {
  id: string;
  label: string;
}

export interface SubcategoryItem {
  id: string;
  label: string;
  children?: CategoryChild[];
}

export interface MainCategory {
  id: string;
  label: string;
  icon: string;
  subcategories: SubcategoryItem[];
}

export const WOW_AUCTION_CATEGORIES: MainCategory[] = [
  {
    id: 'Weapons',
    label: 'Weapons',
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_sword_04.jpg',
    subcategories: [
      {
        id: 'One-Handed',
        label: 'One-Handed',
        children: [
          { id: '1h-axes', label: 'Axes' },
          { id: '1h-daggers', label: 'Daggers' },
          { id: '1h-maces', label: 'Maces' },
          { id: '1h-swords', label: 'Swords' },
          { id: '1h-fist', label: 'Fist Weapons' },
          { id: '1h-polearms', label: 'Polearms' },
        ],
      },
      {
        id: 'Two-Handed',
        label: 'Two-Handed',
        children: [
          { id: '2h-axes', label: 'Axes' },
          { id: '2h-maces', label: 'Maces' },
          { id: '2h-swords', label: 'Swords' },
          { id: '2h-staves', label: 'Staves' },
          { id: '2h-polearms', label: 'Polearms' },
        ],
      },
      {
        id: 'Ranged',
        label: 'Ranged',
        children: [
          { id: 'ranged-bows', label: 'Bows' },
          { id: 'ranged-crossbows', label: 'Crossbows' },
          { id: 'ranged-guns', label: 'Guns' },
          { id: 'ranged-wands', label: 'Wands' },
          { id: 'ranged-thrown', label: 'Throwing' },
        ],
      },
      {
        id: 'Off-Hand',
        label: 'Off-Hand / Misc',
        children: [
          { id: 'offhand-held', label: 'Held in Off-Hand' },
          { id: 'offhand-misc', label: 'Misc Off-Hand' },
        ],
      },
    ],
  },
  {
    id: 'Armor',
    label: 'Armor',
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_chest_plate01.jpg',
    subcategories: [
      { id: 'Cloth', label: 'Cloth' },
      { id: 'Leather', label: 'Leather' },
      { id: 'Mail', label: 'Mail' },
      { id: 'Plate', label: 'Plate' },
      { id: 'Cosmetic', label: 'Cosmetic' },
      { id: 'Shields', label: 'Shields' },
      { id: 'Off-Hand', label: 'Off-Hand Items (Held in Off-Hand)' },
    ],
  },
  {
    id: 'Container',
    label: 'Container',
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_bag_08.jpg',
    subcategories: [
      { id: 'Bags', label: 'Bags' },
      {
        id: 'Profession Bags',
        label: 'Profession Bags',
        children: [
          { id: 'bag-herb', label: 'Herb Bags' },
          { id: 'bag-mining', label: 'Mining Sacks' },
          { id: 'bag-enchanting', label: 'Enchanting / Enclosing' },
          { id: 'bag-leather', label: 'Leatherworking Bags' },
          { id: 'bag-engineering', label: 'Engineering Toolboxes' },
          { id: 'bag-gem', label: 'Gem Pouches' },
        ],
      },
    ],
  },
  {
    id: 'Consumables',
    label: 'Consumables',
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_potion_51.jpg',
    subcategories: [
      { id: 'Food & Drink', label: 'Food & Drink' },
      { id: 'Potions', label: 'Potions' },
      { id: 'Elixirs', label: 'Elixirs' },
      { id: 'Flasks', label: 'Flasks' },
      { id: 'Runes', label: 'Runes' },
      { id: 'Vantus Runes', label: 'Vantus Runes' },
    ],
  },
  {
    id: 'Trade Goods',
    label: 'Trade Goods',
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_ore_thorium_01.jpg',
    subcategories: [
      { id: 'Cloth', label: 'Cloth' },
      { id: 'Leather', label: 'Leather' },
      { id: 'Metal & Stone', label: 'Metal & Stone' },
      { id: 'Elemental', label: 'Elemental (Primals/Motes)' },
      { id: 'Herbs', label: 'Herbs' },
      { id: 'Enchanting Materials', label: 'Enchanting Materials' },
      { id: 'Inscription Pigments', label: 'Inscription Pigments' },
      { id: 'Cooking Ingredients', label: 'Cooking Ingredients' },
    ],
  },
  {
    id: 'Gems',
    label: 'Gems',
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_gem_diamond_02.jpg',
    subcategories: [
      {
        id: 'Cut Gems',
        label: 'Cut Gems',
        children: [
          { id: 'gem-red', label: 'Red' },
          { id: 'gem-blue', label: 'Blue' },
          { id: 'gem-yellow', label: 'Yellow' },
          { id: 'gem-green', label: 'Green' },
          { id: 'gem-purple', label: 'Purple' },
          { id: 'gem-orange', label: 'Orange' },
          { id: 'gem-meta', label: 'Meta' },
          { id: 'gem-prismatic', label: 'Prismatic' },
        ],
      },
      { id: 'Raw Ores & Uncut Gems', label: 'Raw Ores & Uncut Gems' },
    ],
  },
  {
    id: 'Item Enhancement',
    label: 'Item Enhancement',
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_enchant_shardbrilliantlarge.jpg',
    subcategories: [
      { id: 'Enchants', label: 'Enchants' },
      { id: 'Armor Kits', label: 'Armor Kits' },
      { id: 'Scopes', label: 'Scopes' },
      { id: 'Oil/Stones', label: 'Oil & Stones' },
    ],
  },
  {
    id: 'Recipes',
    label: 'Recipes',
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_scroll_03.jpg',
    subcategories: [
      { id: 'Alchemy', label: 'Alchemy' },
      { id: 'Blacksmithing', label: 'Blacksmithing' },
      { id: 'Cooking', label: 'Cooking' },
      { id: 'Enchanting', label: 'Enchanting' },
      { id: 'Engineering', label: 'Engineering' },
      { id: 'Herbalism', label: 'Herbalism' },
      { id: 'Inscription', label: 'Inscription' },
      { id: 'Jewelcrafting', label: 'Jewelcrafting' },
      { id: 'Leatherworking', label: 'Leatherworking' },
      { id: 'Mining', label: 'Mining' },
      { id: 'Skinning', label: 'Skinning' },
      { id: 'Tailoring', label: 'Tailoring' },
      { id: 'Fishing', label: 'Fishing' },
    ],
  },
  {
    id: 'Glyphs',
    label: 'Glyphs',
    icon: 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_sealofwisdom.jpg',
    subcategories: [
      { id: 'Death Knight', label: 'Death Knight' },
      { id: 'Demon Hunter', label: 'Demon Hunter' },
      { id: 'Druid', label: 'Druid' },
      { id: 'Evoker', label: 'Evoker' },
      { id: 'Hunter', label: 'Hunter' },
      { id: 'Mage', label: 'Mage' },
      { id: 'Monk', label: 'Monk' },
      { id: 'Paladin', label: 'Paladin' },
      { id: 'Priest', label: 'Priest' },
      { id: 'Rogue', label: 'Rogue' },
      { id: 'Shaman', label: 'Shaman' },
      { id: 'Warlock', label: 'Warlock' },
      { id: 'Warrior', label: 'Warrior' },
    ],
  },
  {
    id: 'Battle Pets',
    label: 'Battle Pets',
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_box_petcarrier_01.jpg',
    subcategories: [
      { id: 'Aquatic', label: 'Aquatic' },
      { id: 'Beast', label: 'Beast' },
      { id: 'Critter', label: 'Critter' },
      { id: 'Dragonkin', label: 'Dragonkin' },
      { id: 'Elemental', label: 'Elemental' },
      { id: 'Flying', label: 'Flying' },
      { id: 'Humanoid', label: 'Humanoid' },
      { id: 'Magic', label: 'Magic' },
      { id: 'Mechanical', label: 'Mechanical' },
      { id: 'Undead', label: 'Undead' },
    ],
  },
  {
    id: 'Mounts',
    label: 'Mounts',
    icon: 'https://wow.zamimg.com/images/wow/icons/large/ability_mount_raptor.jpg',
    subcategories: [
      { id: 'Faction Mounts', label: 'Faction Mounts' },
      { id: 'Dungeon & Raid Mounts', label: 'Dungeon & Raid Mounts' },
      { id: 'Profession-Crafted Mounts', label: 'Profession-Crafted Mounts' },
      { id: 'Flying Mounts', label: 'Flying Mounts' },
      { id: 'Ground Mounts', label: 'Ground Mounts' },
    ],
  },
  {
    id: 'Miscellaneous',
    label: 'Miscellaneous',
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_gift_01.jpg',
    subcategories: [
      { id: 'Quest Items', label: 'Quest Items' },
      { id: 'Holiday Items', label: 'Holiday Items' },
      { id: 'Junk', label: 'Junk' },
      { id: 'Other Unique Goods', label: 'Other Unique Goods' },
    ],
  },
];

/**
 * Checks if a given WoW item metadata matches the selected category and subcategory filter.
 */
export function matchesCategoryFilter(
  meta: WowItemMetadata,
  categoryId: string,
  subcategoryId: string,
  subChildId?: string
): boolean {
  if (categoryId === 'all') return true;

  const itemClass = (meta.itemClass || '').toLowerCase();
  const subclass = (meta.subclass || '').toLowerCase();
  const name = (meta.name || '').toLowerCase();

  // Normalize categoryId
  const targetCategory = categoryId.toLowerCase();

  // Category matching
  let classMatches = false;
  switch (targetCategory) {
    case 'weapons':
    case 'weapon':
      classMatches = itemClass.includes('weapon');
      break;
    case 'armor':
      classMatches = itemClass.includes('armor');
      break;
    case 'container':
      classMatches = itemClass.includes('container') || subclass.includes('bag');
      break;
    case 'consumables':
    case 'consumable':
      classMatches = itemClass.includes('consumable') || itemClass.includes('potion') || itemClass.includes('food');
      break;
    case 'trade goods':
    case 'tradeskill':
      classMatches =
        itemClass.includes('trade') ||
        itemClass.includes('tradeskill') ||
        itemClass.includes('material');
      break;
    case 'gems':
    case 'gem':
      classMatches = itemClass.includes('gem') || subclass.includes('gem');
      break;
    case 'item enhancement':
      classMatches =
        itemClass.includes('enhancement') ||
        subclass.includes('enhancement') ||
        subclass.includes('oil') ||
        subclass.includes('armor kit') ||
        subclass.includes('scope');
      break;
    case 'recipes':
    case 'recipe':
      classMatches = itemClass.includes('recipe');
      break;
    case 'glyphs':
    case 'glyph':
      classMatches = itemClass.includes('glyph') || subclass.includes('glyph') || name.startsWith('glyph of');
      break;
    case 'battle pets':
    case 'battle pet':
    case 'pets':
      classMatches = itemClass.includes('pet') || subclass.includes('pet') || subclass.includes('companion');
      break;
    case 'mounts':
    case 'mount':
      classMatches = itemClass.includes('mount') || subclass.includes('mount');
      break;
    case 'miscellaneous':
    case 'misc':
      classMatches =
        itemClass.includes('misc') ||
        itemClass.includes('miscellaneous') ||
        itemClass.includes('junk');
      break;
    default:
      classMatches = itemClass.includes(targetCategory);
  }

  if (!classMatches) return false;
  if (!subcategoryId || subcategoryId === 'all') return true;

  // Subcategory matching
  const targetSub = subcategoryId.toLowerCase();

  // If subChildId is present, check specific sub-child
  if (subChildId && subChildId !== 'all') {
    const targetChild = subChildId.toLowerCase();
    if (targetChild.includes('axe')) return subclass.includes('axe');
    if (targetChild.includes('dagger')) return subclass.includes('dagger');
    if (targetChild.includes('mace')) return subclass.includes('mace');
    if (targetChild.includes('sword')) return subclass.includes('sword');
    if (targetChild.includes('fist')) return subclass.includes('fist');
    if (targetChild.includes('polearm')) return subclass.includes('polearm');
    if (targetChild.includes('stave') || targetChild.includes('staff')) return subclass.includes('staff') || subclass.includes('stave');
    if (targetChild.includes('bow')) return subclass.includes('bow');
    if (targetChild.includes('crossbow')) return subclass.includes('crossbow');
    if (targetChild.includes('gun')) return subclass.includes('gun');
    if (targetChild.includes('wand')) return subclass.includes('wand');
    if (targetChild.includes('thrown') || targetChild.includes('throwing')) return subclass.includes('thrown') || subclass.includes('throwing');
    if (targetChild.includes('held') || targetChild.includes('offhand')) return subclass.includes('off-hand') || subclass.includes('held');
    if (targetChild.includes('herb')) return subclass.includes('herb');
    if (targetChild.includes('mining')) return subclass.includes('mining');
    if (targetChild.includes('enchant')) return subclass.includes('enchant');
    if (targetChild.includes('leather')) return subclass.includes('leather');
    if (targetChild.includes('engineer')) return subclass.includes('engineer');
    if (targetChild.includes('gem')) return subclass.includes('gem');
    if (targetChild.startsWith('gem-')) {
      const color = targetChild.replace('gem-', '');
      return subclass.includes(color) || name.includes(color);
    }
  }

  // Handle weapon groups
  if (targetSub === 'one-handed') {
    return (
      subclass.includes('one-handed') ||
      subclass.includes('dagger') ||
      subclass.includes('fist') ||
      (subclass.includes('sword') && !subclass.includes('two-handed')) ||
      (subclass.includes('mace') && !subclass.includes('two-handed')) ||
      (subclass.includes('axe') && !subclass.includes('two-handed'))
    );
  }
  if (targetSub === 'two-handed') {
    return (
      subclass.includes('two-handed') ||
      subclass.includes('polearm') ||
      subclass.includes('staff') ||
      subclass.includes('stave')
    );
  }
  if (targetSub === 'ranged') {
    return (
      subclass.includes('ranged') ||
      subclass.includes('bow') ||
      subclass.includes('gun') ||
      subclass.includes('crossbow') ||
      subclass.includes('wand') ||
      subclass.includes('thrown') ||
      subclass.includes('throwing')
    );
  }
  if (targetSub === 'off-hand' || targetSub === 'off-hand/misc') {
    return subclass.includes('off-hand') || subclass.includes('shield') || subclass.includes('held');
  }

  // Handle Containers
  if (targetSub === 'bags') {
    return subclass.includes('bag') && !subclass.includes('herb') && !subclass.includes('mining') && !subclass.includes('enchant');
  }
  if (targetSub === 'profession bags') {
    return (
      subclass.includes('herb') ||
      subclass.includes('mining') ||
      subclass.includes('enchant') ||
      subclass.includes('leather') ||
      subclass.includes('profession') ||
      subclass.includes('gem') ||
      name.includes('herb bag') ||
      name.includes('mining sack')
    );
  }

  // Handle Trade Goods
  if (targetSub === 'herbs') return subclass.includes('herb');
  if (targetSub === 'metal & stone') return subclass.includes('metal') || subclass.includes('stone') || subclass.includes('ore') || subclass.includes('bar');
  if (targetSub === 'elemental') return subclass.includes('elemental');
  if (targetSub === 'enchanting materials') return subclass.includes('enchant') || subclass.includes('dust') || subclass.includes('shard') || subclass.includes('essence');
  if (targetSub === 'inscription pigments') return subclass.includes('inscription') || subclass.includes('pigment');
  if (targetSub === 'cooking ingredients') return subclass.includes('cooking') || subclass.includes('meat') || subclass.includes('fish');

  // Handle Consumables
  if (targetSub === 'flasks') return subclass.includes('flask') || name.includes('flask of');
  if (targetSub === 'potions') return subclass.includes('potion') && !name.includes('flask');
  if (targetSub === 'elixirs') return subclass.includes('elixir') || name.includes('elixir of');
  if (targetSub === 'food & drink') return subclass.includes('food') || subclass.includes('drink');
  if (targetSub === 'runes') return subclass.includes('rune') && !subclass.includes('vantus');
  if (targetSub === 'vantus runes') return subclass.includes('vantus') || name.includes('vantus rune');

  // Handle Item Enhancement
  if (targetSub === 'enchants') return subclass.includes('enchant') || name.includes('enchant');
  if (targetSub === 'armor kits') return subclass.includes('armor kit') || name.includes('armor kit');
  if (targetSub === 'scopes') return subclass.includes('scope') || name.includes('scope');
  if (targetSub === 'oil/stones' || targetSub === 'oil & stones') return subclass.includes('oil') || subclass.includes('stone') || name.includes('oil') || name.includes('stone');

  // Handle Gems
  if (targetSub === 'cut gems') return subclass.includes('cut') || (!subclass.includes('ore') && !name.includes('uncut'));
  if (targetSub === 'raw ores & uncut gems') return subclass.includes('uncut') || subclass.includes('raw') || subclass.includes('ore');

  // Generic subclass comparison
  return subclass.includes(targetSub) || name.includes(targetSub);
}
