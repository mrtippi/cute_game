// How the bot weighs a weapon: attack, with ranged weapons (bows, blasters, staves) counted 15% higher because
// they hit from a safe distance and the bot kites with them (tasks/combat.mjs). `w` is a bridge item or weapon fact
// (kind in `weapon` or `kind`).
export const isRanged = w => (w?.weapon ?? w?.kind) === 'gun';
export const weaponPower = w => (w?.attack ?? 0) * (isRanged(w) ? 1.15 : 1);
