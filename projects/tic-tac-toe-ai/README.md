# Tic-Tac-Toe AI

An AI-powered Tic-Tac-Toe game built with HTML, CSS, and JavaScript as part of the Zero To Mastery Prompt Engineering Bootcamp.

The project demonstrates AI-assisted development, game-state management, algorithmic decision-making, testing, and debugging.

## Screenshot

![Tic-Tac-Toe AI Screenshot](assets/screenshot.png)

## Features

- Human vs AI gameplay
- 3 × 3 Tic-Tac-Toe board
- Human player uses X
- AI player uses O
- Minimax AI decision-making
- Win detection
- Draw detection
- Invalid-move handling
- Game-state management
- Game reset
- Persistent score tracking during the session
- Responsive interface

## How It Works

The player makes the first move as X.

After each valid player move, the game:

1. Updates the board.
2. Checks for a winner.
3. Checks for a draw.
4. Gives the AI control if the game continues.
5. Uses Minimax to evaluate possible moves.
6. Selects the strongest available move.
7. Updates the board.
8. Checks for a winner or draw.

## AI Decision-Making

The AI uses the **Minimax algorithm**.

Minimax evaluates possible future game states rather than simply selecting a random empty square.

The decision process can be simplified as:

```text
AI considers a move
       ↓
Simulate the move
       ↓
Consider the human's best response
       ↓
Consider the AI's best response
       ↓
Continue until a terminal state
       ↓
Evaluate the outcome
       ↓
Choose the highest-scoring move
```

The evaluation system uses:

| Outcome | Score |
|---|---:|
| AI win | Positive |
| Human win | Negative |
| Draw | 0 |

The algorithm also uses recursion depth so the AI prefers faster wins and delays losses.

## Game Rules

- The board contains nine positions.
- The human player is X.
- The AI player is O.
- Players alternate turns.
- Three matching symbols in a horizontal, vertical, or diagonal line wins the game.
- A full board without a winner results in a draw.
- Players cannot select an occupied square.
- Additional moves are disabled after the game ends.
- Starting a new game clears the board while preserving
