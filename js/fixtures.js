// Season fixtures view: 20 teams x 38 gameweeks ticker with FDR colouring,
// plus a per-gameweek match list.
const Fixtures = {
  teamById: null,

  init() {
    this.teamById = new Map(FPL_TEAMS.map(t => [t.id, t]));
    this.renderTicker();
    this.populateGwSelect();
    const nextGw = FPL_EVENTS.find(e => e.is_next) || FPL_EVENTS[0];
    document.getElementById('fixtures-gw-select').value = String(nextGw.id);
    this.renderGwMatches(nextGw.id);
  },

  // For a team and gameweek: list of {opponent, home, fdr}.
  teamGwFixtures(teamId, gw) {
    return FPL_FIXTURES
      .filter(f => f.event === gw && (f.team_h === teamId || f.team_a === teamId))
      .map(f => {
        const home = f.team_h === teamId;
        return {
          opponent: this.teamById.get(home ? f.team_a : f.team_h),
          home,
          fdr: home ? f.team_h_difficulty : f.team_a_difficulty,
        };
      });
  },

  renderTicker() {
    const table = document.getElementById('fixture-ticker');
    const gws = FPL_EVENTS.map(e => e.id);
    let html = '<thead><tr><th class="ticker-team">Team</th>';
    gws.forEach(gw => { html += `<th>${gw}</th>`; });
    html += '</tr></thead><tbody>';

    const teams = [...FPL_TEAMS].sort((a, b) => a.name.localeCompare(b.name));
    teams.forEach(team => {
      html += `<tr><td class="ticker-team">${team.short_name}</td>`;
      gws.forEach(gw => {
        const fx = this.teamGwFixtures(team.id, gw);
        if (fx.length === 0) {
          html += '<td class="fdr-blank">–</td>';
        } else {
          const cells = fx.map(f =>
            `<span class="fdr fdr-${f.fdr}">${f.opponent.short_name}${f.home ? '' : '*'}</span>`
          ).join('');
          html += `<td>${cells}</td>`;
        }
      });
      html += '</tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
  },

  populateGwSelect() {
    const select = document.getElementById('fixtures-gw-select');
    select.innerHTML = FPL_EVENTS.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    select.addEventListener('change', () => this.renderGwMatches(parseInt(select.value, 10)));
  },

  renderGwMatches(gw) {
    const event = FPL_EVENTS.find(e => e.id === gw);
    const list = document.getElementById('fixtures-gw-list');
    const matches = FPL_FIXTURES.filter(f => f.event === gw)
      .sort((a, b) => (a.kickoff_time || '').localeCompare(b.kickoff_time || ''));
    const deadline = event && event.deadline_time
      ? `<p class="gw-deadline">Deadline: ${new Date(event.deadline_time).toLocaleString()}</p>` : '';
    list.innerHTML = deadline + matches.map(f => {
      const home = this.teamById.get(f.team_h);
      const away = this.teamById.get(f.team_a);
      const when = f.kickoff_time
        ? new Date(f.kickoff_time).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : 'TBC';
      return `<div class="match-row">
        <span class="match-team">${home.name}</span>
        <span class="fdr fdr-${f.team_h_difficulty}" title="Difficulty for ${home.name}">${f.team_h_difficulty}</span>
        <span class="match-vs">v</span>
        <span class="fdr fdr-${f.team_a_difficulty}" title="Difficulty for ${away.name}">${f.team_a_difficulty}</span>
        <span class="match-team match-away">${away.name}</span>
        <span class="match-time">${when}</span>
      </div>`;
    }).join('');
  },
};
