// Version badge — shows the latest commit of the deployed branch, linking to
// the repo's commit history. Fetched client-side from the GitHub API (no
// build step to inject a version), cached per session to stay well under the
// unauthenticated rate limit. Fails silent: no badge when offline/rate-limited.

const VERSION_REPO = 'jerrythemouse18/fantasy-planner-app';
const VERSION_BRANCH = 'main';

(function versionBadge() {
  const el = document.querySelector('#version-badge');
  if (!el) return;

  const render = c => {
    const date = new Date(c.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    el.innerHTML =
      `<a href="https://github.com/${VERSION_REPO}/commits/${VERSION_BRANCH}" target="_blank" rel="noopener" ` +
      `title="${c.message.split('\n')[0].replace(/"/g, '&quot;')} — click for commit history">` +
      `<span class="vb-dot"></span>${c.sha.slice(0, 7)} · ${date}</a>`;
  };

  try {
    const cached = sessionStorage.getItem('version-badge');
    if (cached) { render(JSON.parse(cached)); return; }
  } catch (e) { /* storage unavailable — fall through to fetch */ }

  fetch(`https://api.github.com/repos/${VERSION_REPO}/commits/${VERSION_BRANCH}`)
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(j => {
      const c = { sha: j.sha, date: j.commit.committer.date, message: j.commit.message };
      try { sessionStorage.setItem('version-badge', JSON.stringify(c)); } catch (e) { /* ignore */ }
      render(c);
    })
    .catch(() => { /* offline, local dev, or rate-limited — leave badge empty */ });
})();
