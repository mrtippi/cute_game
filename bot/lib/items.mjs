// What the game's items are, from its own catalogue (src/content.ts ITEMS, with the farm products and dishes that
// src/farm.ts adds): crops for the kitchen and the market, and the food that heals the explorer.
import { ITEMS } from '../../src/content.ts';
import '../../src/farm.ts';

/** A garden crop or orchard fruit (raw produce: it sells, and cooks into a meal). */
export const isCrop = id => ITEMS[id]?.type === 'crop';
/**
 * Food that heals in the field: meals cooked from crops, meat and fish, farm products and dishes, potions, honey…
 * Raw crops and fish heal a little too, but they are produce (sold and cooked), so they do not count here.
 */
export const isFood = id => ITEMS[id]?.type === 'food' && (ITEMS[id].heal ?? 0) > 0;
/** Healing food in the bag. */
export const foodCount = s => Object.entries(s.bag).filter(([id]) => isFood(id)).reduce((n, [, c]) => n + c, 0);
