(function () {
    'use strict';

    function getStore() {
        return window.ChessGymStore || null;
    }

    function setMessage(text) {
        var messageEl = document.getElementById('settings-message');
        if (!messageEl) return;
        messageEl.textContent = text;
    }

    function applyThemeImmediately() {
        if (window.ChessGymUI && typeof window.ChessGymUI.applyTheme === 'function') {
            window.ChessGymUI.applyTheme();
        }
    }

    function loadPreferenceValues() {
        var store = getStore();
        if (!store || typeof store.getPreferences !== 'function') return;

        var prefs = store.getPreferences();
        var orientationSelect = document.getElementById('orientation-select');
        var themeSelect = document.getElementById('theme-select');
        var boardThemeSelect = document.getElementById('board-theme-select');
        if (orientationSelect) orientationSelect.value = prefs.boardOrientation || 'auto';
        if (themeSelect) themeSelect.value = prefs.theme || 'dark';
        if (boardThemeSelect) boardThemeSelect.value = prefs.boardTheme || 'classic';
    }

    function savePreferences() {
        var store = getStore();
        if (!store || typeof store.updatePreferences !== 'function') return;

        var orientationSelect = document.getElementById('orientation-select');
        var themeSelect = document.getElementById('theme-select');
        var boardThemeSelect = document.getElementById('board-theme-select');
        store.updatePreferences({
            boardOrientation: orientationSelect ? orientationSelect.value : 'auto',
            theme: themeSelect ? themeSelect.value : 'dark',
            boardTheme: boardThemeSelect ? boardThemeSelect.value : 'classic'
        });
        applyThemeImmediately();
        setMessage('Preferences saved.');
    }

    function setupResetButton() {
        var resetBtn = document.getElementById('reset-progress-btn');
        if (!resetBtn) return;

        resetBtn.addEventListener('click', function () {
            var shouldReset = window.confirm('Reset all local puzzle progress on this browser?');
            if (!shouldReset) return;

            var store = getStore();
            if (!store || typeof store.resetProgress !== 'function') return;
            store.resetProgress();
            setMessage('Progress reset. Puzzle stats are now cleared.');
        });
    }

    function setupPreferenceHandlers() {
        var orientationSelect = document.getElementById('orientation-select');
        var themeSelect = document.getElementById('theme-select');
        var boardThemeSelect = document.getElementById('board-theme-select');
        if (orientationSelect) orientationSelect.addEventListener('change', savePreferences);
        if (themeSelect) themeSelect.addEventListener('change', savePreferences);
        if (boardThemeSelect) boardThemeSelect.addEventListener('change', savePreferences);
    }

    function run() {
        loadPreferenceValues();
        setupPreferenceHandlers();
        setupResetButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
