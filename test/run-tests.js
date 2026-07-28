#!/usr/bin/env node
// Zero-dependency test harness: loads the browser-global JS files via vm
// and asserts with a tiny check() helper. Run: node test/run-tests.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console });
let source = '';
for (const file of ['js/rules.js', 'js/scoring.js']) {
  source += fs.readFileSync(path.join(__dirname, '..', file), 'utf8') + '\n';
}
// const declarations don't land on the context global, so evaluate the
// module names in one script and return them.
const { Rules, Scoring } = vm.runInContext(source + '\n;({ Rules, Scoring });', ctx);

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL ${name}\n  expected ${e}\n  actual   ${a}`); }
}

// --- fixtures for tests ---
let nextId = 1;
function player(overrides) {
  return Object.assign({
    id: nextId++, web_name: 'P' + nextId, team: 1, element_type: 3,
    now_cost: 50, total_points: 100, points_per_game: '4.0', form: '5.0',
    expected_goal_involvements: '10.0', ict_index: '100.0', minutes: 3000,
    starts: 30, status: 'a', chance_of_playing_next_round: null,
  }, overrides);
}
function fullSquad() {
  // 2 GK, 5 DEF, 5 MID, 3 FWD across enough clubs, cheap enough for budget
  const squad = [];
  const comp = { 1: 2, 2: 5, 3: 5, 4: 3 };
  let team = 1;
  for (const [type, n] of Object.entries(comp)) {
    for (let i = 0; i < n; i++) {
      squad.push(player({ element_type: parseInt(type, 10), team, now_cost: 60 }));
      team = (team % 10) + 1;
    }
  }
  return squad;
}

// --- Rules tests ---
check('cost sums now_cost', Rules.cost([player({ now_cost: 45 }), player({ now_cost: 55 })]), 100);
check('formatPrice', Rules.formatPrice(1000), '£100.0m');

check('canAdd ok on empty squad', Rules.canAdd([], player()).ok, true);
check('canAdd rejects duplicate',
  (() => { const p = player(); return Rules.canAdd([p], p).ok; })(), false);
check('canAdd rejects 4th from same club',
  Rules.canAdd([player({ team: 5 }), player({ team: 5, element_type: 2 }), player({ team: 5, element_type: 4 })],
    player({ team: 5, element_type: 1 })).ok, false);
check('canAdd rejects 3rd GK',
  Rules.canAdd([player({ element_type: 1, team: 1 }), player({ element_type: 1, team: 2 })],
    player({ element_type: 1, team: 3 })).ok, false);
check('canAdd allows going over budget (negative bank shown instead)',
  Rules.canAdd([player({ now_cost: 960 })], player({ now_cost: 50, team: 2 })).ok, true);
check('canAdd allows exactly on budget',
  Rules.canAdd([player({ now_cost: 950 })], player({ now_cost: 50, team: 2 })).ok, true);
check('validateSquad still flags over budget',
  (() => { const s = fullSquad(); s[0].now_cost = 1000; return Rules.validateSquad(s).ok; })(), false);

check('validateSquad ok for valid 15', Rules.validateSquad(fullSquad()).ok, true);
check('validateSquad rejects 14', Rules.validateSquad(fullSquad().slice(1)).ok, false);
check('validateSquad rejects wrong composition',
  (() => { const s = fullSquad(); s[0].element_type = 2; return Rules.validateSquad(s).ok; })(), false);

// --- Scoring tests ---
const pop = [player({ form: '10.0' }), player({ form: '5.0' })];
const stats = Scoring.populationStats(pop);
check('baseScore top of population near weight ceiling',
  Scoring.baseScore(pop[0], stats) > 99, true);

check('fixtureMultiplier blank GW is 0',
  Scoring.fixtureMultiplier(player({ team: 1 }), []), 0);
check('fixtureMultiplier easy home fixture boosts',
  Scoring.fixtureMultiplier(player({ team: 1 }),
    [{ team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4 }]), 1.10);
check('fixtureMultiplier double GW sums',
  Scoring.fixtureMultiplier(player({ team: 1 }), [
    { team_h: 1, team_a: 2, team_h_difficulty: 3, team_a_difficulty: 3 },
    { team_h: 3, team_a: 1, team_h_difficulty: 3, team_a_difficulty: 3 },
  ]), 2.0);

check('availability full for active', Scoring.availabilityPenalty(player()), 1);
check('availability zero for injured', Scoring.availabilityPenalty(player({ status: 'i' })), 0);
check('availability uses chance for doubtful',
  Scoring.availabilityPenalty(player({ status: 'd', chance_of_playing_next_round: 50 })), 0.5);

// bestXI: full squad, all playing GW fixtures
const squad = fullSquad();
const gwFixtures = [];
for (let t = 1; t <= 10; t += 2) {
  gwFixtures.push({ team_h: t, team_a: t + 1, team_h_difficulty: 3, team_a_difficulty: 3 });
}
const sstats = Scoring.populationStats(squad);
const xi = Scoring.bestXI(squad, sstats, gwFixtures);
check('bestXI returns 11 players', xi.xi.length, 11);
check('bestXI bench has 4', xi.bench.length, 4);
check('bestXI has exactly 1 GK', xi.xi.filter(s => s.player.element_type === 1).length, 1);
check('bestXI formation is valid',
  (() => {
    const [d, m, f] = xi.formation.split('-').map(Number);
    return d >= 3 && d <= 5 && m >= 2 && m <= 5 && f >= 1 && f <= 3 && d + m + f === 10;
  })(), true);
check('bestXI captain is in the XI', xi.xi.includes(xi.captain), true);

// injured star sits out: make one MID hugely better but injured
const squad2 = fullSquad();
const mids = squad2.filter(p => p.element_type === 3);
mids[0].form = '20.0'; mids[0].status = 'i';
const xi2 = Scoring.bestXI(squad2, Scoring.populationStats(squad2), gwFixtures);
check('injured player benched despite high form',
  xi2.xi.some(s => s.player.id === mids[0].id), false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
