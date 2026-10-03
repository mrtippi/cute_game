// Playing together: the `together` clip (clips.mjs) of a group (groups.mjs). The members meet in the leader's party
// at a village gate (outside the private gardens, where they can see each other), hunt bosses the whole group can
// beat, visit each other's gardens (a ripe crop may go missing; a guard dog may object), share loot after a win and
// chat a little in Japanese. The leader is the first member id; it picks the party, the place and the boss.
//
// The bots agree through small files in the group's folder (GROUPS_DIR/<group>/): the leader's <seed>.json (party
// code, planet, meeting point, the boss it goes for) and one <seed>.<id>.json per member (its server id, strength,
// planet, a garden visit or shared loot it announces). In the game everything is done with mouse and keyboard.
import { t, setLanguage } from '../../src/i18n.ts';
import { CLIPS } from '../clips.mjs';
import { loadAccount } from '../accounts.mjs';
import { groupDir, readJson, writeJson, leaderOf } from '../groups.mjs';
import { VILLAGE_RADII } from '../../src/village.ts';
import { befriend, createParty, joinParty, leaveToOwnParty, leaveGarden, myParty, ownLootNear, sendChat, shareLoot, visitGarden, whoAmI } from '../lib/online.mjs';
import { huntBoss } from './boss.mjs';
import { collectLoot, fight, safeTargets } from './combat.mjs';
import { travelTo, goHome, LEVELS } from './travel.mjs';
import { flourish } from './flourish.mjs';
import { sleep, bagTotal } from '../lib/util.mjs';
import { foodCount } from '../lib/items.mjs';
import { PLANETS } from '../../src/content.ts';
setLanguage('ja');

/** How long a member waits for the leader's party (and the leader for its members) before playing alone. */
const MEET_WAIT = 240000;
/** Minutes before the clip's end for the goodbye. */
const BYE = 1.3;
/** At most one chat line per bot in this time. */
const CHAT_GAP = 40000;
/** A member's file older than this means it is not playing right now. */
const FRESH = 120000;
/** What each role does in a together clip (the planner's TASKS); the urgent things (health, falls, rewards) stay. */
const LEAD_TASKS = ['groupBoss', 'groupTrip', 'visitMate', 'host', 'fight', 'browse', 'home', 'snack', 'challenge'];
const MEMBER_TASKS = ['follow', 'groupBoss', 'visitMate', 'host', 'snack'];

// ---- chat ------------------------------------------------------------------------------------------------------
const LINES = {
  greet: ['やっほー！今日もよろしくね', 'おまたせ〜！いっしょに行こう', 'こんにちは！今日はなにしよっか', 'よろしく！がんばろうね'],
  arrive: ['きたよ〜！', 'おまたせ！よろしくね', 'やっほー、合流！', 'よろしくー！'],
  boss: ['{boss}、いっしょに倒そう！', 'あっちに{boss}がいるよ、行こう！', '{boss}いくよー！準備いい？'],
  join: ['了解！すぐ行く！', 'まかせて！', 'いこういこう！', 'ついていくね！'],
  win: ['やったー！倒したね！', 'ナイス！いい連携だった！', 'おつかれ！楽勝だったね', 'ふぅ…強かった〜'],
  share: ['ドロップ置いとくね、どうぞ！', 'アイテム分けるよ〜拾ってね', 'これ使って！'],
  thanks: ['ありがとう！助かる〜', 'わーい、ありがと！', 'もらっちゃった、ありがとう！'],
  visit: ['{name}の畑、見に行ってもいい？', 'ちょっと{name}の庭におじゃまするね', '{name}の畑、遊びに行くね〜'],
  host: ['いらっしゃい！ゆっくりしてってね', 'ようこそ〜！', 'あ、来た来た！いらっしゃい'],
  steal: ['えへへ、ひとつもらっちゃった', 'おいしそう…ひとつだけ！'],
  bitten: ['いたた…わんちゃんに怒られた', 'わっ、番犬だ！'],
  trip: ['みんなで{planet}に行ってみよう！', '{planet}まで飛ぶよ、ついてきて！'],
  bye: ['今日はありがとう！またね〜', 'おつかれさま！また遊ぼうね', 'たのしかった！またね！'],
};
/**
 * A short line in the room chat: at most one per CHAT_GAP (a line due sooner is skipped, or waited for up to
 * `wait` ms), never the same line twice in a row. True when the server confirmed it.
 */
export async function say(bot, kind, vars = {}, { chance = 1, wait = 0 } = {}) {
  const c = bot.coop; if (!c || !bot.online || !bot.rng.chance(chance)) return false;
  const since = Date.now() - c.lastChat;
  if (since < CHAT_GAP) { if (CHAT_GAP - since > wait) return false; await sleep(CHAT_GAP - since); }
  const line = bot.rng.pick(LINES[kind].filter(l => l !== c.lastLine)).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  c.lastChat = Date.now(); c.lastLine = line;
  const sent = await sendChat(bot, line).catch(() => false);
  bot.log(`chat${sent ? '' : ' (not confirmed)'}: ${line}`); if (sent) bot.mark?.('chat', { kind, text: line });
  return sent;
}

// ---- the group's files ------------------------------------------------------------------------------------------
const leaderFile = c => `${groupDir(c.group)}/${c.seed}.json`;
const statusFile = (c, id) => `${groupDir(c.group)}/${c.seed}.${id}.json`;
/** The leader's plan for this clip (null until written, or a stale one from another set of members). */
function plan(c) { const p = readJson(leaderFile(c)); return p && p.members?.join() === c.members.join() && p.at > c.started - 900000 ? p : null; }
function writePlan(c, patch) { c.plan = { ...(c.plan ?? {}), ...patch }; writeJson(leaderFile(c), c.plan); }
function status(c, patch) { Object.assign(c.status, patch, { at: Date.now() }); writeJson(statusFile(c, c.me), c.status); }
/** The other members playing this clip right now: their files, with id and name (the name others see in the game). */
function mates(c) {
  return c.members.filter(id => id !== c.me).map(id => { const m = readJson(statusFile(c, id)) ?? {}; return { ...m, id, name: m.serverName ?? m.name ?? c.names[id] }; })
    .filter(m => m.at > Date.now() - FRESH && !m.fallback);
}
/** Mates on screen in this world: their file plus where they stand ({ x, z, d } from the snapshot). */
const present = (c, s) => mates(c).map(m => ({ ...m, seen: s.others.find(o => o.id === m.serverId) })).filter(m => m.seen).map(m => ({ ...m, ...m.seen }));
/** Someone of the group is in another member's garden right now. */
const visiting = c => [c.status, ...mates(c)].some(m => m.visit && m.visit.at > Date.now() - 150000);

/** This explorer's strength for the leader's boss choice. */
const stats = s => ({ level: s.level, attack: s.attack, defense: s.defense, maxHp: s.maxHp, hp: s.hp, food: foodCount(s) });
async function heartbeat(bot) {
  const s = await bot.game.snap(); bot.coop.beatAt = Date.now();
  status(bot.coop, { planet: s.planet, x: s.player.x, z: s.player.z, stats: stats(s) });
}

// ---- the boss the group can beat ----------------------------------------------------------------------------------
/**
 * Live bosses this group can beat together, easiest first. The boss grows for every explorer nearby (server: +60%
 * health and +10% damage per extra player) and to the strongest one's level (+12% health, +7% damage per level), and
 * the group's attacks add up; every member must come through with health plus food to spare (tasks/boss.mjs bossReady).
 * `team`: [{ level, attack, defense, maxHp, food }], this explorer first.
 */
export function groupTargets(s, team) {
  const n = team.length, top = Math.max(...team.map(m => m.level)), low = Math.min(...team.map(m => m.level));
  const dps = team.reduce((sum, m) => sum + Math.max(1, m.attack) / .9, 0);
  return (s.bosses ?? []).filter(b => b.alive && b.d < 160 && (!b.titan || low >= 45)).map(b => {
    const live = s.enemies.find(e => e.id === b.id); if (!live) return null;
    const fresh = live.hp === live.maxHp, diff = fresh ? Math.max(0, top - live.level) : 0;
    const hp = live.hp * (fresh ? (1 + diff * .12) * (1 + .6 * (n - 1)) : 1), damage = live.damage * (1 + diff * .07) * (1 + .1 * (n - 1)) * 1.6;
    const seconds = hp / dps;
    // The boss strikes one explorer at a time: each takes its share of the blows (area skills are in the 1.6 above).
    const cost = m => seconds * Math.max(1, damage - m.defense * .5) / Math.max(.6, live.cooldown + .4) / n;
    const ok = live.level <= low + (b.titan ? 0 : 4) && team.every(m => cost(m) < (m.maxHp + Math.min(m.food, 6) * m.maxHp * .25) * (b.titan ? .5 : .7));
    return ok ? { ...b, seconds: Math.round(seconds) } : null;
  }).filter(Boolean).sort((a, b) => Number(a.titan) - Number(b.titan) || a.d - b.d);
}
/** This explorer and the mates on this world (their last reported strength). */
const team = (c, s) => [stats(s), ...mates(c).filter(m => m.planet === s.planet && m.stats).map(m => m.stats)];
const bossJa = b => t(b.name ?? 'Boss');
/** A world's name as the game shows it in Japanese (the same as the chapters, chapters.mjs). */
const planetJa = id => t(PLANETS[id]?.name ?? id);

// ---- setting up and meeting -------------------------------------------------------------------------------------
/** The group context for a clip: who plays, who leads, the files. play.mjs keeps it as bot.coop. */
export function createCoop({ group, members, seed, account }) {
  members = [...new Set(members)].sort();
  const names = Object.fromEntries(members.map(id => { try { const a = loadAccount(id); return [id, a.name]; } catch { return [id, id]; } }));
  const usernames = Object.fromEntries(members.map(id => { try { return [id, loadAccount(id).online?.username ?? null]; } catch { return [id, null]; } }));
  return { group, members, seed, me: account.id, leader: leaderOf(members), lead: leaderOf(members) === account.id, names, usernames,
    started: Date.now(), status: { id: account.id, name: account.name }, plan: null, met: false, metAt: 0, visited: false, visitAt: 0,
    hosted: new Set(), called: new Set(), lastChat: 0, lastLine: '', friendsAt: 0, friends: [], beatAt: 0, bye: false, ended: false, wins: 0 };
}

/** Walk to (x, z) on this world until within `near` metres (false when it could not get there). */
async function walkTo(bot, x, z, near = 3, tries = 25) {
  const { game } = bot;
  for (let i = 0; i < tries; i++) {
    const s = await game.snap(); if (Math.hypot(s.player.x - x, s.player.z - z) < near) return true;
    if (s.modal || s.dialog) { await game.closePanel(); continue; }
    if (!await game.stepToward(x, z, s)) await bot.hands.wheel(bot.rng.between(150, 300));
    await game.waitFor(n => !n.player.moving && n, { timeout: 5000, every: 250 });
  }
  return false;
}
/** A spot just outside one of the four village gates: open ground on the gate trail, beyond every private garden. */
function meetingPoint(s, rng) {
  const a = rng.int(0, 3) * Math.PI / 2, d = VILLAGE_RADII[Math.max(1, Math.min(5, s.villageRank ?? 1)) - 1] + rng.between(4, 6);
  return { x: Math.round(Math.cos(a) * d * 10) / 10, z: Math.round(Math.sin(a) * d * 10) / 10 };
}
/** Every member befriends every other (each from its own page); repeated until all are mutual friends. */
async function makeFriends(bot) {
  const c = bot.coop; c.friendsAt = Date.now();
  const want = c.members.filter(id => id !== c.me).map(id => c.usernames[id]).filter(Boolean);
  c.friends = await befriend(bot.page, want).catch(() => c.friends);
  if (c.friends.length === want.length && !c.friendsDone) { c.friendsDone = true; bot.log(`together: friends with ${c.friends.join(', ')}`); }
}

/**
 * The start of a together clip: the leader opens the party and waits at the gate; the others join it, come to the
 * gate and say hello. True when the group met; false (with bot.coop.why) when this explorer should play alone.
 */
export async function startTogether(bot) {
  const c = bot.coop, { game, log, note } = bot;
  const me = await whoAmI(bot.page); if (!me) { c.why = 'not signed in'; return false; }
  c.serverId = me.id; status(c, { serverId: me.id, username: me.username, serverName: me.name, met: false });
  await heartbeat(bot); await makeFriends(bot);
  const why = c.lead ? await leaderMeets(bot) : await memberMeets(bot);
  if (why) { c.why = why; return false; }
  c.met = true; c.metAt = Date.now(); status(c, { met: true });
  // Each explorer visits a mate's garden once, at some point in the clip (the leader later than the others).
  c.visitAt = c.metAt + (c.minutes ?? 60) * 60000 * (c.lead ? bot.rng.between(.35, .65) : bot.rng.between(.1, .4));
  bot.clip = { ...CLIPS.together, only: c.lead ? LEAD_TASKS : MEMBER_TASKS };
  // Every task ends in time for the goodbye (coopTick, the last minute and a bit).
  bot.taskCap = () => bot.coop && !bot.coop.bye && c.minutesLeft ? Math.max(15000, (c.minutesLeft() - BYE) * 60000) : Infinity;
  note(`group ${c.group} together: ${c.members.map(id => c.names[id]).join(', ')}${c.lead ? ' (leading)' : ''}`, 'coop');
  await makeFriends(bot);
  log(`together: met, party ${await myParty(bot.page)}`);
  return true;
}

async function leaderMeets(bot) {
  const c = bot.coop, { game, rng, log, hands } = bot;
  if ((await game.snap()).planet !== 'home') await goHome(bot);
  const s = await game.snap(); if (s.planet !== 'home') return 'could not get home for the meeting';
  // The clip's own private party (startOnline) becomes the group's.
  const code = await myParty(bot.page) ?? await createParty(bot); if (!code) return 'no party';
  const meet = meetingPoint(s, rng);
  writePlan(c, { group: c.group, members: c.members, leader: c.me, leaderServerId: c.serverId, code, planet: 'home', meet, at: Date.now(), boss: null });
  log(`together: leading group ${c.group}, party ${code}, meeting at (${meet.x}, ${meet.z})`);
  await walkTo(bot, meet.x, meet.z, 3);
  const end = Date.now() + MEET_WAIT;
  while (Date.now() < end) {
    if (Date.now() - c.beatAt > 15000) await heartbeat(bot);
    if (Date.now() - c.friendsAt > 20000) await makeFriends(bot);
    const n = await game.snap(), here = present(c, n).filter(m => m.d < 18);
    if (here.length) { await hands.think(900); await say(bot, 'greet'); return null; }
    // Waiting at the gate: a look around, a few steps, back to the spot.
    if (rng.chance(.3)) await flourish(bot);
    else if (Math.hypot(n.player.x - meet.x, n.player.z - meet.z) > 5) await walkTo(bot, meet.x, meet.z, 3, 4);
    else await hands.fidget(n.viewport.w, n.viewport.h);
    await sleep(rng.between(2000, 4000));
  }
  return 'nobody came to the meeting point within 4 minutes';
}

async function memberMeets(bot) {
  const c = bot.coop, { game, rng, log, hands } = bot;
  let p = null; const end = Date.now() + MEET_WAIT;
  while (!(p = plan(c)) && Date.now() < end) { if (Date.now() - c.beatAt > 15000) await heartbeat(bot); await hands.fidget(1200, 700); await sleep(3000); }
  if (!p) return "the leader's party did not show up within 4 minutes";
  if (p.cancelled) return 'the leader plays alone this clip';
  c.plan = p;
  let joined = false;
  for (let i = 0; i < 3 && !joined; i++) { joined = await joinParty(bot, p.code).catch(() => false); if (!joined) await sleep(3000); }
  if (!joined) return `could not join party ${p.code}`;
  if ((await game.snap()).planet !== p.planet) { const r = p.planet === 'home' ? await goHome(bot) : await travelTo(bot, p.planet); log(`together: to the leader's world → ${r}`); }
  if ((await game.snap()).planet !== p.planet) return `could not reach ${p.planet}`;
  await walkTo(bot, p.meet.x + rng.between(-2, 2), p.meet.z + rng.between(-2, 2), 4);
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    if (Date.now() - c.beatAt > 15000) await heartbeat(bot);
    if (Date.now() - c.friendsAt > 20000) await makeFriends(bot);
    if (plan(c)?.cancelled) return 'the leader plays alone this clip';
    const s = await game.snap(), lead = s.others.find(o => o.id === p.leaderServerId);
    if (lead && lead.d < 18) { await hands.think(1500); await say(bot, 'arrive'); return null; }
    if (lead) await walkTo(bot, lead.x, lead.z, 6, 4); else await walkTo(bot, p.meet.x, p.meet.z, 4, 4);
    await sleep(rng.between(1500, 3000));
  }
  return 'the leader was not at the meeting point';
}

/** No group this clip: say why, back to the explorer's own party, and play a solo theme instead. Returns the theme. */
export async function fallBack(bot, why) {
  const c = bot.coop;
  if (c) { status(c, { fallback: why, met: false }); c.ended = true; if (c.lead && c.plan) writePlan(c, { cancelled: why }); }
  if (bot.online && bot.online.room && bot.online.room !== bot.online.ownParty) await leaveToOwnParty(bot).catch(() => {});
  const s = await bot.game.snap();
  const theme = bot.rng.pick(['hunt', 'boss', 'quests', 'fishing'].filter(id => CLIPS[id].open(s)));
  bot.log(`together: ${why}; playing solo (${theme}) this clip`);
  bot.note(`no group this clip (${why}): ${theme} instead`, 'coop');
  bot.clip = CLIPS[theme]; bot.coop = null;
  return theme;
}

// ---- between tasks -----------------------------------------------------------------------------------------------
/** Called before every planner step: keeps this member's file fresh, finishes the friendships, says goodbye at the end. */
export async function coopTick(bot, { minutesLeft }) {
  const c = bot.coop; if (!c?.met || c.ended) return null;
  if (Date.now() - c.beatAt > 15000) await heartbeat(bot);
  if (!c.friendsDone && Date.now() - c.friendsAt > 60000) await makeFriends(bot);
  // The last minute: goodbye in the chat, then each back to its own party (the leader already is).
  if (minutesLeft() < BYE && !c.bye) {
    c.bye = true;
    if ((await bot.game.snap()).visit) await leaveGarden(bot).catch(() => {});
    await say(bot, 'bye', {}, { wait: Math.max(0, (minutesLeft() - .4) * 60000) });
    if (!c.lead) await leaveToOwnParty(bot).catch(() => {});
    c.ended = true; status(c, { ended: true });
    bot.note('said goodbye to the group', 'coop');
    return 'together: goodbye';
  }
  return null;
}

/** A quiet moment in a together clip: stay by the mates (or the meeting point), never wander off into a garden. */
export async function coopIdle(bot) {
  const c = bot.coop, { game, rng, hands } = bot, s = await game.snap(), p = plan(c);
  const at = present(c, s)[0] ?? (p?.meet && s.planet === p.planet ? p.meet : null);
  if (at && Math.hypot(s.player.x - at.x, s.player.z - at.z) > 8) await walkTo(bot, at.x + rng.between(-3, 3), at.z + rng.between(-3, 3), 3, 3);
  else if (rng.chance(.3)) await flourish(bot);
  else await hands.fidget(s.viewport.w, s.viewport.h);
  await hands.sleep(rng.between(1500, 4000));
}

/** The boss the leader called, while it is fresh and alive on this world (members). */
function bossCall(c, s) {
  const b = plan(c)?.boss; if (!b || b.done || b.at < Date.now() - 150000 || b.planet !== s.planet || c.called.has(b.at)) return null;
  return s.bosses.find(x => x.id === b.id && x.alive) ? b : null;
}
/** A mate announced a visit to this explorer's garden. */
const hostCall = c => mates(c).find(m => m.visit?.owner === c.me && m.visit.at > Date.now() - 120000 && !c.hosted.has(m.visit.at)) ?? null;

// ---- the planner's together tasks (planner.mjs TASKS) ---------------------------------------------------------------
export function coopTasks(bot, { minutesLeft }) {
  const on = () => !!bot.coop?.met && !bot.coop.ended, c = () => bot.coop;
  return {
    // The leader picks a boss the group can beat and calls it; the members come along when called.
    groupBoss: { can: s => on() && !s.visit && (c().lead ? !visiting(c()) && minutesLeft() > 2.5 && groupTargets(s, team(c(), s)).length > 0 : !!bossCall(c(), s)), run: s => c().lead ? leadBoss(bot, s) : joinBoss(bot, s), now: () => !c().lead, cool: 45000, base: 6, limit: 330000 },
    // Members stay with the leader (6–9 m) and fight what comes near.
    follow: { can: s => on() && !c().lead && !s.visit && !bossCall(c(), s) && !hostCall(c()), run: () => follow(bot, { seconds: bot.rng.between(45, 100) }), cool: 0, base: 3, limit: 200000 },
    visitMate: { can: s => on() && !c().visited && Date.now() > c().visitAt && s.planet === 'home' && !s.visit && minutesLeft() > 2.5 && !visiting(c()) && !hostCall(c()) && (c().lead || !bossCall(c(), s)) && mates(c()).some(m => m.planet === 'home'), run: () => visitMate(bot), cool: 120000, base: 3, limit: 200000 },
    host: { can: s => on() && s.planet === 'home' && !s.visit && !!hostCall(c()), run: () => host(bot), now: () => true, cool: 15000, base: 10, limit: 150000 },
    // Now and then the leader takes the group to another world (long clips only).
    groupTrip: { can: s => on() && c().lead && !c().trip && s.planet === 'home' && minutesLeft() > 20 && !visiting(c()) && !!tripPlanet(c(), s), run: s => groupTrip(bot, s), cool: 900000, base: 1, limit: 240000 },
  };
}

async function leadBoss(bot, s) {
  const c = bot.coop, { game, log } = bot;
  const target = groupTargets(s, team(c, s))[0]; if (!target) return 'no boss for the group';
  const call = { id: target.id, name: target.name, planet: s.planet, at: Date.now() };
  writePlan(c, { boss: call });
  log(`together: group boss ${target.name} (about ${target.seconds}s for ${team(c, s).length})`);
  await say(bot, 'boss', { boss: bossJa(target) });
  // The others are a few steps behind (or already on the way to the boss); give them a moment to close in.
  const near = (m, n) => { const b = n.bosses.find(x => x.id === target.id); return m.d < 20 || (b && Math.hypot(m.x - b.x, m.z - b.z) < 30); };
  await game.waitFor(n => present(c, n).some(m => near(m, n)) && n, { timeout: 30000, every: 1000 });
  const result = await huntBoss(bot, { id: target.id, loot: false });
  writePlan(c, { boss: { ...call, done: result } });
  if (result.startsWith('defeated')) await afterWin(bot);
  return 'group ' + result;
}

async function joinBoss(bot, s) {
  const c = bot.coop, call = bossCall(c, s); if (!call) return 'no call';
  c.called.add(call.at);
  await say(bot, 'join', {}, { chance: .5 });
  const result = await huntBoss(bot, { id: call.id, loot: false });
  if (result.startsWith('defeated')) await afterWin(bot);
  return 'group ' + result;
}

/** A mate in the log: its name in the game (two explorers may share one) and its account id. */
const who = m => `${m.name} (${m.id})`;
/**
 * After a group win: whoever has protected loot lying nearby may share it ("Share nearby loot") and leave it for the
 * others; the others pick up what is shared (and their own drops) and say thanks.
 */
async function afterWin(bot) {
  const c = bot.coop, { game, rng, note, log } = bot; c.wins++;
  const mine = await ownLootNear(bot, c.serverId).catch(() => []);
  if (mine.length && mates(c).length && rng.chance(.75) && await shareLoot(bot)) {
    const s = await game.snap();
    status(c, { share: { at: Date.now(), planet: s.planet, drops: mine.map(d => ({ x: d.x, z: d.z, item: d.item })) } });
    note(`shared ${mine.length} loot drops with the group`, 'coop');
    await say(bot, 'share');
    // Leave it for the others a while; what nobody took is picked up before it fades (30 s after the win).
    await sleep(rng.between(15000, 18000)); await collectLoot(bot, { range: 14 });
    return;
  }
  const before = bagTotal(await game.snap());
  await collectLoot(bot, { range: 22 });
  // A mate may be sharing its drops: wait a little for the call, then stand on each until the magnet has it.
  const shared = await game.waitFor(() => mates(c).find(m => m.share && m.share.at > Date.now() - 20000) ?? null, { timeout: 10000, every: 700 });
  if (shared) {
    for (const d of shared.share.drops ?? []) {
      await walkTo(bot, d.x, d.z, 2, 6);
      await game.waitFor(n => !n.drops.some(x => Math.hypot(x.x - d.x, x.z - d.z) < 1.5) && n, { timeout: 8000, every: 400 });
    }
    // The server's answer reaches the bag a moment later.
    await sleep(1500);
    const got = bagTotal(await game.snap()) - before;
    log(`together: picked up shared loot (+${got})`);
    if (got > 0) { note(`picked up loot ${who(shared)} shared`, 'coop'); await say(bot, 'thanks'); return; }
  }
  await say(bot, 'win', {}, { chance: .6 });
}

/** A member keeps near the leader: walks up when it falls behind, fights what comes close, follows it to other worlds. */
async function follow(bot, { seconds }) {
  const c = bot.coop, { game, rng, hands } = bot, end = Date.now() + seconds * 1000;
  let fights = 0;
  while (Date.now() < end) {
    const s = await game.snap();
    if (s.modal || s.dialog) { await game.closePanel(); continue; }
    if (bossCall(c, s)) return 'the leader called a boss';
    if (hostCall(c)) return 'a mate is coming to visit';
    if (Date.now() - c.beatAt > 15000) await heartbeat(bot);
    const p = plan(c), lead = mates(c).find(m => m.id === c.leader);
    // The leader flew elsewhere: after it.
    if (lead?.planet && lead.planet !== s.planet && !s.space) { const r = lead.planet === 'home' ? await goHome(bot) : await travelTo(bot, lead.planet); return `followed the leader → ${r}`; }
    const seen = s.others.find(o => o.id === p?.leaderServerId);
    if (!seen) {
      // Out of sight (in its own garden, visiting someone): wait at the meeting point.
      if (p?.meet && s.planet === p.planet && Math.hypot(s.player.x - p.meet.x, s.player.z - p.meet.z) > 6) await walkTo(bot, p.meet.x, p.meet.z, 5, 3);
      else { await hands.fidget(s.viewport.w, s.viewport.h); await sleep(rng.between(1500, 3000)); }
      continue;
    }
    if (seen.d > 9) {
      // A spot 5–7 m from the leader on this side, not right on top of it.
      const k = rng.between(5, 7) / seen.d;
      await walkTo(bot, seen.x + (s.player.x - seen.x) * k, seen.z + (s.player.z - seen.z) * k, 3, 3);
      continue;
    }
    const near = safeTargets(s, { range: 12 });
    if (near.length && fights < 3 && rng.chance(.5)) { fights++; await fight(bot, { count: 1, range: 12, timeout: 40000 }); continue; }
    if (rng.chance(.2)) await flourish(bot);
    else if (seen.d < 3.5) { const a = rng.between(0, Math.PI * 2); await game.stepToward(s.player.x + Math.cos(a) * 3, s.player.z + Math.sin(a) * 3, s); }
    else await hands.fidget(s.viewport.w, s.viewport.h);
    await sleep(rng.between(1500, 3500));
  }
  return `stayed with the leader${fights ? `, ${fights} fights` : ''}`;
}

/** Once per clip: a look round a mate's garden, perhaps a ripe crop taken (friends may), then home again. */
async function visitMate(bot) {
  const c = bot.coop, { game, rng, note, hands } = bot;
  const mate = rng.pick(mates(c).filter(m => m.planet === 'home')); if (!mate) return 'nobody to visit';
  if (!c.friends.includes(c.usernames[mate.id])) await makeFriends(bot);
  if (!c.friends.includes(c.usernames[mate.id])) return `not friends with ${who(mate)} yet`;
  status(c, { visit: { owner: mate.id, at: Date.now() } });
  await say(bot, 'visit', { name: mate.name });
  // A moment for the host to walk over to its garden.
  await sleep(rng.between(5000, 9000));
  if (!await visitGarden(bot, c.usernames[mate.id])) { status(c, { visit: null }); return `could not visit ${who(mate)}`; }
  // Once per clip: a visit that did not happen (not friends yet, the garden did not open) is tried again later.
  c.visited = true;
  status(c, { visit: { ...c.status.visit, arrived: Date.now() } });
  note(`visiting ${who(mate)}'s garden`, 'coop');
  let result = `visited ${who(mate)}'s garden`;
  try {
    for (let i = rng.int(1, 2); i > 0; i--) {
      const s = await game.snap(), bed = rng.pick(s.entities.filter(e => e.kind === 'plot')); if (!bed) break;
      await walkTo(bot, bed.x + rng.between(-2, 2), bed.z + rng.between(1.5, 3), 2.5, 5);
      await sleep(rng.between(1200, 2500));
    }
    let s = await game.snap();
    const ripe = (s.visit?.plots ?? []).filter(p => p.crop && p.progress >= 1);
    if (ripe.length && rng.chance(.7)) {
      const p = rng.pick(ripe), had = s.bag[p.crop] ?? 0, hp = s.hp;
      const got = await game.goTo(n => n.entities.find(e => e.kind === 'plot' && e.index === p.i), { label: 'ripe crop', done: n => ((n.bag[p.crop] ?? 0) > had || n.hp < hp - 1) && n, timeout: 30000 });
      if (got && (got.bag[p.crop] ?? 0) > had) { note(`picked a ${p.crop} in ${who(mate)}'s garden`, 'coop'); result += `, took a ${p.crop}`; await say(bot, 'steal', {}, { chance: .8 }); }
      else if (got) { note(`${who(mate)}'s guard dog chased the explorer off`, 'coop'); result += ', the guard dog bit'; await say(bot, 'bitten', {}, { chance: .8 }); }
    }
    // A last stroll past the beds (no map or menus: the garden stays on screen).
    const n = await game.snap(), a = rng.between(0, Math.PI * 2);
    await game.stepToward(n.player.x + Math.cos(a) * 4, n.player.z + Math.sin(a) * 4, n); await sleep(rng.between(2500, 5000));
  } finally {
    game.deadline = 0;
    await hands.think(600); await leaveGarden(bot).catch(() => {});
    status(c, { visit: null });
  }
  return result;
}

/** A mate is coming over: into this explorer's own garden to welcome it, until it goes home again. */
async function host(bot) {
  const c = bot.coop, { game, rng, note } = bot, call = hostCall(c); if (!call) return 'no visitor';
  c.hosted.add(call.visit.at);
  let s = await game.snap();
  const bed = rng.pick(s.entities.filter(e => e.kind === 'plot'));
  await walkTo(bot, bed ? bed.x + rng.between(-2, 2) : 0, bed ? bed.z + rng.between(1.5, 3) : 2, 3, 12);
  const end = Date.now() + 100000; let greeted = false, seen = false, arrived = false;
  while (Date.now() < end) {
    s = await game.snap();
    const visit = mates(c).find(m => m.id === call.id)?.visit, guest = s.others.find(o => o.id === call.serverId);
    seen ||= !!guest; arrived ||= !!visit?.arrived;
    // The guest stands in this garden once its visit has begun (before that it may be in sight outside).
    if (guest && visit?.arrived && !greeted) { greeted = true; note(`${who(call)} came to visit`, 'coop'); await say(bot, 'host'); }
    if (visit?.at !== call.visit.at) break;
    if (rng.chance(.25)) await flourish(bot); else await bot.hands.fidget(s.viewport.w, s.viewport.h);
    await sleep(rng.between(2000, 4000));
  }
  const fromCentre = Math.round(Math.hypot(s.player.x, s.player.z));
  // Back out to the meeting point (members) or on with the day (the leader).
  const p = plan(c); if (!c.lead && p?.meet && s.planet === p.planet) await walkTo(bot, p.meet.x, p.meet.z, 5, 8);
  return greeted ? `welcomed ${who(call)}` : `${who(call)} did not show up (in sight ${seen}, arrived ${arrived}, ${fromCentre} m from the cottage)`;
}

/** A world the whole group is ready for and the leader knows (null: stay home). */
function tripPlanet(c, s) {
  const low = Math.min(...team(c, s).map(m => m.level));
  const open = Object.entries(LEVELS).filter(([id, level]) => id !== 'home' && level <= low && s.discovered.includes(id)).map(([id]) => id);
  return open.length ? open[Math.floor((c.seed.length * 7 + new Date().getHours()) % open.length)] : null;
}
async function groupTrip(bot, s) {
  const c = bot.coop, target = tripPlanet(c, s); if (!target) return 'nowhere to go together';
  c.trip = target;
  await say(bot, 'trip', { planet: planetJa(target) });
  await sleep(bot.rng.between(4000, 7000));
  const r = await travelTo(bot, target);
  if (r.startsWith('landed')) { writePlan(c, { planet: target }); await heartbeat(bot); }
  return `group trip → ${r}`;
}
