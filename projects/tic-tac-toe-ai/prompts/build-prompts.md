# Tic-Tac-Toe AI — Build Prompts and Testing

This document records the prompts, design decisions, testing, and debugging process used to develop the Tic-Tac-Toe AI.

---

## 1. Original Build Prompt

Create a browser-based Tic-Tac-Toe game using HTML, CSS, and JavaScript.

The game should allow a human player to play against an AI opponent.

Requirements:

- 3 × 3 Tic-Tac-Toe board
- Human player uses X
- AI uses O
- Human vs AI gameplay
- Win detection
- Draw detection
- Invalid-move handling
- Game reset
- Score tracking
- AI decision-making
- Responsive interface

The AI should use the Minimax algorithm to evaluate possible moves and select the strongest available move.

Provide complete HTML, CSS, and JavaScript.

Explain the game-state logic and the AI decision-making process.

---

## 2. AI Opponent Design Prompt

Design the AI opponent using the Minimax algorithm.

The AI should:

1. Identify all available moves.
2. Simulate each possible AI move.
3. Recursively simulate the human player's best response.
4. Continue evaluating possible future game states.
5. Assign scores to terminal states.
6. Select the move with the highest score.

Use:

- Positive scores for AI wins.
- Negative scores for human wins.
- Zero for draws.

Use recursion depth to prefer faster wins and delay losses.

The AI must never modify the real game board while evaluating hypothetical moves.

---

## 3. Game Rules

The game follows standard Tic-Tac-Toe rules.

- The board contains nine positions.
- The human player is X.
- The AI player is O.
- Players alternate turns.
- A player wins by occupying three positions in a horizontal, vertical, or diagonal line.
- If all nine positions are occupied without a winner, the game is a draw.
- A player cannot place a mark in an occupied position.
- Once a game ends, additional moves are disabled.
- A new game resets the board but preserves the score.

---

## 4. Game-State Logic

The game tracks:

```javascript
let board = Array(9).fill("");
let currentPlayer = HUMAN;
let gameActive = true;
```

The board contains nine values representing the nine positions.

An empty position contains:

```text
""
```

A human move contains:

```text
"X"
```

An AI move contains:

```text
"O"
```

The `gameActive` state prevents moves after a game has ended.

---

## 5. Win Detection

The implementation checks the following winning combinations:

```javascript
const winningCombinations = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 6],
    [2, 4, 6]
];
```

Each combination represents a possible three-in-a-row.

The game checks whether all three positions contain the same non-empty value.

---

## 6. Minimax Decision Logic

The AI uses Minimax to evaluate possible future game states.

The simplified decision process is:

```text
AI considers a possible move
        ↓
Simulate the move
        ↓
Simulate the human's best response
        ↓
Simulate the AI's best response
        ↓
Continue until a terminal state
        ↓
Evaluate the outcome
        ↓
Choose the highest-scoring move
```

The evaluation scores are:

```text
AI win      → positive score
Human win   → negative score
Draw        → 0
```

Depth is incorporated into the score so that the AI prefers winning sooner and losing later.

---

# Testing

## 7. Invalid-Move Test

### Test

1. Place X in an empty square.
2. Click the same square again.

### Expected result

The second click should be ignored.

### Result

**PASS**

The implementation checks whether the board position is already occupied before making a move.

---

## 8. Full Board / Draw Test

### Test

Fill the board without creating a winning combination.

### Expected result

The game should identify the draw and display:

```text
It's a draw!
```

### Result

**PASS**

The implementation checks whether every board position is occupied after checking for a winner.

---

## 9. Winning Position Test

### Test

Create a position where the human player has three X's in a row.

### Expected result

The game should:

- Identify the human victory.
- Stop the game.
- Increase the player score.
- Display the game-over message.
- Prevent additional moves.

### Result

**PASS**

---

## 10. Losing Position Test

### Test

Create a position where the AI can complete three O's in a row.

### Expected result

The AI should select the winning move.

### Result

**PASS**

---

## 11. AI Blocking Test

### Test

Create a position where the human player has two X's in a row and can win on the next move.

### Expected result

The AI should recognize the threat and block the winning position.

### Result

**PASS**

---

## 12. New Game Test

### Test

Complete a game and click **New Game**.

### Expected result

- Board becomes empty.
- A new game begins.
- Scores are preserved.

### Result

**PASS**

---

## 13. Post-Game Move Test

### Test

Complete a game and attempt to click another board position.

### Expected result

No additional move should be accepted.

### Result

**PASS**

---

# AI-Generated Defect

During AI-assisted development, one important area to validate was the distinction between the real board state and hypothetical board states used by Minimax.

A poorly implemented Minimax algorithm can accidentally leave simulated moves on the real board.

That would create a serious defect because the AI could appear to make multiple moves or corrupt the game state.

---

# Correction

The implementation restores each hypothetical move after evaluating it.

For example:

```javascript
currentBoard[i] = AI;

const score = minimax(
    currentBoard,
    depth + 1,
    false
);

currentBoard[i] = "";
```

The same pattern is used when simulating the human player's response.

The move is temporarily applied, evaluated recursively, and then removed.

---

# Reasoning

Minimax needs to explore possible futures without actually changing the live game.

The temporary move therefore has three stages:

```text
Apply hypothetical move
        ↓
Evaluate future game states
        ↓
Undo hypothetical move
```

Without the final step, each simulated move would remain on the board and contaminate subsequent calculations.

This is an important example of why AI-generated code must be tested rather than accepted without review.

---

# Development Workflow

The project followed an iterative AI-assisted development process:

1. Define the game requirements.
2. Generate the initial implementation.
3. Implement the AI opponent.
4. Run the application.
5. Test normal gameplay.
6. Test invalid moves.
7. Test winning and losing positions.
8. Test draw conditions.
9. Test AI blocking behavior.
10. Test game reset behavior.
11. Review the Minimax implementation.
12. Document the testing and reasoning.

---

# Skills Demonstrated

This project demonstrates:

- Prompt engineering
- AI-assisted development
- JavaScript
- Game-state management
- Algorithmic reasoning
- Recursion
- Minimax
- Decision-tree evaluation
- Input validation
- Edge-case testing
- Debugging AI-generated code
- Translating requirements into software behavior
