# Prompt Engineering Bootcamp — Portfolio Case Study

## Overview

This repository contains projects completed during the Zero To Mastery Prompt Engineering Bootcamp.

The portfolio demonstrates a progression from using AI to build simple applications to designing a structured AI system with prompts, modes, state, knowledge retrieval, testing, and career automation.

The three primary projects are:

1. Snake Game
2. Tic-Tac-Toe with AI
3. Neo Career Coach

---

# 1. Learning Approach

The projects were developed using an AI-assisted development workflow.

The process was:

```text
Requirements
    ↓
Prompt
    ↓
AI-generated implementation
    ↓
Run
    ↓
Test
    ↓
Identify defects
    ↓
Correct
    ↓
Document
    ↓
Portfolio evidence
```

The objective was not simply to generate working code.

The objective was to understand how to:

- Give AI precise instructions
- Evaluate generated output
- Identify defects
- Debug iteratively
- Test edge cases
- Document design decisions
- Turn learning into reusable professional evidence

---

# 2. Project 1 — Snake Game

## Objective

Build a browser-based Snake game using:

- HTML
- CSS
- JavaScript

The game was developed iteratively through AI-assisted coding.

## Features

The final version includes functionality such as:

- Snake movement
- Food generation
- Collision detection
- Score tracking
- Game-over handling
- Restart functionality
- Quit functionality
- Pause functionality
- Keyboard controls

## Prompt Engineering Lessons

The project demonstrated that an initial prompt rarely produces a perfect implementation.

Additional requirements were introduced iteratively, including:

- Visual changes
- Speed adjustments
- Game-over messaging
- Restart behavior
- Quit behavior
- Pause functionality

This demonstrated the importance of treating AI development as an iterative process rather than a single prompt-and-submit workflow.

## Debugging

When generated behavior did not match the desired behavior, the implementation was reviewed and corrected through additional prompts and testing.

This established a repeatable workflow:

```text
Request
→ Generate
→ Run
→ Observe
→ Diagnose
→ Correct
→ Retest
```

---

# 3. Project 2 — Tic-Tac-Toe AI

## Objective

Build a browser-based Tic-Tac-Toe game with an AI opponent.

Technologies:

- HTML
- CSS
- JavaScript

## AI Opponent

The AI opponent uses game-state evaluation and Minimax decision-making.

The system evaluates possible future board states and selects moves based on the resulting game outcomes.

Conceptually:

```text
Current Board
     ↓
Generate Possible Moves
     ↓
Evaluate Future States
     ↓
Minimax
     ↓
Select Best Move
```

## Testing

The project includes tests and documentation covering:

- Invalid moves
- Winning positions
- Losing positions
- Draw scenarios
- Full boards
- AI decision-making
- Edge cases

## AI-Generated Defect

An important part of the project was documenting an example of an AI-generated defect rather than presenting the generated code as perfect.

The defect was analyzed, corrected, and documented.

This demonstrates an important AI development skill:

> AI-generated code must be reviewed and tested by the developer.

---

# 4. Project 3 — Neo Career Coach

## Objective

Neo was designed as a personalized AI Career Coach.

Unlike the games, Neo is primarily a system-design and prompt-engineering project.

The objective was to create an AI coach that connects:

- AI development education
- Zero To Mastery coursework
- GoHighLevel expertise
- AI automation
- Portfolio development
- Career strategy

---

# 5. Neo Architecture

Neo separates several system components.

```text
System Instructions
        +
Knowledge Base
        +
Slash Commands
        +
Mode Routing
        +
Progress Model
        ↓
Personalized AI Career Coach
```

## System Instructions

The system prompt defines:

- Persona
- Career strategy
- Learning behavior
- Modes
- Slash commands
- XP rules
- Portfolio review
- Career reviews

## Knowledge Base

The official ZTM course links are stored separately in a Knowledge Base document.

This separates:

**System behavior**

from:

**Reference information**

This makes the system easier to maintain.

---

# 6. Mode Design

Neo supports explicit modes.

### Career Path Mode

Guides the user through the AI Developer Career Path.

### Learning Mode

Explains concepts and checks understanding.

### Quiz Mode

Tests knowledge and awards XP.

### Code Challenge Mode

Provides coding challenges and reviews solutions.

Additional commands provide:

- Help
- Rank
- Notes
- Motivation
- Exit

The system was designed so that only one mode should be active at a time.

---

# 7. Progress Architecture

Neo uses structured progress data.

The schema represents:

### Learning

- Current course
- Current section
- Current lesson
- Next action

### Gamification

- Level
- XP
- XP rules

### Portfolio

- Projects
- GitHub repositories
- Case studies
- Client offers
- Demos

### Career

- Client revenue
- Pipeline
- Job applications
- Interviews
- Certification progress
- Career strategy

This demonstrates the transition from a simple prompt toward a stateful AI application architecture.

---

# 8. Portfolio-First Learning

A key design principle of Neo is that learning should create evidence.

After completing a major course, project, or certification, Neo evaluates:

1. What client offer could this become?
2. What job-ready skill does it demonstrate?
3. How does it strengthen the user's positioning?
4. What is the smallest action required to create proof?

The proof might be:

- GitHub repository
- Demo
- Case study
- Technical specification
- Client proposal
- Outreach asset

This creates a feedback loop:

```text
Learning
   ↓
Project
   ↓
Evidence
   ↓
Portfolio
   ↓
Client / Career Opportunity
```

---

# 9. GHL + AI Positioning

The long-term goal is to combine AI development skills with existing GoHighLevel and fractional CTO expertise.

The projects therefore aren't treated as isolated programming exercises.

They are evaluated for potential professional applications.

For example:

```text
AI Skill
   +
GHL Expertise
   ↓
AI Automation
   ↓
Client Solution
   ↓
Service Offer
```

This creates a distinctive positioning around:

**GoHighLevel + AI development + automation architecture**

---

# 10. AI-Assisted Development Lessons

The projects demonstrated several important lessons.

## AI Is Not the Developer

AI can generate substantial amounts of code and system design.

However, generated output still needs:

- Review
- Testing
- Validation
- Debugging
- Refinement

## Better Prompts Produce Better Starting Points

Specific requirements reduce ambiguity.

Useful prompt components include:

- Objective
- Constraints
- Features
- Expected behavior
- Edge cases
- Technical requirements
- Output format

## Iteration Is Part of the Process

The first generated version should be treated as a starting point.

The workflow becomes:

```text
Prompt
→ Output
→ Test
→ Feedback
→ Improved prompt
→ Improved output
```

---

# 11. Skills Demonstrated

This portfolio demonstrates:

## Prompt Engineering

- System prompts
- Role definition
- Structured instructions
- Behavioral constraints
- Prompt iteration

## AI-Assisted Development

- Code generation
- Debugging
- Iterative development
- Requirements refinement

## Software Development

- HTML
- CSS
- JavaScript
- Game-state logic
- Event handling
- Algorithms
- Minimax

## AI System Design

- Mode routing
- Knowledge architecture
- State modeling
- Progress tracking
- Structured AI behavior

## Product Thinking

- Portfolio strategy
- Client-offer design
- Career positioning
- Future product architecture

---

# 12. Future Development

The next stage is to move beyond prompt-driven systems toward production AI applications.

Potential future projects include:

- RAG knowledge assistants
- AI agents
- GHL + AI workflow architects
- AI-powered client brief generators
- AI automation specification tools
- MCP-based systems
- Production LLM applications

The long-term direction is:

```text
AI Development
       +
GoHighLevel
       +
Automation
       +
Fractional CTO Expertise
       ↓
AI Automation Architecture
       ↓
Production Client Solutions
```

---

# 13. Portfolio Evolution

This repository represents the beginning of the portfolio rather than the final destination.

The intended progression is:

```text
Course Projects
      ↓
Technical Evidence
      ↓
GitHub Portfolio
      ↓
Case Studies
      ↓
Client Offers
      ↓
Standalone AI Products
```

As stronger projects are developed, the most significant ones can eventually be extracted into standalone public repositories.

Potential future repositories include:

```text
ghl-ai-workflow-architect
rag-knowledge-assistant
ai-agent-client-brief-generator
```

---

# 14. Conclusion

The three projects demonstrate a progression in both technical complexity and AI-system thinking.

### Snake

Demonstrates AI-assisted application development and iterative debugging.

### Tic-Tac-Toe AI

Adds algorithmic reasoning, AI decision-making, testing, and edge-case analysis.

### Neo

Moves into structured AI system design, prompt architecture, state modeling, knowledge management, mode routing, and professional application.

The overall progression is:

```text
AI-Assisted Coding
        ↓
Debugging + Testing
        ↓
Algorithmic AI
        ↓
Structured Prompt Engineering
        ↓
AI System Architecture
        ↓
GHL + AI Automation
        ↓
Production AI Applications
```

The portfolio's objective is therefore not simply to demonstrate that AI tools were used.

It demonstrates the ability to **direct AI, evaluate its output, understand the resulting systems, correct defects, and turn AI capabilities into practical solutions.**
