const API_ROOT = 'https://api.github.com';
const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572a5',
  Java: '#b07219',
  Go: '#00add8',
  Rust: '#dea584',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4f5d95',
  Swift: '#f05138',
  Kotlin: '#a97bff',
  Dart: '#00b4ab',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Vue: '#41b883',
  Jupyter: '#da5b0b'
};

const elements = {
  form: document.querySelector('#lookup-form'),
  username: document.querySelector('#username-input'),
  analyzeButton: document.querySelector('.analyze-button'),
  results: document.querySelector('#results'),
  welcome: document.querySelector('#welcome-state'),
  loading: document.querySelector('#loading-state'),
  error: document.querySelector('#error-state'),
  errorTitle: document.querySelector('#error-title'),
  errorMessage: document.querySelector('#error-message'),
  dashboard: document.querySelector('#dashboard'),
  avatar: document.querySelector('#profile-avatar'),
  name: document.querySelector('#profile-name'),
  handle: document.querySelector('#profile-handle'),
  bio: document.querySelector('#profile-bio'),
  location: document.querySelector('#profile-location'),
  joined: document.querySelector('#profile-joined'),
  profileLink: document.querySelector('#github-profile-link'),
  reposStat: document.querySelector('#stat-repos'),
  starsStat: document.querySelector('#stat-stars'),
  followersStat: document.querySelector('#stat-followers'),
  languageStat: document.querySelector('#stat-language'),
  languageCaption: document.querySelector('#stat-language-caption'),
  languageNote: document.querySelector('#language-note'),
  languageBar: document.querySelector('#language-bar'),
  languageLegend: document.querySelector('#language-legend'),
  repoGrid: document.querySelector('#repo-grid'),
  repoSearch: document.querySelector('#repo-search-input'),
  repoSort: document.querySelector('#repo-sort-select'),
  repoCount: document.querySelector('#repo-count'),
  emptyRepos: document.querySelector('#empty-repos'),
  lastUpdated: document.querySelector('#last-updated')
};

let repositories = [];

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function safeHttpsUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function languageColor(language) {
  if (LANGUAGE_COLORS[language]) return LANGUAGE_COLORS[language];
  let hash = 0;
  for (const character of language) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 58% 64%)`;
}

function formatNumber(number) {
  return new Intl.NumberFormat().format(number || 0);
}

function formatDate(dateString, options) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function icon(name) {
  const paths = {
    location: '<path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17"/>',
    repo: '<path d="M5 3.5h11.5A2.5 2.5 0 0 1 19 6v14H7a3 3 0 0 1-3-3V5a1.5 1.5 0 0 1 1-1.5Z"/><path d="M7 16h12M7 20h12M8 3.5V16"/>',
    star: '<path d="m10 2.8 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L10 2.8Z"/>',
    fork: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10M18 7c0 7-12 3-12 10"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

async function fetchGitHubJson(path) {
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      headers: { Accept: 'application/vnd.github+json' }
    });
  } catch {
    const error = new Error('GitHub could not be reached. Check your internet connection and try again.');
    error.kind = 'network';
    throw error;
  }

  if (response.status === 404) {
    const error = new Error('No public GitHub account was found with that username. Check the spelling and try again.');
    error.kind = 'not-found';
    throw error;
  }
  if (response.status === 403 || response.status === 429) {
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    const resetText = reset ? ` Try again after ${formatDate(reset * 1000, { hour: 'numeric', minute: '2-digit' })}.` : '';
    const error = new Error(`GitHub's public API rate limit has been reached.${resetText}`);
    error.kind = 'rate-limit';
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`GitHub returned an error (${response.status}). Please try again in a moment.`);
    error.kind = 'api';
    throw error;
  }
  return response.json();
}

function setView(view) {
  elements.welcome.hidden = view !== 'welcome';
  elements.loading.hidden = view !== 'loading';
  elements.error.hidden = view !== 'error';
  elements.dashboard.hidden = view !== 'dashboard';
  elements.results.setAttribute('aria-busy', String(view === 'loading'));
}

function showError(error) {
  const titles = {
    'not-found': 'Profile not found',
    'rate-limit': 'GitHub API rate limit reached',
    network: 'Connection problem',
    api: 'GitHub API error'
  };
  elements.errorTitle.textContent = titles[error.kind] || 'Could not load profile';
  elements.errorMessage.textContent = error.message || 'An unexpected error occurred. Please try again.';
  setView('error');
}

function calculateLanguages(repos) {
  const counts = new Map();
  for (const repo of repos) {
    if (repo.language) counts.set(repo.language, (counts.get(repo.language) || 0) + 1);
  }
  return [...counts.entries()].sort((first, second) => second[1] - first[1]);
}

function renderLanguages(languages) {
  const topLanguages = languages.slice(0, 6);
  const total = languages.reduce((sum, language) => sum + language[1], 0);
  const mainLanguage = languages[0]?.[0] || '';

  elements.languageStat.textContent = mainLanguage || '—';
  elements.languageCaption.textContent = mainLanguage ? 'by repository count' : 'no language data yet';
  elements.languageNote.textContent = `${formatNumber(total)} repos with language data`;
  elements.languageBar.replaceChildren();
  elements.languageLegend.replaceChildren();

  if (total === 0) {
    elements.languageBar.className = 'language-empty';
    elements.languageBar.setAttribute('role', 'img');
    elements.languageBar.setAttribute('aria-label', 'No repository language data available');
    const empty = document.createElement('span');
    empty.className = 'legend-item';
    empty.textContent = 'No language data available';
    elements.languageLegend.append(empty);
    return;
  }

  elements.languageBar.className = 'language-bar';
  elements.languageBar.setAttribute('role', 'img');
  elements.languageBar.setAttribute('aria-label', topLanguages.map(([name, count]) => `${name}: ${Math.round(count / total * 100)}%`).join(', '));
  const visible = topLanguages.slice();
  if (languages.length > visible.length) {
    visible.push(['Other', languages.slice(visible.length).reduce((sum, language) => sum + language[1], 0)]);
  }
  for (const [name, count] of visible) {
    const color = name === 'Other' ? '#555b70' : languageColor(name);
    const segment = document.createElement('span');
    segment.className = 'language-segment';
    segment.style.width = `${count / total * 100}%`;
    segment.style.backgroundColor = color;
    segment.title = `${name}: ${count} repos`;
    elements.languageBar.append(segment);

    const legend = document.createElement('span');
    legend.className = 'legend-item';
    legend.innerHTML = `<span class="legend-dot" style="background:${color}"></span>${escapeHTML(name)}<span class="legend-count">${Math.round(count / total * 100)}%</span>`;
    elements.languageLegend.append(legend);
  }
}

function renderProfile(profile) {
  const avatarUrl = safeHttpsUrl(profile.avatar_url);
  elements.avatar.src = avatarUrl;
  elements.avatar.alt = `${profile.login}'s avatar`;
  elements.name.textContent = profile.name || profile.login;
  elements.handle.textContent = `@${profile.login}`;
  elements.bio.textContent = profile.bio || 'No bio has been added to this profile.';
  elements.location.innerHTML = profile.location
    ? `${icon('location')}<span>${escapeHTML(profile.location)}</span>`
    : '';
  elements.joined.innerHTML = `${icon('calendar')}<span>Joined ${formatDate(profile.created_at, { month: 'long', year: 'numeric' })}</span>`;
  elements.profileLink.href = safeHttpsUrl(profile.html_url);
  elements.reposStat.textContent = formatNumber(profile.public_repos);
  elements.followersStat.textContent = formatNumber(profile.followers);
}

function sortRepositories(repos) {
  const sorted = [...repos];
  if (elements.repoSort.value === 'stars') {
    sorted.sort((a, b) => b.stargazers_count - a.stargazers_count || a.name.localeCompare(b.name));
  } else if (elements.repoSort.value === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    sorted.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }
  return sorted;
}

function renderRepositories() {
  const query = elements.repoSearch.value.trim().toLowerCase();
  const filtered = sortRepositories(repositories).filter(repo => {
    return `${repo.name} ${repo.description || ''} ${repo.language || ''}`.toLowerCase().includes(query);
  });
  elements.repoGrid.replaceChildren();
  elements.repoCount.textContent = formatNumber(filtered.length);
  elements.emptyRepos.hidden = filtered.length !== 0;

  for (const repo of filtered) {
    const link = safeHttpsUrl(repo.html_url);
    const homepage = safeHttpsUrl(repo.homepage);
    const language = repo.language || '';
    const card = document.createElement('article');
    card.className = 'repo-card';
    const description = repo.description ? escapeHTML(repo.description) : 'No description provided.';
    const descriptionClass = repo.description ? 'repo-description' : 'repo-description is-empty';
    const homepageLink = homepage
      ? `<a class="repo-meta-item repo-homepage" href="${escapeHTML(homepage)}" target="_blank" rel="noopener noreferrer" aria-label="Project homepage for ${escapeHTML(repo.name)}">${escapeHTML(new URL(homepage).hostname)}</a>`
      : '';
    card.innerHTML = `
      <div class="repo-card-top">
        <a class="repo-title" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">
          ${icon('repo')}<span>${escapeHTML(repo.name)}</span>
        </a>
        <span class="repo-visibility">${repo.fork ? 'Fork' : 'Public'}</span>
      </div>
      <p class="${descriptionClass}">${description}</p>
      <div class="repo-meta">
        ${language ? `<span class="repo-meta-item"><span class="repo-language-dot" style="background:${languageColor(language)}"></span>${escapeHTML(language)}</span>` : ''}
        <span class="repo-meta-item">${icon('star')}${formatNumber(repo.stargazers_count)}</span>
        <span class="repo-meta-item">${icon('fork')}${formatNumber(repo.forks_count)}</span>
        ${homepageLink}
        <span class="repo-meta-item">Updated ${formatDate(repo.updated_at, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>`;
    elements.repoGrid.append(card);
  }
}

async function analyze(username) {
  const normalized = username.trim().replace(/^@/, '');
  if (!normalized) {
    elements.username.focus();
    return;
  }
  elements.username.value = normalized;
  elements.analyzeButton.disabled = true;
  setView('loading');

  try {
    const encodedUsername = encodeURIComponent(normalized);
    const [profile, repos] = await Promise.all([
      fetchGitHubJson(`/users/${encodedUsername}`),
      fetchGitHubJson(`/users/${encodedUsername}/repos?per_page=100&sort=updated`)
    ]);
    if (!Array.isArray(repos)) throw new Error('GitHub returned an unexpected repository response.');
    repositories = repos;
    renderProfile(profile);
    const stars = repos.reduce((total, repo) => total + (repo.stargazers_count || 0), 0);
    elements.starsStat.textContent = formatNumber(stars);
    renderLanguages(calculateLanguages(repos));
    renderRepositories();
    elements.lastUpdated.textContent = `Fetched ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())}`;
    setView('dashboard');
  } catch (error) {
    showError(error);
  } finally {
    elements.analyzeButton.disabled = false;
  }
}

elements.form.addEventListener('submit', event => {
  event.preventDefault();
  analyze(elements.username.value);
});

document.querySelectorAll('[data-username]').forEach(button => {
  button.addEventListener('click', () => {
    const username = button.dataset.username;
    elements.username.value = username;
    analyze(username);
  });
});

elements.repoSearch.addEventListener('input', renderRepositories);
elements.repoSort.addEventListener('change', renderRepositories);

elements.username.value = 'rohankumarmandla22-commits';
analyze(elements.username.value);
