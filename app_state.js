(function () {
    'use strict';

    var STORAGE_KEY = 'chessgym.state.v1';
    var MAX_RECENT_RESULTS = 30;
    var VALID_ORIENTATIONS = ['auto', 'white', 'black'];
    var VALID_THEMES = ['dark', 'light'];
    var VALID_BOARD_THEMES = ['classic', 'ocean', 'forest', 'slate', 'sand'];

    var DEFAULT_STATE = {
        schemaVersion: 1,
        session: {
            startedAt: null,
            lastPlayedAt: null,
            lastPuzzleIndex: -1
        },
        puzzleStats: {
            attempted: 0,
            solved: 0,
            failed: 0,
            totalMistakes: 0,
            totalSolveTimeMs: 0,
            recent: []
        },
        preferences: {
            boardOrientation: 'auto',
            theme: 'dark',
            boardTheme: 'classic'
        }
    };

    function cloneDefaultState() {
        return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }

    function asNonNegativeInt(value) {
        var n = Number(value);
        if (!Number.isFinite(n) || n < 0) return 0;
        return Math.floor(n);
    }

    function normalizeOrientation(value) {
        return VALID_ORIENTATIONS.indexOf(value) >= 0 ? value : 'auto';
    }

    function normalizeTheme(value) {
        return VALID_THEMES.indexOf(value) >= 0 ? value : 'dark';
    }

    function normalizeBoardTheme(value) {
        return VALID_BOARD_THEMES.indexOf(value) >= 0 ? value : 'classic';
    }

    function normalizeRecentEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;
        return {
            puzzleId: typeof entry.puzzleId === 'string' ? entry.puzzleId : 'unknown',
            solved: Boolean(entry.solved),
            mistakes: asNonNegativeInt(entry.mistakes),
            durationMs: asNonNegativeInt(entry.durationMs),
            playedAt: typeof entry.playedAt === 'string' ? entry.playedAt : new Date().toISOString()
        };
    }

    function normalizeState(raw) {
        var state = cloneDefaultState();
        if (!raw || typeof raw !== 'object') return state;

        if (raw.session && typeof raw.session === 'object') {
            state.session.startedAt = typeof raw.session.startedAt === 'string' ? raw.session.startedAt : null;
            state.session.lastPlayedAt = typeof raw.session.lastPlayedAt === 'string' ? raw.session.lastPlayedAt : null;
            state.session.lastPuzzleIndex = asNonNegativeInt(raw.session.lastPuzzleIndex);
            if (raw.session.lastPuzzleIndex === -1) state.session.lastPuzzleIndex = -1;
        }

        if (raw.puzzleStats && typeof raw.puzzleStats === 'object') {
            state.puzzleStats.attempted = asNonNegativeInt(raw.puzzleStats.attempted);
            state.puzzleStats.solved = asNonNegativeInt(raw.puzzleStats.solved);
            state.puzzleStats.failed = asNonNegativeInt(raw.puzzleStats.failed);
            state.puzzleStats.totalMistakes = asNonNegativeInt(raw.puzzleStats.totalMistakes);
            state.puzzleStats.totalSolveTimeMs = asNonNegativeInt(raw.puzzleStats.totalSolveTimeMs);

            if (Array.isArray(raw.puzzleStats.recent)) {
                state.puzzleStats.recent = raw.puzzleStats.recent
                    .map(normalizeRecentEntry)
                    .filter(Boolean)
                    .slice(-MAX_RECENT_RESULTS);
            }
        }

        if (raw.preferences && typeof raw.preferences === 'object') {
            state.preferences.boardOrientation = normalizeOrientation(raw.preferences.boardOrientation);
            state.preferences.theme = normalizeTheme(raw.preferences.theme);
            state.preferences.boardTheme = normalizeBoardTheme(raw.preferences.boardTheme);
        }

        return state;
    }

    function readState() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return cloneDefaultState();
            return normalizeState(JSON.parse(raw));
        } catch (err) {
            console.warn('Could not read ChessGym state:', err);
            return cloneDefaultState();
        }
    }

    function writeState(nextState) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(nextState)));
            return true;
        } catch (err) {
            console.warn('Could not persist ChessGym state:', err);
            return false;
        }
    }

    function updateState(updater) {
        var current = readState();
        var next = updater(normalizeState(current));
        if (!next || typeof next !== 'object') next = current;
        writeState(next);
        return normalizeState(next);
    }

    function recordPuzzleStart(puzzleId) {
        return updateState(function (state) {
            var now = new Date().toISOString();
            if (!state.session.startedAt) state.session.startedAt = now;
            state.session.lastPlayedAt = now;
            state.puzzleStats.attempted += 1;
            return state;
        });
    }

    function recordPuzzleMistake() {
        return updateState(function (state) {
            state.puzzleStats.failed += 1;
            state.puzzleStats.totalMistakes += 1;
            return state;
        });
    }

    function recordPuzzleSolved(details) {
        var payload = details || {};
        return updateState(function (state) {
            var now = new Date().toISOString();
            state.session.lastPlayedAt = now;
            state.puzzleStats.solved += 1;
            state.puzzleStats.totalSolveTimeMs += asNonNegativeInt(payload.durationMs);

            state.puzzleStats.recent.push({
                puzzleId: typeof payload.puzzleId === 'string' ? payload.puzzleId : 'unknown',
                solved: true,
                mistakes: asNonNegativeInt(payload.mistakes),
                durationMs: asNonNegativeInt(payload.durationMs),
                playedAt: now
            });
            state.puzzleStats.recent = state.puzzleStats.recent.slice(-MAX_RECENT_RESULTS);
            return state;
        });
    }

    function getNextPuzzleIndex(totalPuzzles) {
        var total = asNonNegativeInt(totalPuzzles);
        if (total <= 0) return -1;

        var selectedIndex = 0;
        updateState(function (state) {
            var previous = state.session.lastPuzzleIndex;
            if (typeof previous !== 'number' || previous < 0 || previous >= total) {
                selectedIndex = Math.floor(Math.random() * total);
            } else {
                selectedIndex = (previous + 1) % total;
            }
            state.session.lastPuzzleIndex = selectedIndex;
            return state;
        });
        return selectedIndex;
    }

    function getSummary() {
        var state = readState();
        var attempted = state.puzzleStats.attempted;
        var solved = state.puzzleStats.solved;
        var accuracy = attempted > 0 ? (solved / attempted) * 100 : 0;
        return {
            attempted: attempted,
            solved: solved,
            failed: state.puzzleStats.failed,
            totalMistakes: state.puzzleStats.totalMistakes,
            totalSolveTimeMs: state.puzzleStats.totalSolveTimeMs,
            averageSolveTimeMs: solved > 0 ? Math.round(state.puzzleStats.totalSolveTimeMs / solved) : 0,
            accuracy: Number(accuracy.toFixed(2)),
            recent: state.puzzleStats.recent.slice()
        };
    }

    function getPreferences() {
        var state = readState();
        return {
            boardOrientation: normalizeOrientation(state.preferences.boardOrientation),
            theme: normalizeTheme(state.preferences.theme),
            boardTheme: normalizeBoardTheme(state.preferences.boardTheme)
        };
    }

    function updatePreferences(nextPreferences) {
        var updates = nextPreferences || {};
        return updateState(function (state) {
            if (Object.prototype.hasOwnProperty.call(updates, 'boardOrientation')) {
                state.preferences.boardOrientation = normalizeOrientation(updates.boardOrientation);
            }
            if (Object.prototype.hasOwnProperty.call(updates, 'theme')) {
                state.preferences.theme = normalizeTheme(updates.theme);
            }
            if (Object.prototype.hasOwnProperty.call(updates, 'boardTheme')) {
                state.preferences.boardTheme = normalizeBoardTheme(updates.boardTheme);
            }
            return state;
        });
    }

    function resetProgress() {
        return updateState(function (state) {
            state.session.startedAt = null;
            state.session.lastPlayedAt = null;
            state.session.lastPuzzleIndex = -1;
            state.puzzleStats = {
                attempted: 0,
                solved: 0,
                failed: 0,
                totalMistakes: 0,
                totalSolveTimeMs: 0,
                recent: []
            };
            return state;
        });
    }

    function clearState() {
        localStorage.removeItem(STORAGE_KEY);
        return cloneDefaultState();
    }

    window.ChessGymStore = {
        key: STORAGE_KEY,
        readState: readState,
        writeState: writeState,
        updateState: updateState,
        getSummary: getSummary,
        getPreferences: getPreferences,
        updatePreferences: updatePreferences,
        resetProgress: resetProgress,
        getNextPuzzleIndex: getNextPuzzleIndex,
        recordPuzzleStart: recordPuzzleStart,
        recordPuzzleMistake: recordPuzzleMistake,
        recordPuzzleSolved: recordPuzzleSolved,
        clearState: clearState
    };
})();
