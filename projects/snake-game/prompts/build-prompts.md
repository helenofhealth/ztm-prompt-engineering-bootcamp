# Snake Game — AI Development Prompts

This document records the prompts used to develop and debug the Snake Game.

The project was developed iteratively with AI assistance rather than generated as a single final application.

---

## 1. Original Build Prompt

I want to create a Snake game using HTML, JavaScript, and CSS.

Create a complete playable browser-based Snake game using HTML Canvas.

The game should include:

- A visible game board
- A snake that moves continuously
- Keyboard controls
- Food that appears randomly
- Snake growth when food is eaten
- Score tracking
- Collision detection
- Game-over behavior
- Restart functionality
- A clean and simple interface

Provide the complete HTML, CSS, and JavaScript required to run the game.

Explain where each part of the code belongs and how to run the game.

---

## 2. Background Color Prompt

Change the game background from black to pink.

Use the following color:

#ffc0cb

Show me exactly where the color needs to be changed in the code.

---

## 3. Canvas Background Prompt

Where in the JavaScript should I add:

ctx.fillStyle = "#ffc0cb";

Explain what this line does and where it belongs in the game rendering function.

---

## 4. Speed Prompt

Where can I adjust the speed of the snake?

Show me the exact line of code that controls the game speed and explain how changing the value affects the speed.

---

## 5. Game Over Prompt

When the player loses, change the message to:

"Game Over! Womp Womp. Press Q to quit or C to play again."

Add functionality so that:

- Pressing Q quits the game.
- Pressing C starts the game again.

---

## 6. Pause Prompt

Add pause functionality to the game.

When the player presses the Spacebar, the game should pause.

Pressing Spacebar again should resume the game.

---

## 7. Debugging Prompt

Review the complete Snake Game code for bugs.

Pay particular attention to:

- Game state
- Restart behavior
- Quit behavior
- Pause behavior
- Keyboard event handling
- Game-loop management
- Collision detection
- Direction changes

Identify any bugs or fragile logic and explain why they could cause unexpected behavior.

---

## 8. Generated Defect

During iterative AI-assisted development, game-state handling became an area requiring debugging.

The game contains several states:

- Running
- Paused
- Game Over
- Exited

These states must be kept separate because keyboard commands such as Q, C, and Space have different meanings depending on the current state.

A defect can occur when the game loop or keyboard state is not correctly reset after quitting or restarting.

---

## 9. Correction

The final implementation explicitly tracks game state using:

```javascript
let gameRunning = false;
let gamePaused = false;
let gameOver = false;
let gameExited = false;
```

The restart function resets the relevant state:

```javascript
function init() {
    gamePaused = false;
    gameOver = false;
    gameExited = false;
    gameRunning = true;
}
```

The game loop is also cleared before starting a new one:

```javascript
clearInterval(gameLoop);
gameLoop = setInterval(update, gameSpeed);
```

This prevents multiple game loops from running simultaneously after repeated restarts.

---

## 10. Reasoning Behind the Correction

The defect was caused by treating game state as if there were only one condition: whether the game was running.

The correction separates the states so each control can be handled predictably.

For example:

- Space only pauses an active game.
- C can restart the game.
- Q stops the game loop.
- Game Over stops normal updates.
- Restart resets all relevant state variables.

Explicit state management makes the game easier to reason about, debug, and extend.

---

## 11. Development Approach

The project demonstrates an iterative AI-assisted development workflow:

1. Generate an initial implementation.
2. Run the application.
3. Identify missing features or defects.
4. Ask AI to modify the implementation.
5. Test the changes.
6. Identify additional edge cases.
7. Correct the implementation.
8. Document the defect and reasoning.
9. Preserve the final working version in GitHub.
