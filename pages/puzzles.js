/**
 * Puzzle loader and Lichess-style play.
 * Loads puzzles from CSV, animates first move, player plays full solution line.
 */
(function () {
    'use strict';

    var CSV_URL = '../resources/lichess_db.csv';
    var puzzleList = [];
    var board = null;
    var game = null;
    var currentPuzzle = null;
    var moveIndex = 0;
    var waitingForAnimation = false;
    var puzzleEnded = false;

    var statusEl = null;
    var nextBtn = null;
    var newBtn = null;
    var resetBtn = null;
    var hintBtn = null;
    var toMoveEl = null;
    var puzzleIdEl = null;
    var puzzleProgressEl = null;
    var puzzleHintTextEl = null;
    var puzzleSessionStatsEl = null;
    var OPPONENT_MOVE_DELAY_MS = 500;
    var lastMoveFrom = null;
    var lastMoveTo = null;
    var BOARD_SELECTOR = '#chess-board';
    var puzzleStartedAtMs = 0;
    var puzzleMistakes = 0;
    var statusResetTimer = null;
    var puzzlePanelEl = null;
    var SOUND_PATHS = {
        move: '../assets/sounds/lichess-standard/Move.mp3',
        capture: '../assets/sounds/lichess-standard/Capture.mp3',
        notify: '../assets/sounds/lichess-standard/GenericNotify.mp3'
    };
    var SOUND_POOL_SIZE = 3;
    var soundPool = {};
    var STATUS_RESET_DELAY_MS = 950;
    var sessionPlayedCount = 0;
    var sessionSolvedCount = 0;
    var sessionWrongCount = 0;
    var hintFromSquare = null;
    var hintToSquare = null;
    var hintRevealStage = 0;
    var hintOverlayEl = null;
    var selectedFromSquare = null;

    function getDisplayError(err) {
        if (!err) return 'Unknown error';
        if (typeof err === 'string') return err;
        if (err.message) return err.message;
        return String(err);
    }

    function uciToHyphen(uci) {
        if (!uci || uci.length < 4) return '';
        return uci.slice(0, 2) + '-' + uci.slice(2, 4);
    }

    function createAudioPool(path) {
        var pool = {
            index: 0,
            clips: []
        };
        for (var i = 0; i < SOUND_POOL_SIZE; i++) {
            var clip = new Audio(path);
            clip.preload = 'auto';
            pool.clips.push(clip);
        }
        return pool;
    }

    function initSoundEffects() {
        Object.keys(SOUND_PATHS).forEach(function (key) {
            soundPool[key] = createAudioPool(SOUND_PATHS[key]);
        });
    }

    function playSound(name) {
        var pool = soundPool[name];
        if (!pool || !pool.clips.length) return;
        var clip = pool.clips[pool.index];
        pool.index = (pool.index + 1) % pool.clips.length;
        try {
            clip.currentTime = 0;
            var result = clip.play();
            if (result && typeof result.catch === 'function') {
                result.catch(function () {});
            }
        } catch (err) {
            /* ignore play interruptions or autoplay blocks */
        }
    }

    function playMoveSound(move, opts) {
        if (move && move.captured) {
            playSound('capture');
            return;
        }
        playSound('move');
    }

    function moveToUci(move) {
        if (!move || !move.from || !move.to) return '';
        return move.from + move.to + (move.promotion || '');
    }

    function parseCsv(text) {
        var lines = text.trim().split(/\n/);
        var list = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            var parts = line.split(',');
            if (parts.length < 3) continue;
            var id = parts[0].trim();
            var fen = parts[1].trim();
            var movesStr = parts[2].trim();
            var moves = movesStr ? movesStr.split(/\s+/) : [];
            if (!fen || !/^[rnbqkpRNBQKP0-9\/\s-]+$/.test(fen.split(' ')[0])) continue;
            list.push({ id: id, fen: fen, moves: moves });
        }
        return list;
    }

    function loadPuzzles() {
        return fetch(CSV_URL)
            .then(function (r) {
                if (!r.ok) throw new Error('Puzzle CSV request failed (' + r.status + ')');
                return r.text();
            })
            .then(function (text) {
                if (!text || !text.trim()) throw new Error('Puzzle CSV is empty');
                puzzleList = parseCsv(text);
                if (puzzleList.length === 0) throw new Error('No puzzles parsed');
                return puzzleList;
            });
    }

    function pickNextPuzzle() {
        if (puzzleList.length === 0) return null;
        var index = Math.floor(Math.random() * puzzleList.length);
        if (window.ChessGymStore && typeof window.ChessGymStore.getNextPuzzleIndex === 'function') {
            var storedIndex = window.ChessGymStore.getNextPuzzleIndex(puzzleList.length);
            if (storedIndex >= 0 && storedIndex < puzzleList.length) {
                index = storedIndex;
            }
        }
        return puzzleList[index];
    }

    function setStatus(message, type) {
        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.className = 'puzzle-status' + (type ? ' ' + type : '');
    }

    function updateSessionStats() {
        if (!puzzleSessionStatsEl) return;
        puzzleSessionStatsEl.textContent =
            'Played: ' + sessionPlayedCount +
            ' | Solved: ' + sessionSolvedCount +
            ' | Wrong moves: ' + sessionWrongCount;
    }

    function updateLineProgress() {
        if (!puzzleProgressEl || !currentPuzzle || !currentPuzzle.moves) return;
        puzzleProgressEl.textContent = 'Line progress: ' + moveIndex + ' / ' + currentPuzzle.moves.length;
    }

    function resetStatusToIdle() {
        setStatus('Puzzle loaded. Find the best move.', '');
        if (puzzlePanelEl) {
            puzzlePanelEl.classList.remove('puzzle-stats-container--error');
        }
    }

    function showTransientErrorStatus(message) {
        if (!statusEl) return;
        if (statusResetTimer) {
            clearTimeout(statusResetTimer);
            statusResetTimer = null;
        }

        setStatus(message, 'fail puzzle-status--flash');
        if (puzzlePanelEl) {
            puzzlePanelEl.classList.remove('puzzle-stats-container--error');
            void puzzlePanelEl.offsetWidth;
            puzzlePanelEl.classList.add('puzzle-stats-container--error');
        }

        statusResetTimer = setTimeout(function () {
            statusResetTimer = null;
            resetStatusToIdle();
        }, STATUS_RESET_DELAY_MS);
    }

    function showNext(show) {
        if (nextBtn) nextBtn.style.display = show ? '' : 'none';
    }

    function setErrorStatus(message) {
        setStatus(message, 'fail');
        showNext(false);
    }

    function updateToMove() {
        if (!toMoveEl || !game) return;
        var turn = game.turn();
        toMoveEl.textContent = turn === 'w' ? 'White to move' : 'Black to move';
    }

    function updatePuzzleId() {
        if (!puzzleIdEl) return;
        var id = currentPuzzle && currentPuzzle.id ? currentPuzzle.id : '—';
        puzzleIdEl.textContent = 'Puzzle ID: ' + id;
    }

    function canDrag() {
        return !puzzleEnded && !waitingForAnimation;
    }

    function getSquareEl(square) {
        if (!square) return null;
        var container = document.querySelector(BOARD_SELECTOR);
        return container ? container.querySelector('[data-square="' + square + '"]') : null;
    }

    function clearLastMove() {
        [lastMoveFrom, lastMoveTo].forEach(function (sq) {
            if (!sq) return;
            var el = getSquareEl(sq);
            if (el) el.classList.remove('last-move');
        });
        lastMoveFrom = null;
        lastMoveTo = null;
    }

    function setLastMove(from, to) {
        clearLastMove();
        if (!from || !to) return;
        lastMoveFrom = from;
        lastMoveTo = to;
        [from, to].forEach(function (sq) {
            var el = getSquareEl(sq);
            if (el) el.classList.add('last-move');
        });
    }

    function clearLegalMoves() {
        var container = document.querySelector(BOARD_SELECTOR);
        if (!container) return;
        container.querySelectorAll('.legal-move').forEach(function (el) {
            el.classList.remove('legal-move', 'capture-zone');
        });
    }

    function setLegalMoves(fromSquare) {
        clearLegalMoves();
        if (!game || !fromSquare || puzzleEnded || waitingForAnimation) return;
        var turn = game.turn();
        var piece = game.get(fromSquare);
        if (!piece || piece.color !== turn) return;
        var moves = game.moves({ square: fromSquare, verbose: true });
        var destSquares = {};
        for (var i = 0; i < moves.length; i++) {
            var to = moves[i].to;
            destSquares[to] = moves[i].captured ? 'capture' : 'move';
        }
        for (var sq in destSquares) {
            var el = getSquareEl(sq);
            if (el) {
                el.classList.add('legal-move');
                if (destSquares[sq] === 'capture') el.classList.add('capture-zone');
            }
        }
    }

    function clearSelectedSquare() {
        if (!selectedFromSquare) return;
        var el = getSquareEl(selectedFromSquare);
        if (el) {
            el.classList.remove('selected-source');
        }
        selectedFromSquare = null;
    }

    function setSelectedSquare(square) {
        clearSelectedSquare();
        if (!square) return;
        var el = getSquareEl(square);
        if (el) {
            el.classList.add('selected-source');
            selectedFromSquare = square;
        }
    }

    function getClickedSquare(evt) {
        if (!evt || !evt.target) return null;
        var squareEl = evt.target.closest('[data-square]');
        if (!squareEl) return null;
        return squareEl.getAttribute('data-square');
    }

    function isOwnTurnPiece(square) {
        if (!game || !square) return false;
        var piece = game.get(square);
        if (!piece) return false;
        return piece.color === game.turn();
    }

    function isPawnPiece(pieceCode) {
        if (!pieceCode) return false;
        var normalized = String(pieceCode).toLowerCase();
        return normalized === 'p' || normalized === 'wp' || normalized === 'bp';
    }

    function applyPlayerMove(source, target, pieceCode) {
        if (puzzleEnded || waitingForAnimation || !currentPuzzle || !game) {
            return { ok: false, reason: 'blocked' };
        }

        var promotion = (isPawnPiece(pieceCode) && (target[1] === '1' || target[1] === '8')) ? 'q' : undefined;
        var move = game.move({ from: source, to: target, promotion: promotion });
        if (!move) {
            sessionWrongCount += 1;
            updateSessionStats();
            showTransientErrorStatus('Illegal move. Try again.');
            return { ok: false, reason: 'illegal' };
        }

        var expectedUci = currentPuzzle.moves[moveIndex];
        var actualUci = moveToUci(move);
        if (expectedUci !== actualUci) {
            game.undo();
            puzzleMistakes += 1;
            sessionWrongCount += 1;
            showTransientErrorStatus('Wrong move. Try again.');
            playSound('move');
            updateSessionStats();
            if (window.ChessGymStore && typeof window.ChessGymStore.recordPuzzleMistake === 'function') {
                window.ChessGymStore.recordPuzzleMistake();
            }
            return { ok: false, reason: 'wrong' };
        }

        setLastMove(source, target);
        resetHintVisual();
        playMoveSound(move, {
            isCheck: game.in_check(),
            isMate: game.in_checkmate(),
            isPromotion: Boolean(move && move.promotion)
        });
        moveIndex++;
        updateLineProgress();
        if (moveIndex >= currentPuzzle.moves.length) {
            persistSolvedPuzzleResult();
            setStatus('Correct! Puzzle solved.', 'success');
            playSound('notify');
            sessionSolvedCount += 1;
            updateSessionStats();
            puzzleEnded = true;
            showNext(true);
            return { ok: true, ended: true };
        }
        setTimeout(animateNextOpponentMove, OPPONENT_MOVE_DELAY_MS);
        return { ok: true, ended: false };
    }

    function onBoardSquareClick(evt) {
        var square = getClickedSquare(evt);
        if (!square) return;

        if (!canDrag() || !game || !currentPuzzle) {
            clearSelectedSquare();
            clearLegalMoves();
            return;
        }

        if (!selectedFromSquare) {
            if (isOwnTurnPiece(square)) {
                setSelectedSquare(square);
                setLegalMoves(square);
            } else {
                clearSelectedSquare();
                clearLegalMoves();
            }
            return;
        }

        if (square === selectedFromSquare) {
            clearSelectedSquare();
            clearLegalMoves();
            return;
        }

        if (isOwnTurnPiece(square)) {
            setSelectedSquare(square);
            setLegalMoves(square);
            return;
        }

        var movingPiece = game.get(selectedFromSquare);
        var result = applyPlayerMove(selectedFromSquare, square, movingPiece ? movingPiece.type : '');
        if (!result.ok) {
            if (result.reason === 'illegal') {
                setLegalMoves(selectedFromSquare);
            }
            return;
        }

        clearSelectedSquare();
        clearLegalMoves();
        board.position(game.fen(), false);
    }

    function ensureHintOverlay() {
        var container = document.querySelector(BOARD_SELECTOR);
        if (!container) return null;
        if (!hintOverlayEl) {
            hintOverlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            hintOverlayEl.setAttribute('class', 'puzzle-hint-overlay');
            hintOverlayEl.setAttribute('viewBox', '0 0 100 100');
            container.appendChild(hintOverlayEl);
        }
        return hintOverlayEl;
    }

    function squareCenter(square, orientation, boardSize) {
        if (!square || square.length !== 2) return null;
        var file = square.charCodeAt(0) - 'a'.charCodeAt(0);
        var rank = parseInt(square.charAt(1), 10);
        if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;

        var xIndex = orientation === 'black' ? 7 - file : file;
        var yIndex = orientation === 'black' ? rank - 1 : 8 - rank;
        var cell = boardSize / 8;
        return {
            x: (xIndex + 0.5) * cell,
            y: (yIndex + 0.5) * cell
        };
    }

    function clearHintSquares() {
        [hintFromSquare, hintToSquare].forEach(function (sq) {
            if (!sq) return;
            var el = getSquareEl(sq);
            if (el) {
                el.classList.remove('hint-from');
                el.classList.remove('hint-to');
            }
        });
        hintFromSquare = null;
        hintToSquare = null;
    }

    function clearHintOverlay() {
        if (hintOverlayEl) {
            hintOverlayEl.innerHTML = '';
        }
    }

    function resetHintVisual(resetStage) {
        clearHintSquares();
        clearHintOverlay();
        if (resetStage !== false) {
            hintRevealStage = 0;
        }
    }

    function drawHintArrow(from, to) {
        var overlay = ensureHintOverlay();
        if (!overlay || !from || !to) return;

        var container = document.querySelector(BOARD_SELECTOR);
        if (!container) return;
        var rect = container.getBoundingClientRect();
        var boardSize = Math.min(rect.width, rect.height);
        if (!boardSize) return;

        var orientation = board && board.orientation ? board.orientation() : 'white';
        var fromCenter = squareCenter(from, orientation, boardSize);
        var toCenter = squareCenter(to, orientation, boardSize);
        if (!fromCenter || !toCenter) return;

        overlay.setAttribute('viewBox', '0 0 ' + boardSize + ' ' + boardSize);
        overlay.innerHTML = '';

        var dx = toCenter.x - fromCenter.x;
        var dy = toCenter.y - fromCenter.y;
        var len = Math.sqrt(dx * dx + dy * dy);
        if (!len) return;

        var ux = dx / len;
        var uy = dy / len;
        var headLen = Math.min(boardSize / 9, len / 2);
        var tipX = toCenter.x;
        var tipY = toCenter.y;
        var baseX = tipX - ux * headLen;
        var baseY = tipY - uy * headLen;
        var nx = -uy;
        var ny = ux;
        var halfWidth = Math.max(boardSize / 40, 5);

        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(fromCenter.x));
        line.setAttribute('y1', String(fromCenter.y));
        line.setAttribute('x2', String(baseX));
        line.setAttribute('y2', String(baseY));
        line.setAttribute('class', 'puzzle-hint-arrow-line');
        overlay.appendChild(line);

        var head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        var p1 = tipX + ',' + tipY;
        var p2 = (baseX + nx * halfWidth) + ',' + (baseY + ny * halfWidth);
        var p3 = (baseX - nx * halfWidth) + ',' + (baseY - ny * halfWidth);
        head.setAttribute('points', p1 + ' ' + p2 + ' ' + p3);
        head.setAttribute('class', 'puzzle-hint-arrow-head');
        overlay.appendChild(head);
    }

    function renderHintOnBoard() {
        resetHintVisual(false);
        if (!currentPuzzle || !currentPuzzle.moves || moveIndex >= currentPuzzle.moves.length) return;

        var nextMove = currentPuzzle.moves[moveIndex];
        if (!nextMove || nextMove.length < 4) return;

        var from = nextMove.slice(0, 2);
        var to = nextMove.slice(2, 4);
        hintFromSquare = from;
        hintToSquare = to;

        var fromEl = getSquareEl(from);
        if (fromEl) {
            fromEl.classList.add('hint-from');
        }

        if (hintRevealStage >= 2) {
            var toEl = getSquareEl(to);
            if (toEl) {
                toEl.classList.add('hint-to');
            }
            drawHintArrow(from, to);
        }
    }

    function onHintPressed() {
        if (!currentPuzzle || !currentPuzzle.moves || moveIndex >= currentPuzzle.moves.length) {
            resetHintVisual();
            if (puzzleHintTextEl) puzzleHintTextEl.textContent = 'No hint available.';
            return;
        }

        hintRevealStage = 2;
        renderHintOnBoard();

        if (!puzzleHintTextEl) return;
        puzzleHintTextEl.textContent = 'Hint: full move shown on the board.';
    }

    function orientationFromFen(fen) {
        if (window.ChessGymStore && typeof window.ChessGymStore.getPreferences === 'function') {
            var prefs = window.ChessGymStore.getPreferences();
            if (prefs.boardOrientation === 'white' || prefs.boardOrientation === 'black') {
                return prefs.boardOrientation;
            }
        }

        var parts = fen.split(/\s+/);
        var opponentTurn = parts[1];
        if (!opponentTurn) return 'white';
        if (opponentTurn === 'b') return 'white';
        return 'black';
    }

    function animateNextOpponentMove() {
        if (!currentPuzzle || moveIndex >= currentPuzzle.moves.length) return;
        resetHintVisual();
        var uci = currentPuzzle.moves[moveIndex];
        var hyphen = uciToHyphen(uci);
        waitingForAnimation = true;
        board.move(hyphen);
    }

    function persistSolvedPuzzleResult() {
        var durationMs = puzzleStartedAtMs > 0 ? Math.max(0, Date.now() - puzzleStartedAtMs) : 0;
        if (window.ChessGymStore && typeof window.ChessGymStore.recordPuzzleSolved === 'function') {
            window.ChessGymStore.recordPuzzleSolved({
                puzzleId: currentPuzzle && currentPuzzle.id,
                mistakes: puzzleMistakes,
                durationMs: durationMs
            });
        }
    }

    function onMoveEnd() {
        if (!waitingForAnimation || !currentPuzzle || !game) return;
        var uci = currentPuzzle.moves[moveIndex];
        var from = uci.slice(0, 2);
        var to = uci.slice(2, 4);
        var promotion = uci.length > 4 ? uci[4] : undefined;
        var move = game.move({ from: from, to: to, promotion: promotion });
        moveIndex++;
        waitingForAnimation = false;
        playMoveSound(move, {
            isCheck: game.in_check(),
            isMate: game.in_checkmate(),
            isPromotion: Boolean(move && move.promotion)
        });
        setLastMove(from, to);
        updateToMove();
        updateLineProgress();
        clearSelectedSquare();
        clearLegalMoves();
        resetHintVisual();
        if (moveIndex >= currentPuzzle.moves.length) {
            persistSolvedPuzzleResult();
            setStatus('Correct!', 'success');
            sessionSolvedCount += 1;
            updateSessionStats();
            puzzleEnded = true;
            showNext(true);
            return;
        }
    }

    function startPuzzle(puzzle, countSessionPlay) {
        if (!puzzle || !puzzle.moves.length) return;
        currentPuzzle = puzzle;
        moveIndex = 0;
        puzzleEnded = false;
        if (countSessionPlay !== false) {
            sessionPlayedCount += 1;
        }
        puzzleStartedAtMs = Date.now();
        puzzleMistakes = 0;
        setStatus('Puzzle loaded. Find the best move.', '');
        showNext(false);
        clearLastMove();
        clearSelectedSquare();
        clearLegalMoves();
        resetHintVisual();
        updatePuzzleId();
        updateLineProgress();
        updateSessionStats();
        if (puzzleHintTextEl) {
            puzzleHintTextEl.textContent = 'Use Hint to reveal the next move on the board.';
        }

        if (window.ChessGymStore && typeof window.ChessGymStore.recordPuzzleStart === 'function') {
            window.ChessGymStore.recordPuzzleStart(puzzle.id);
        }

        game = new Chess(puzzle.fen);
        updateToMove();
        var orientation = orientationFromFen(puzzle.fen);
        board.position(puzzle.fen, false);
        if (board.orientation) board.orientation(orientation);

        waitingForAnimation = true;
        board.move(uciToHyphen(puzzle.moves[0]));
    }

    function onDrop(source, target, piece, newPos, oldPos) {
        clearSelectedSquare();
        clearLegalMoves();
        var result = applyPlayerMove(source, target, piece);
        if (!result.ok) return 'snapback';
        return;
    }

    function onDragStart(source, piece) {
        if (!canDrag() || !game) return false;
        var turn = game.turn();
        if (piece.charAt(0) !== turn) return false;
        setLegalMoves(source);
        return true;
    }

    function onSnapbackEnd() {
        clearLegalMoves();
    }

    function initBoard() {
        if (typeof Chessboard === 'undefined') {
            throw new Error('ChessboardJS not loaded');
        }
        if (typeof Chess === 'undefined') {
            throw new Error('chess.js not loaded');
        }
        var config = {
            position: 'start',
            draggable: true,
            pieceTheme: 'https://cdn.jsdelivr.net/gh/oakmac/chessboardjs@master/website/img/chesspieces/wikipedia/{piece}.png',
            onDragStart: onDragStart,
            onDrop: onDrop,
            onMoveEnd: onMoveEnd,
            onSnapbackEnd: onSnapbackEnd
        };
        board = Chessboard('chess-board', config);
        var boardEl = document.querySelector(BOARD_SELECTOR);
        if (boardEl) {
            boardEl.addEventListener('click', onBoardSquareClick);
        }
        statusEl = document.getElementById('puzzle-status');
        toMoveEl = document.getElementById('puzzle-to-move');
        puzzleIdEl = document.getElementById('puzzle-id');
        puzzleProgressEl = document.getElementById('puzzle-progress');
        puzzleHintTextEl = document.getElementById('puzzle-hint-text');
        puzzleSessionStatsEl = document.getElementById('puzzle-session-stats');
        nextBtn = document.getElementById('puzzle-next-btn');
        newBtn = document.getElementById('puzzle-new-btn');
        resetBtn = document.getElementById('puzzle-reset-btn');
        hintBtn = document.getElementById('puzzle-hint-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', function () {
                var p = pickNextPuzzle();
                if (p) startPuzzle(p);
            });
        }
        if (newBtn) {
            newBtn.addEventListener('click', function () {
                var p = pickNextPuzzle();
                if (p) startPuzzle(p);
            });
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                if (currentPuzzle) startPuzzle(currentPuzzle, false);
            });
        }
        if (hintBtn) {
            hintBtn.addEventListener('click', onHintPressed);
        }
        window.addEventListener('resize', function () {
            if (hintRevealStage > 0) {
                renderHintOnBoard();
            }
        });
    }

    function run() {
        statusEl = document.getElementById('puzzle-status');
        toMoveEl = document.getElementById('puzzle-to-move');
        puzzleIdEl = document.getElementById('puzzle-id');
        puzzleProgressEl = document.getElementById('puzzle-progress');
        puzzleHintTextEl = document.getElementById('puzzle-hint-text');
        puzzleSessionStatsEl = document.getElementById('puzzle-session-stats');
        puzzlePanelEl = document.querySelector('.puzzle-stats-container');
        nextBtn = document.getElementById('puzzle-next-btn');
        newBtn = document.getElementById('puzzle-new-btn');
        resetBtn = document.getElementById('puzzle-reset-btn');
        hintBtn = document.getElementById('puzzle-hint-btn');
        if (!statusEl || !toMoveEl || !puzzleIdEl || !puzzleProgressEl || !puzzleHintTextEl || !puzzleSessionStatsEl || !puzzlePanelEl || !nextBtn || !newBtn || !resetBtn || !hintBtn) {
            return;
        }

        try {
            initSoundEffects();
            initBoard();
        } catch (err) {
            setErrorStatus('Could not initialize board: ' + getDisplayError(err));
            return;
        }

        loadPuzzles()
            .then(function () {
                var p = pickNextPuzzle();
                if (p) startPuzzle(p);
            })
            .catch(function (err) {
                setErrorStatus('Could not load puzzles: ' + getDisplayError(err));
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
