export interface CraftingRecipe {
  productId: number;
  profession:
    | 'Alchemy'
    | 'Blacksmithing'
    | 'Enchanting'
    | 'Engineering'
    | 'Herbalism'
    | 'Inscription'
    | 'Jewelcrafting'
    | 'Leatherworking'
    | 'Tailoring';
  ingredients: {
    itemId: number;
    quantity: number;
  }[];
}

interface ProfessionInfo {
  icon: string;
  description: string;
}

export const PROFESSION_INFO: Record<string, ProfessionInfo> = {
  All: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_book_09.jpg',
    description: 'Explore crafting profit margins and item values across all professions.',
  },
  Alchemy: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_alchemy.jpg',
    description: 'Brews powerful potions, elixirs, and flasks, and transmutes rare materials.',
  },
  Blacksmithing: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_blacksmithing.jpg',
    description: 'Forges heavy mail, plate armor, and deadly weapons from raw bars and elemental essences.',
  },
  Enchanting: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_engraving.jpg',
    description: 'Enhances gear stats with magical enchants and breaks down unwanted items into dust (disenchanting).',
  },
  Engineering: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_engineering.jpg',
    description: 'Builds explosive devices, fun gadgets, mounts, and utility items.',
  },
  Herbalism: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_herbalism.jpg',
    description: 'Gathers herbs and plants used primarily by Alchemists and Scribes.',
  },
  Inscription: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_inscription_tradeskill01.jpg',
    description: 'Creates glyphs, off-hand items, darkmoon decks, and scrolls.',
  },
  Jewelcrafting: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_gem_01.jpg',
    description: 'Cuts gems to socket into gear and crafts rings and necklaces.',
  },
  Leatherworking: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_leatherworking.jpg',
    description: 'Crafts leather and mail armor along with drums and armor kits.',
  },
  Tailoring: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_tailoring.jpg',
    description: 'Weaves cloth into caster armor, bags, and special fabrics like Mooncloth.',
  },
};

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  // Alchemy
  {
    productId: 13511, // Flask of the Titans
    profession: 'Alchemy',
    ingredients: [
      { itemId: 13468, quantity: 1 },  // Black Lotus
      { itemId: 13467, quantity: 10 }, // Icecap
      { itemId: 13465, quantity: 10 }  // Mountain Silversage
    ]
  },
  {
    productId: 13512, // Flask of Supreme Power
    profession: 'Alchemy',
    ingredients: [
      { itemId: 13468, quantity: 1 },  // Black Lotus
      { itemId: 13466, quantity: 10 }, // Plaguebloom
      { itemId: 13463, quantity: 10 }  // Dreamfoil
    ]
  },
  {
    productId: 12360, // Arcanite Bar
    profession: 'Alchemy',
    ingredients: [
      { itemId: 12359, quantity: 1 },  // Thorium Ore
      { itemId: 12800, quantity: 1 }   // Azerothian Diamond
    ]
  },
  // Blacksmithing
  {
    productId: 12640, // Lionheart Helm
    profession: 'Blacksmithing',
    ingredients: [
      { itemId: 12360, quantity: 12 }, // Arcanite Bar
      { itemId: 12800, quantity: 4 },  // Azerothian Diamond
      { itemId: 12799, quantity: 4 }   // Large Opal
    ]
  },
  {
    productId: 19019, // Thunderfury
    profession: 'Blacksmithing',
    ingredients: [
      { itemId: 12360, quantity: 100 }, // Arcanite Bar
      { itemId: 17203, quantity: 1 },   // Sulfuron Ingot
      { itemId: 7078, quantity: 10 },   // Essence of Fire
      { itemId: 7082, quantity: 10 }    // Essence of Air
    ]
  },
  // Enchanting
  {
    productId: 16252, // Formula: Enchant Weapon - Crusader
    profession: 'Enchanting',
    ingredients: [
      { itemId: 14344, quantity: 4 },  // Large Brilliant Shard
      { itemId: 16204, quantity: 20 }, // Illusion Dust
      { itemId: 7076, quantity: 2 }    // Essence of Earth
    ]
  },
  {
    productId: 20748, // Brilliant Mana Oil
    profession: 'Enchanting',
    ingredients: [
      { itemId: 14344, quantity: 2 }, // Large Brilliant Shard
      { itemId: 16204, quantity: 4 }  // Illusion Dust
    ]
  },
  // Engineering
  {
    productId: 16008, // Arcanite Dragonling
    profession: 'Engineering',
    ingredients: [
      { itemId: 12360, quantity: 4 }, // Arcanite Bar
      { itemId: 12359, quantity: 6 }, // Thorium Ore
      { itemId: 7078, quantity: 2 }   // Essence of Fire
    ]
  },
  {
    productId: 18587, // Goblin Jumper Cables XL
    profession: 'Engineering',
    ingredients: [
      { itemId: 12359, quantity: 4 }, // Thorium Ore
      { itemId: 7082, quantity: 1 }   // Essence of Air
    ]
  },
  // Herbalism
  {
    productId: 13468, // Black Lotus
    profession: 'Herbalism',
    ingredients: [
      { itemId: 13464, quantity: 3 }, // Golden Sansam
      { itemId: 13465, quantity: 3 }, // Mountain Silversage
      { itemId: 13466, quantity: 3 }  // Plaguebloom
    ]
  },
  {
    productId: 13467, // Icecap
    profession: 'Herbalism',
    ingredients: [
      { itemId: 13464, quantity: 2 }, // Golden Sansam
      { itemId: 13465, quantity: 2 }  // Mountain Silversage
    ]
  },
  // Inscription
  {
    productId: 19288, // Darkmoon Card: Blue Dragon
    profession: 'Inscription',
    ingredients: [
      { itemId: 12799, quantity: 2 }, // Large Opal
      { itemId: 16204, quantity: 10 }, // Illusion Dust
      { itemId: 7080, quantity: 2 }   // Essence of Water
    ]
  },
  {
    productId: 10307, // Scroll of Strength IV
    profession: 'Inscription',
    ingredients: [
      { itemId: 16204, quantity: 2 }, // Illusion Dust
      { itemId: 13464, quantity: 2 }  // Golden Sansam
    ]
  },
  // Jewelcrafting
  {
    productId: 12080, // Aquamarine Signet
    profession: 'Jewelcrafting',
    ingredients: [
      { itemId: 12800, quantity: 1 }, // Azerothian Diamond
      { itemId: 12360, quantity: 1 }  // Arcanite Bar
    ]
  },
  {
    productId: 12084, // Ruby Crown of Restoration
    profession: 'Jewelcrafting',
    ingredients: [
      { itemId: 12799, quantity: 2 }, // Large Opal
      { itemId: 12800, quantity: 2 }, // Azerothian Diamond
      { itemId: 12360, quantity: 4 }  // Arcanite Bar
    ]
  },
  // Leatherworking
  {
    productId: 15062, // Devilsaur Gauntlets
    profession: 'Leatherworking',
    ingredients: [
      { itemId: 8170, quantity: 30 },  // Rugged Leather
      { itemId: 15407, quantity: 1 },  // Cured Rugged Hide
      { itemId: 7076, quantity: 2 }    // Essence of Earth
    ]
  },
  {
    productId: 15063, // Devilsaur Leggings
    profession: 'Leatherworking',
    ingredients: [
      { itemId: 8170, quantity: 30 },  // Rugged Leather
      { itemId: 15407, quantity: 1 },  // Cured Rugged Hide
      { itemId: 7078, quantity: 2 }    // Essence of Fire
    ]
  },
  // Tailoring
  {
    productId: 14155, // Mooncloth
    profession: 'Tailoring',
    ingredients: [
      { itemId: 7080, quantity: 2 }, // Essence of Water
      { itemId: 12799, quantity: 1 } // Large Opal
    ]
  },
  {
    productId: 14156, // Mooncloth Bag
    profession: 'Tailoring',
    ingredients: [
      { itemId: 14155, quantity: 4 }, // Mooncloth
      { itemId: 14344, quantity: 1 }  // Large Brilliant Shard
    ]
  }
];

export type ProfessionName =
  | 'Alchemy'
  | 'Blacksmithing'
  | 'Enchanting'
  | 'Engineering'
  | 'Herbalism'
  | 'Inscription'
  | 'Jewelcrafting'
  | 'Leatherworking'
  | 'Tailoring';
