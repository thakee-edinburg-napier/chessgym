
// Page settings
const PAGE_PATHS = {
    home: 'index.html',
    puzzles: 'pages/puzzles.html',
    stats: 'pages/stats.html',
    settings: 'pages/settings.html'
};

// Link pages
function setSidenavLinksAndActive(sideNav) {
    const currentPage = document.body.getAttribute('data-page');
    const base = document.body.getAttribute('data-base') || '.';
    const isInPages = base === '..';

    sideNav.querySelectorAll('.sidenav-link[data-page]').forEach(function (link) {
        const page = link.getAttribute('data-page');
        let href = PAGE_PATHS[page];
        if (isInPages) {
            href = page === 'home' ? '../index.html' : page + '.html';
        }
        link.href = href;
        link.classList.toggle('sidenav-link-active', page === currentPage);
    });
}

// Load the sidebar component
async function loadSideNav() {
    try {
        const sideNav = document.querySelector('side-nav');
        if (!sideNav) return;
        const base = document.body.getAttribute('data-base') || '.';
        const sidenavPath = base + '/components/sidenav/sidenav.html';
        const response = await fetch(sidenavPath);
        const sideNavContentText = await response.text();
        sideNav.innerHTML = sideNavContentText;
        setSidenavLinksAndActive(sideNav);
    } catch (e) {
        console.warn('Could not load sidenav:', e);
    }
}
