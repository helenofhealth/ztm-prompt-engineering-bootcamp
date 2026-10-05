const cells = document.querySelectorAll(".cell");
const statusElement = document.getElementById("status");
const playerScoreElement = document.getElementById("playerScore");
const aiScoreElement = document.getElementById("aiScore");
const drawScoreElement = document.getElementById("drawScore");
const resetButton = document.getElementById("resetButton");
const gameMessage = document.getElementById("gameMessage");
const messageText = document.getElementById("messageText");

const HUMAN = "X";
const AI = "O";

const winningCombinations = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
];

let board = Array(9).fill("");
let currentPlayer = HUMAN;
let gameActive = true;
let playerScore = 0;
let aiScore = 0;
let drawScore = 0;


// -------------------------
// GAME INITIALIZATION
// -------------------------

function startGame() {
    board = Array(9).fill("");
    currentPlayer = HUMAN;
    gameActive = true;

    gameMessage.classList.add("hidden");
    statusElement.textContent = "Your turn";

    renderBoard();
}


// -------------------------
// RENDERING
// -------------------------

function renderBoard() {
    cells.forEach((cell, index) => {
        cell.textContent = board[index];
        cell.disabled = board[index] !== "" || !gameActive;
    });
}


// -------------------------
// PLAYER MOVE
// -------------------------

function handlePlayerMove(event) {
    const index = Number(event.target.dataset.index);

    // Prevent moves after the game has ended.
    if (!gameActive) {
        return;
    }

    // Prevent moves on an occupied square.
    if (board[index] !== "") {
        return;
    }

    // Make the player's move.
    board[index] = HUMAN;

    renderBoard();

    const result = evaluateGame(board);

    if (result) {
        finishGame(result);
        return;
    }

    // Give control to the AI.
    currentPlayer = AI;
    statusElement.textContent = "AI is thinking...";

    // Small delay makes the AI feel more natural.
    setTimeout(makeAIMove, 400);
}


// -------------------------
// AI MOVE
// -------------------------

function makeAIMove() {
    if (!gameActive) {
        return;
    }

    const bestMove = findBestMove(board);

    if (bestMove !== -1) {
        board[bestMove] = AI;
    }

    renderBoard();

    const result = evaluateGame(board);

    if (result) {
        finishGame(result);
        return;
    }

    currentPlayer = HUMAN;
    statusElement.textContent = "Your turn";
}


// -------------------------
// GAME EVALUATION
// -------------------------

function evaluateGame(currentBoard) {
    for (const combination of winningCombinations) {
        const [a, b, c] = combination;

        if (
            currentBoard[a] &&
            currentBoard[a] === currentBoard[b] &&
            currentBoard[a] === currentBoard[c]
        ) {
            return currentBoard[a];
        }
    }

    if (currentBoard.every(cell => cell !== "")) {
        return "draw";
    }

    return null;
}


// -------------------------
// MINIMAX AI
// -------------------------

function findBestMove(currentBoard) {
    let bestScore = -Infinity;
    let bestMove = -1;

    for (let i = 0; i < currentBoard.length; i++) {
        if (currentBoard[i] === "") {
            currentBoard[i] = AI;

            const score = minimax(currentBoard, 0, false);

            currentBoard[i] = "";

            if (score > bestScore) {
                bestScore = score;
                bestMove = i;
            }
        }
    }

    return bestMove;
}


function minimax(currentBoard, depth, isMaximizing) {
    const result = evaluateGame(currentBoard);

    if (result === AI) {
        return 10 - depth;
    }

    if (result === HUMAN) {
        return depth - 10;
    }

    if (result === "draw") {
        return 0;
    }

    if (isMaximizing) {
        let bestScore = -Infinity;

        for (let i = 0; i < currentBoard.length; i++) {
            if (currentBoard[i] === "") {
                currentBoard[i] = AI;

                const score = minimax(
                    currentBoard,
                    depth + 1,
                    false
                );

                currentBoard[i] = "";

                bestScore = Math.max(bestScore, score);
            }
        }

        return bestScore;
    }

    let bestScore = Infinity;

    for (let i = 0; i < currentBoard.length; i++) {
        if (currentBoard[i] === "") {
            currentBoard[i] = HUMAN;

            const score = minimax(
                currentBoard,
                depth + 1,
                true
            );

            currentBoard[i] = "";

            bestScore = Math.min(bestScore, score);
        }
    }

    return bestScore;
}


// -------------------------
// GAME END
// -------------------------

function finishGame(result) {
    gameActive = false;

    if (result === HUMAN) {
        playerScore++;
        playerScoreElement.textContent = playerScore;

        messageText.textContent = "You win!";
        statusElement.textContent = "Game over";
    }

    if (result === AI) {
        aiScore++;
        aiScoreElement.textContent = aiScore;

        messageText.textContent = "The AI wins!";
        statusElement.textContent = "Game over";
    }

    if (result === "draw") {
        drawScore++;
        drawScoreElement.textContent = drawScore;

        messageText.textContent = "It's a draw!";
        statusElement.textContent = "Game over";
    }

    gameMessage.classList.remove("hidden");
    renderBoard();
}


// -------------------------
// EVENT LISTENERS
// -------------------------

cells.forEach(cell => {
    cell.addEventListener("click", handlePlayerMove);
});

resetButton.addEventListener("click", startGame);


// Start the first game.
startGame();
