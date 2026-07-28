// Main app: tab switching, squad builder UI, best-XI view.
const App = {
  squad: [],
  stats: null,
  filters: { search: '', position: 0, team: 0, sort: 'total_points' },
  teamById: null,

  init() {
    this.teamById = new Map(FPL_TEAMS.map(t => [t.id, t]));
    this.stats = Scoring.populationStats(FPL_PLAYERS);
    this.squad = Storage.loadSquad(FPL_PLAYERS);
    this.initTabs();
    this.initFilters();
    this.initBestXiControls();
    this.renderPlayerTable();
    this.renderSquad();
    Fixtures.init();
    this.renderMeta();
  },

  initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'tab-bestxi') this.renderBestXI();
      });
    });
  },

  // --- Player table (candidate list) ---

  initFilters() {
    const teamSelect = document.getElementById('filter-team');
    teamSelect.innerHTML = '<option value="0">All clubs</option>' +
      [...FPL_TEAMS].sort((a, b) => a.name.localeCompare(b.name))
        .map(t => `<option value="${t.id}">${t.name}</option>`).join('');

    document.getElementById('filter-search').addEventListener('input', e => {
      this.filters.search = e.target.value.toLowerCase();
      this.renderPlayerTable();
    });
    document.getElementById('filter-position').addEventListener('change', e => {
      this.filters.position = parseInt(e.target.value, 10);
      this.renderPlayerTable();
    });
    teamSelect.addEventListener('change', e => {
      this.filters.team = parseInt(e.target.value, 10);
      this.renderPlayerTable();
    });
    document.getElementById('filter-sort').addEventListener('change', e => {
      this.filters.sort = e.target.value;
      this.renderPlayerTable();
    });
  },

  sortValue(p) {
    switch (this.filters.sort) {
      case 'now_cost': return p.now_cost;
      case 'form': return parseFloat(p.form) || 0;
      case 'points_per_game': return parseFloat(p.points_per_game) || 0;
      case 'ict_index': return parseFloat(p.ict_index) || 0;
      case 'xgi': return parseFloat(p.expected_goal_involvements) || 0;
      case 'selected': return parseFloat(p.selected_by_percent) || 0;
      case 'value': return p.now_cost > 0 ? p.total_points / p.now_cost : 0;
      default: return p.total_points;
    }
  },

  renderPlayerTable() {
    const squadIds = new Set(this.squad.map(p => p.id));
    const f = this.filters;
    const rows = FPL_PLAYERS
      .filter(p =>
        (!f.position || p.element_type === f.position) &&
        (!f.team || p.team === f.team) &&
        (!f.search || p.web_name.toLowerCase().includes(f.search) ||
          `${p.first_name} ${p.second_name}`.toLowerCase().includes(f.search)))
      .sort((a, b) => this.sortValue(b) - this.sortValue(a))
      .slice(0, 100);

    document.getElementById('player-rows').innerHTML = rows.map(p => {
      const inSquad = squadIds.has(p.id);
      const verdict = inSquad ? null : Rules.canAdd(this.squad, p);
      const flag = Scoring.UNAVAILABLE_STATUSES[p.status]
        ? ` <span class="status-flag" title="${p.news || Scoring.UNAVAILABLE_STATUSES[p.status]}">⛔</span>`
        : (p.status === 'd' ? ` <span class="status-flag" title="${p.news || 'Doubtful'}">⚠️</span>` : '');
      const btn = inSquad
        ? `<button class="btn-remove" data-id="${p.id}">Remove</button>`
        : (verdict.ok
          ? `<button class="btn-add" data-id="${p.id}">Add</button>`
          : `<button class="btn-add" disabled title="${verdict.reason}">Add</button>`);
      return `<tr class="${inSquad ? 'row-in-squad' : ''}">
        <td>${p.web_name}${flag}</td>
        <td>${this.teamById.get(p.team).short_name}</td>
        <td>${Rules.POSITION_NAMES[p.element_type]}</td>
        <td class="num">${Rules.formatPrice(p.now_cost)}</td>
        <td class="num">${p.total_points}</td>
        <td class="num">${p.points_per_game}</td>
        <td class="num">${p.form}</td>
        <td class="num">${p.expected_goal_involvements}</td>
        <td class="num">${p.ict_index}</td>
        <td class="num">${p.selected_by_percent}%</td>
        <td>${btn}</td>
      </tr>`;
    }).join('');

    document.querySelectorAll('#player-rows .btn-add:not([disabled])').forEach(b =>
      b.addEventListener('click', () => this.addPlayer(parseInt(b.dataset.id, 10))));
    document.querySelectorAll('#player-rows .btn-remove').forEach(b =>
      b.addEventListener('click', () => this.removePlayer(parseInt(b.dataset.id, 10))));
  },

  addPlayer(id) {
    const player = FPL_PLAYERS.find(p => p.id === id);
    const verdict = Rules.canAdd(this.squad, player);
    if (!verdict.ok) return;
    this.squad.push(player);
    Storage.saveSquad(this.squad);
    this.renderPlayerTable();
    this.renderSquad();
  },

  removePlayer(id) {
    this.squad = this.squad.filter(p => p.id !== id);
    Storage.saveSquad(this.squad);
    this.renderPlayerTable();
    this.renderSquad();
  },

  // --- Squad panel ---

  renderSquad() {
    const spent = Rules.cost(this.squad);
    const bank = Rules.BUDGET - spent;
    document.getElementById('budget-bar').innerHTML =
      `<span>Squad: <strong>${this.squad.length}/15</strong></span>
       <span>Spent: <strong>${Rules.formatPrice(spent)}</strong></span>
       <span class="${bank < 0 ? 'over-budget' : ''}">Bank: <strong>${Rules.formatPrice(bank)}</strong></span>`;

    const byPos = { 1: [], 2: [], 3: [], 4: [] };
    this.squad.forEach(p => byPos[p.element_type].push(p));

    document.getElementById('squad-slots').innerHTML = [1, 2, 3, 4].map(type => {
      const want = Rules.SQUAD_COMPOSITION[type];
      const have = byPos[type];
      const slots = have.map(p =>
        `<div class="slot slot-filled">
          <span class="slot-name">${p.web_name}</span>
          <span class="slot-meta">${this.teamById.get(p.team).short_name} · ${Rules.formatPrice(p.now_cost)}</span>
          <button class="slot-x" data-id="${p.id}" title="Remove">×</button>
        </div>`).join('') +
        Array(Math.max(0, want - have.length)).fill(`<div class="slot slot-empty">—</div>`).join('');
      return `<div class="pos-group">
        <h3>${Rules.POSITION_NAMES[type]} <span class="pos-count">${have.length}/${want}</span></h3>
        <div class="slot-row">${slots}</div>
      </div>`;
    }).join('');

    document.querySelectorAll('#squad-slots .slot-x').forEach(b =>
      b.addEventListener('click', () => this.removePlayer(parseInt(b.dataset.id, 10))));

    const validation = Rules.validateSquad(this.squad);
    document.getElementById('squad-status').innerHTML = validation.ok
      ? '<span class="squad-ok">✓ Squad complete and valid</span>'
      : validation.errors.map(e => `<span class="squad-err">${e}</span>`).join('');
  },

  // --- Best XI ---

  initBestXiControls() {
    const select = document.getElementById('bestxi-gw-select');
    select.innerHTML = FPL_EVENTS.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    const nextGw = FPL_EVENTS.find(e => e.is_next) || FPL_EVENTS[0];
    select.value = String(nextGw.id);
    select.addEventListener('change', () => this.renderBestXI());
  },

  renderBestXI() {
    const container = document.getElementById('bestxi-result');
    if (this.squad.length !== 15) {
      container.innerHTML = `<p class="hint">Complete your 15-player squad first (currently ${this.squad.length}/15).</p>`;
      return;
    }
    const gw = parseInt(document.getElementById('bestxi-gw-select').value, 10);
    const gwFixtures = FPL_FIXTURES.filter(f => f.event === gw);
    const result = Scoring.bestXI(this.squad, this.stats, gwFixtures);
    if (!result) {
      container.innerHTML = '<p class="hint">Could not form a valid XI from this squad.</p>';
      return;
    }

    const row = (s, extra) => {
      const p = s.player;
      const fx = Fixtures.teamGwFixtures(p.team, gw);
      const fxLabel = fx.length === 0 ? '<span class="fdr-blank">blank</span>'
        : fx.map(f => `<span class="fdr fdr-${f.fdr}">${f.opponent.short_name} (${f.home ? 'H' : 'A'})</span>`).join(' ');
      return `<tr>
        <td>${p.web_name}${extra || ''}</td>
        <td>${Rules.POSITION_NAMES[p.element_type]}</td>
        <td>${this.teamById.get(p.team).short_name}</td>
        <td>${fxLabel}</td>
        <td class="num" title="base ${s.score.base.toFixed(1)} × fixture ${s.score.fixture.toFixed(2)} × availability ${s.score.availability.toFixed(2)}">${s.score.total.toFixed(1)}</td>
      </tr>`;
    };

    container.innerHTML = `
      <p class="bestxi-summary">Formation: <strong>${result.formation}</strong> ·
        Captain pick: <strong>${result.captain.player.web_name}</strong></p>
      <table class="data-table">
        <thead><tr><th>Player</th><th>Pos</th><th>Club</th><th>GW${gw} fixture</th><th>Score</th></tr></thead>
        <tbody>
          ${result.xi.map(s => row(s, s === result.captain ? ' <span class="cap-badge">C</span>' : '')).join('')}
        </tbody>
      </table>
      <h3>Bench (in order)</h3>
      <table class="data-table">
        <tbody>${result.bench.map(s => row(s)).join('')}</tbody>
      </table>
      <p class="hint">Score = composite of form, points/game, xGI per start, ICT and minutes (0–100),
        multiplied by fixture difficulty and availability. Hover a score for the breakdown.</p>`;
  },

  renderMeta() {
    const el = document.getElementById('data-freshness');
    if (typeof FPL_META !== 'undefined' && FPL_META.fetched_at) {
      el.textContent = `Data snapshot: ${FPL_META.fetched_at.slice(0, 10)}`;
    }
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
