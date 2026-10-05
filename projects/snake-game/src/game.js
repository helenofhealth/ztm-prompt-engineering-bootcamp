const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const highScoreElement = document.getElementById("highScore");
const gameMessage = document.getElementById("gameMessage");
const messageText = document.getElementById("messageText");

const gridSize = 20;
const tileCount = canvas.width / gridSize;

// Change this value to make the snake faster or slower.
// Lower number = faster snake.
const gameSpeed = 100;

let snake;
let food;
let direction;
let nextDirection;
let score;
let highScore = Number(localStorage.getItem("snakeHighScore")) || 0;

let gameLoop;
let gameRunning = false;
let gamePaused = false;
let gameOver = false;
let gameExited = false;

highScoreElement.textContent = highScore;

function init() {
    snake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
    ];

    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };

    score = 0;
    gamePaused = false;
    gameOver = false;
    gameExited = false;
    gameRunning = true;

    scoreElement.textContent = score;
    gameMessage.classList.add("hidden");

    createFood();

    clearInterval(gameLoop);
    gameLoop = setInterval(update, gameSpeed);

    draw();
}

function createFood() {
    let validPosition = false;

    while (!validPosition) {
        food = {
            x: Math.floor(Math.random() * tileCount),
            y: Math.floor(Math.random() * tileCount)
        };

        validPosition = !snake.some(
            segment => segment.x === food.x && segment.y === food.y
        );
    }
}

function update() {
    if (!gameRunning || gamePaused || gameOver || gameExited) {
        return;
    }

    direction = nextDirection;

    const head = {
        x: snake[0].x + direction.x,
        y: snake[0].y + direction.y
    };

    if (checkCollision(head)) {
        endGame();
        return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score++;

        scoreElement.textContent = score;

        if (score > highScore) {
            highScore = score;
            highScoreElement.textContent = highScore;
            localStorage.setItem("snakeHighScore", highScore);
        }

        createFood();
    } else {
        snake.pop();
    }

    draw();
}

function checkCollision(head) {
    // Wall collision
    if (
        head.x < 0 ||
        head.x >= tileCount ||
        head.y < 0 ||
        head.y >= tileCount
    ) {
        return true;
    }

    // Self collision
    return snake.some(
        segment => segment.x === head.x && segment.y === head.y
    );
}

function draw() {
    ctx.fillStyle = "#ffc0cb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw food
    ctx.fillStyle = "red";
    ctx.fillRect(
        food.x * gridSize,
        food.y * gridSize,
        gridSize,
        gridSize
    );

    // Draw snake
    snake.forEach((segment, index) => {
        ctx.fillStyle = index === 0 ? "darkgreen" : "green";

        ctx.fillRect(
            segment.x * gridSize,
            segment.y * gridSize,
            gridSize - 1,
            gridSize - 1
        );
    });
}

function endGame() {
    gameRunning = false;
    gameOver = true;

    clearInterval(gameLoop);

    messageText.textContent =
        "Game Over! Womp Womp. Press Q to quit or C to play again.";

    gameMessage.classList.remove("hidden");
}

function pauseGame() {
    if (!gameRunning || gameOver || gameExited) {
        return;
    }

    gamePaused = !gamePaused;

    if (gamePaused) {
        messageText.textContent = "Paused. Press Space to resume.";
        gameMessage.classList.remove("hidden");
    } else {
        gameMessage.classList.add("hidden");
    }
}

function quitGame() {
    if (!gameOver && !gameRunning) {
        return;
    }

    gameExited = true;
    gameRunning = false;
    gamePaused = false;

    clearInterval(gameLoop);

    messageText.textContent = "Game exited. Press C to play again.";
    gameMessage.classList.remove("hidden");
}

function restartGame() {
    init();
}

function changeDirection(newDirection) {
    if (!gameRunning || gameOver || gameExited) {
        return;
    }

    // Prevent the snake from reversing directly into itself.
    if (
        newDirection.x === -direction.x &&
        newDirection.y === -direction.y
    ) {
        return;
    }

    nextDirection = newDirection;
}

document.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    if (key === " ") {
        event.preventDefault();
        pauseGame();
        return;
    }

    if (key === "c") {
        restartGame();
        return;
    }

    if (key === "q") {
        quitGame();
        return;
    }

    switch (key) {
        case "arrowup":
        case "w":
            changeDirection({ x: 0, y: -1 });
            break;

        case "arrowdown":
        case "s":
            changeDirection({ x: 0, y: 1 });
            break;

        case "arrowleft":
        case "a":
            changeDirection({ x: -1, y: 0 });
            break;

        case "arrowright":
        case "d":
            changeDirection({ x: 1, y: 0 });
            break;
    }
});

document.querySelectorAll(".mobile-controls button").forEach(button => {
    button.addEventListener("click", () => {
        const directionName = button.dataset.direction;

        const directions = {
            up: { x: 0, y: -1 },
            down: { x: 0, y: 1 },
            left: { x: -1, y: 0 },
            right: { x: 1, y: 0 }
        };

        changeDirection(directions[directionName]);
    });
});

init();
