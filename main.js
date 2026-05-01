function formatDuration(ms) {
    var totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    var mins = Math.floor(totalSeconds / 60);
    var secs = totalSeconds % 60;
    return mins + 'm ' + secs + 's';
}

function formatDate(isoDate) {
    var d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return 'Unknown time';
    return d.toLocaleString();
}

function getSummary() {
    if (!window.ChessGymStore || typeof window.ChessGymStore.getSummary !== 'function') {
        return null;
    }
    return window.ChessGymStore.getSummary();
}

function getPreferences() {
    if (!window.ChessGymStore || typeof window.ChessGymStore.getPreferences !== 'function') {
        return { theme: 'dark', boardOrientation: 'auto', boardTheme: 'classic' };
    }
    return window.ChessGymStore.getPreferences();
}

var BOARD_THEME_COLORS = {
    classic: { light: '#D2C2AC', dark: '#6B5647' },
    ocean: { light: '#c7dcea', dark: '#4f6f8a' },
    forest: { light: '#d8e3c8', dark: '#5d7a4d' },
    slate: { light: '#d7dbe2', dark: '#666e7d' },
    sand: { light: '#ead9bf', dark: '#b08b62' }
};

function applyTheme(theme) {
    var selected = theme === 'light' ? 'light' : 'dark';
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add('theme-' + selected);
}

function applyBoardTheme(boardTheme) {
    var selected = BOARD_THEME_COLORS[boardTheme] ? boardTheme : 'classic';
    var colors = BOARD_THEME_COLORS[selected];
    document.documentElement.style.setProperty('--light-square-color', colors.light);
    document.documentElement.style.setProperty('--dark-square-color', colors.dark);
}

function applyThemeFromPreferences() {
    var prefs = getPreferences();
    applyTheme(prefs.theme);
    applyBoardTheme(prefs.boardTheme);
}

function setText(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
}

function createRecentItem(entry) {
    var item = document.createElement('li');
    item.className = 'activity-item';

    var left = document.createElement('div');
    var puzzleId = entry.puzzleId || 'unknown';
    left.textContent = 'Puzzle ' + puzzleId + ' - ' + formatDate(entry.playedAt);

    var right = document.createElement('div');
    var result = document.createElement('span');
    result.className = 'activity-item-result ' + (entry.solved ? 'activity-item-result-success' : 'activity-item-result-fail');
    result.textContent = entry.solved ? 'Solved' : 'Unsolved';

    var details = document.createElement('span');
    details.textContent = ' | Mistakes: ' + entry.mistakes + ' | Time: ' + formatDuration(entry.durationMs);
    right.appendChild(result);
    right.appendChild(details);

    item.appendChild(left);
    item.appendChild(right);
    return item;
}

function renderRecentList(listId, emptyId, recent, limit) {
    var listEl = document.getElementById(listId);
    var emptyEl = document.getElementById(emptyId);
    if (!listEl || !emptyEl) return;

    listEl.innerHTML = '';
    var items = (recent || []).slice(-(limit || 5)).reverse();

    if (items.length === 0) {
        emptyEl.style.display = '';
        return;
    }

    emptyEl.style.display = 'none';
    items.forEach(function (entry) {
        listEl.appendChild(createRecentItem(entry));
    });
}

function renderRecentTable(bodyId, tableId, emptyId, recent, limit) {
    var bodyEl = document.getElementById(bodyId);
    var tableEl = document.getElementById(tableId);
    var emptyEl = document.getElementById(emptyId);
    if (!bodyEl || !tableEl || !emptyEl) return;

    bodyEl.innerHTML = '';
    var items = (recent || []).slice(-(limit || 10)).reverse();
    if (items.length === 0) {
        tableEl.style.display = 'none';
        emptyEl.style.display = '';
        return;
    }

    tableEl.style.display = 'table';
    emptyEl.style.display = 'none';
    items.forEach(function (entry) {
        var row = document.createElement('tr');

        row.innerHTML =
            '<td>' + (entry.puzzleId || 'unknown') + '</td>' +
            '<td>' + entry.mistakes + '</td>' +
            '<td>' + formatDuration(entry.durationMs) + '</td>' +
            '<td>' + formatDate(entry.playedAt) + '</td>';

        bodyEl.appendChild(row);
    });
}

function renderOutcomeChart(chartId, recent, limit) {
    var chartEl = document.getElementById(chartId);
    if (!chartEl) return;
    chartEl.innerHTML = '';

    var items = (recent || []).slice(-(limit || 12));
    if (items.length === 0) {
        chartEl.innerHTML = '<p class="bar-chart-empty">No outcome data yet.</p>';
        return;
    }

    items.forEach(function (entry) {
        var isPerfectSolve = entry.solved && Number(entry.mistakes || 0) === 0;
        var bar = document.createElement('div');
        bar.className = 'chart-bar ' + (isPerfectSolve ? 'chart-bar-solved' : 'chart-bar-failed');
        bar.style.height = isPerfectSolve ? '100%' : '40%';
        bar.title =
            (isPerfectSolve ? 'Perfect solve' : 'Solve with mistakes') +
            ' - Puzzle ' + (entry.puzzleId || 'unknown') +
            ' - Mistakes: ' + Number(entry.mistakes || 0);
        chartEl.appendChild(bar);
    });
}

function renderTimeChart(chartId, recent, limit) {
    var chartEl = document.getElementById(chartId);
    if (!chartEl) return;
    chartEl.innerHTML = '';

    var items = (recent || []).slice(-(limit || 12));
    if (items.length === 0) {
        chartEl.innerHTML = '<p class="bar-chart-empty">No timing data yet.</p>';
        return;
    }

    var maxDuration = items.reduce(function (max, entry) {
        return Math.max(max, Number(entry.durationMs || 0));
    }, 1);

    items.forEach(function (entry) {
        var bar = document.createElement('div');
        var ratio = Number(entry.durationMs || 0) / maxDuration;
        var height = Math.max(12, Math.round(ratio * 100));
        bar.className = 'chart-bar chart-bar-time';
        bar.style.height = height + '%';
        bar.title = 'Puzzle ' + (entry.puzzleId || 'unknown') + ' - ' + formatDuration(entry.durationMs);
        chartEl.appendChild(bar);
    });
}

function renderHome(summary) {
    if (!summary) return;
    setText('home-attempted', String(summary.attempted));
    setText('home-solved', String(summary.solved));
    setText('home-accuracy', String(summary.accuracy) + '%');
    setText('home-average-time', formatDuration(summary.averageSolveTimeMs));
    renderRecentList('home-recent-list', 'home-empty', summary.recent, 5);

    var lastPlayedEl = document.getElementById('home-last-played');
    if (lastPlayedEl) {
        if (summary.recent && summary.recent.length > 0) {
            var latest = summary.recent[summary.recent.length - 1];
            lastPlayedEl.textContent = 'Last activity: ' + formatDate(latest.playedAt);
        } else {
            lastPlayedEl.textContent = 'Last activity: no sessions yet';
        }
    }

    var recentCountEl = document.getElementById('home-recent-count');
    if (recentCountEl) {
        var count = summary.recent ? summary.recent.length : 0;
        recentCountEl.textContent = 'Recent attempts tracked: ' + count;
    }
}

function renderStats(summary) {
    if (!summary) return;
    setText('stats-attempted', String(summary.attempted));
    setText('stats-solved', String(summary.solved));
    setText('stats-failed', String(summary.failed));
    setText('stats-accuracy', String(summary.accuracy) + '%');
    setText('stats-mistakes', String(summary.totalMistakes));
    setText('stats-average-time', formatDuration(summary.averageSolveTimeMs));
    renderRecentTable('stats-recent-body', 'stats-recent-table', 'stats-empty', summary.recent, 10);
    renderOutcomeChart('stats-outcome-chart', summary.recent, 12);
    renderTimeChart('stats-time-chart', summary.recent, 12);

    var trendEl = document.getElementById('stats-trend');
    if (!trendEl) return;
    if (!summary.recent || summary.recent.length === 0) {
        trendEl.textContent = 'Not enough data yet. Solve a few puzzles to see trends.';
        return;
    }

    var recent10 = summary.recent.slice(-10);
    var solvedCount = recent10.filter(function (entry) { return entry.solved; }).length;
    var recentAccuracy = recent10.length ? ((solvedCount / recent10.length) * 100).toFixed(2) : '0.00';
    trendEl.textContent = 'Last ' + recent10.length + ' attempts: ' + recentAccuracy + '% solved.';
}

function renderDashboard() {
    var summary = getSummary();
    if (!summary) return;

    var page = document.body.getAttribute('data-page');
    if (page === 'home') {
        renderHome(summary);
    } else if (page === 'stats') {
        renderStats(summary);
    }
}

async function main() {
    applyThemeFromPreferences();
    await loadSideNav();
    if (typeof lucide !== 'undefined') lucide.createIcons();
    renderDashboard();
}

window.ChessGymUI = {
    applyTheme: applyThemeFromPreferences
};

main();
