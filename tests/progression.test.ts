import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import { ENEMY_TYPES } from '../src/enemy-types.ts';

const start=Date.UTC(2026,8,30,12);
const reload=(s:M.SaveState)=>M.parseSave(JSON.stringify(s))!;
test('story progression counts only actions performed during the current event step',()=>{
  const s=M.newGame();P.recordEvent(s,'sell',100,undefined,start);P.recordEvent(s,'harvest',3,undefined,start);
  const first=P.progressEntries(s,'story',start)[0];assert.equal(first.complete,true);assert.equal(first.rewardLabel,'36 energy · 6 XP · 15 stars');assert.equal(P.claimProgress(s,'story',first.id,start),true);assert.equal(P.claimProgress(s,'story',first.id,start),false);
  assert.equal(P.progressEntries(s,'story',start)[0].progress,0);P.recordEvent(s,'sell',19,undefined,start);assert.equal(P.claimProgress(s,'story','story:1',start),false);P.recordEvent(s,'sell',1,undefined,start);assert.equal(P.claimProgress(s,'story','story:1',start),true);assert.equal(s.quest,2);
});
test('daily and weekly selections are deterministic, unique and level eligible',()=>{
  const a=M.newGame('Tester'),b=M.newGame('Tester');P.refreshProgress(a,start);P.refreshProgress(b,start);
  assert.deepEqual(a.progression.daily,b.progression.daily);assert.equal(a.progression.daily.tasks.length,3);assert.equal(new Set(a.progression.daily.tasks.map(t=>t.type)).size,3);assert.equal(a.progression.weekly.tasks.length,4);assert.equal(new Set(a.progression.weekly.tasks.map(t=>t.type)).size,4);
  assert.ok(a.progression.daily.tasks.every(t=>!['boss','planet'].includes(t.type)));const prior=a.progression.daily.tasks.map(t=>t.type);assert.equal(P.rerollDaily(a,0,start),true);assert.ok(!prior.includes(a.progression.daily.tasks[0].type));assert.equal(P.rerollDaily(a,1,start),false);
});
test('daily quests, daily chest and check-in each award once and persist',()=>{
  const s=M.newGame();P.refreshProgress(s,start);
  const login=P.progressEntries(s,'daily',start).find(e=>e.id.endsWith('login'))!;assert.equal(P.claimProgress(s,'daily',login.id,start),true);assert.equal(s.energy,30);assert.equal(s.progression.login.streak,1);assert.equal(P.claimProgress(reload(s),'daily',login.id,start),false);
  for(const t of s.progression.daily.tasks){P.recordEvent(s,t.type,t.target,undefined,start);}
  const tasks=P.progressEntries(s,'daily',start).filter(e=>!e.id.endsWith('login')&&!e.id.endsWith('chest'));for(const entry of tasks){assert.equal(entry.complete,true,entry.title);assert.equal(P.claimProgress(s,'daily',entry.id,start),true);assert.equal(P.claimProgress(s,'daily',entry.id,start),false);}
  const chest=P.progressEntries(s,'daily',start).find(e=>e.id.endsWith('chest'))!;assert.equal(chest.complete,true);assert.equal(P.claimProgress(s,'daily',chest.id,start),true);assert.equal(P.claimProgress(reload(s),'daily',chest.id,start),false);
  const tomorrow=start+86400000;assert.equal(P.claimProgress(s,'daily',login.id,tomorrow),false);const next=P.progressEntries(s,'daily',tomorrow).find(e=>e.id.endsWith('login'))!;assert.equal(P.claimProgress(s,'daily',next.id,tomorrow),true);assert.equal(s.progression.login.streak,2);assert.equal(s.progression.daily.chest,false);
});
test('UTC week and month boundaries reject stale rewards and reset only their periods',()=>{
  const s=M.newGame();P.refreshProgress(s,start);s.progression.pass.stars=50;const pass=P.progressEntries(s,'pass',start)[0];assert.equal(P.claimProgress(s,'pass',pass.id,start),true);assert.equal(s.bag.potion,3);assert.equal(P.claimProgress(reload(s),'pass',pass.id,start),false);
  P.recordEvent(s,'kill',2,undefined,start);const oldWeek=s.progression.weekly.key;P.refreshProgress(s,Date.UTC(2026,9,1));assert.equal(s.progression.pass.stars,0);assert.equal(s.progression.weekly.key,oldWeek);assert.equal(P.claimProgress(s,'pass',pass.id,Date.UTC(2026,9,1)),false);P.refreshProgress(s,Date.UTC(2026,9,5));assert.equal(s.progression.weekly.key,'2026-10-05');assert.ok(s.progression.weekly.tasks.every(t=>t.progress===0));assert.equal(s.progression.totals.kill,2);
});
test('weekly targets and chest require completed claims and cannot be replayed',()=>{
  const s=M.newGame();P.refreshProgress(s,start);let chest=P.progressEntries(s,'weekly',start).find(e=>e.id.endsWith('chest'))!;assert.equal(P.claimProgress(s,'weekly',chest.id,start),false);
  for(const t of s.progression.weekly.tasks)P.recordEvent(s,t.type,t.target,undefined,start);for(const e of P.progressEntries(s,'weekly',start).filter(e=>!e.id.endsWith('chest')))assert.equal(P.claimProgress(s,'weekly',e.id,start),true);
  chest=P.progressEntries(s,'weekly',start).find(e=>e.id.endsWith('chest'))!;assert.equal(chest.complete,true);assert.equal(P.claimProgress(s,'weekly',chest.id,start),true);assert.ok((s.bag.seed_star||0)>=2);assert.ok((s.bag.moonstone||0)>=1);assert.equal(P.claimProgress(reload(s),'weekly',chest.id,start),false);
});
test('achievements unlock successive tiers and cannot replay a claimed tier',()=>{
  const s=M.newGame();P.recordEvent(s,'kill',50,undefined,start);const first=P.progressEntries(s,'achievements',start).find(e=>e.id==='kills:0')!;assert.equal(first.complete,true);assert.equal(P.claimProgress(s,'achievements',first.id,start),true);assert.equal(P.claimProgress(s,'achievements',first.id,start),false);
  const next=P.progressEntries(reload(s),'achievements',start).find(e=>e.id==='kills:1')!;assert.equal(next.target,200);assert.equal(next.progress,50);assert.equal(next.complete,false);
});
test('bounties count only the requested creature and expire at the saved half-hour boundary',()=>{
  const s=M.newGame();P.refreshProgress(s,start);const b=s.progression.bounty!;P.recordEvent(s,'kill',20,'not-the-target',start);assert.equal(b.progress,0);P.recordEvent(s,'kill',b.target,b.type,start);const entry=P.progressEntries(s,'bounties',start)[0];assert.equal(entry.complete,true);assert.equal(P.claimProgress(s,'bounties',entry.id,start),true);assert.equal(P.claimProgress(reload(s),'bounties',entry.id,start),false);assert.equal(s.progression.totals.bounty,1);
  P.refreshProgress(s,b.ends);assert.notEqual(s.progression.bounty!.key,b.key);assert.equal(s.progression.bounty!.progress,0);assert.equal(P.claimProgress(s,'bounties',entry.id,b.ends),false);
});
test('bounty and challenge labels name the creature and the task, not internal ids',()=>{
  for(const[id,planet]of Object.entries(M.PLANETS))for(const[type]of planet.spawns)assert.ok(ENEMY_TYPES[type]?.name,`${id}: bounty candidate ${type} has no display name`);
  const s=M.newGame();P.refreshProgress(s,start);const b=s.progression.bounty!;const bounty=P.progressEntries(s,'bounties',start)[0];
  assert.equal(bounty.title,`Wanted: ${ENEMY_TYPES[b.type].name}`);assert.ok(!bounty.title.endsWith(`: ${b.type}`));
  s.level=2;assert.equal(P.startChallenge(s,'kill',start),true);assert.equal(P.progressEntries(s,'challenges',start)[0].title,'Quick challenge: Defeat creatures');
});
test('timed challenges track successful actions and preserve/restart streaks correctly',()=>{
  const s=M.newGame();assert.equal(P.startChallenge(s,'kill',start),false);s.level=2;assert.equal(P.startChallenge(s,'kill',start),true);assert.equal(P.startChallenge(s,'fish',start),false);P.recordEvent(s,'kill',4,'mushroom',start+5000);const entry=P.progressEntries(s,'challenges',start+5000)[0];assert.equal(entry.complete,true);assert.equal(P.claimProgress(s,'challenges',entry.id,start+5000),true);assert.equal(s.progression.streak,1);assert.equal(P.claimProgress(reload(s),'challenges',entry.id,start+5000),false);
  assert.equal(P.startChallenge(s,'skill',start+6000),true);P.refreshProgress(s,start+51001);assert.equal(s.progression.challenge,null);assert.equal(s.progression.streak,0);assert.equal(s.progression.bestStreak,1);
});
test('collection records every acquired item and offers no invented claimable reward',()=>{
  const s=M.newGame();for(const id of M.COLLECTIONS.lava.items)M.addItem(s,id);const entry=P.progressEntries(s,'collection',start).find(e=>e.id==='lava')!;assert.equal(entry.complete,true);assert.equal(entry.claimed,true);assert.equal(P.claimProgress(s,'collection','lava',start),false);const r=reload(s);assert.deepEqual(r.collection,s.collection);
});
test('malformed progression tasks regenerate and prototype-named events are rejected',()=>{
  const s=M.newGame();P.refreshProgress(s,start);s.progression.daily.tasks=[];const r=reload(s);assert.equal(P.progressEntries(r,'daily',start).filter(e=>!e.id.endsWith('login')&&!e.id.endsWith('chest')).length,3);
  const before=JSON.stringify(r);P.recordEvent(r,'constructor',2);P.recordEvent(r,'__proto__',2);assert.equal(JSON.stringify(r),before);assert.equal(P.startChallenge(r,'constructor',start),false);
});
