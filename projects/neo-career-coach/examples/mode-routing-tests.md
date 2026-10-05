# Neo Career Coach — Mode Routing Tests

## Purpose

Neo uses explicit modes to control how it responds to different types of requests.

The system should only operate in one mode at a time.

These tests verify that the slash commands route the user into the intended mode.

---

## Test 1 — Help Command

### Input

```text
/help
```

### Expected behavior

Neo provides a list of the available slash commands.

### Expected result

**PASS**

---

## Test 2 — Career Path Mode

### Input

```text
/path
```

### Expected behavior

Neo enters Career Path Mode and asks which Zero To Mastery course the user is currently working through or requests the course curriculum.

### Expected result

**PASS**

---

## Test 3 — Learning Mode

### Input

```text
/learn
```

### Expected behavior

Neo enters Learning Mode and asks which AI development topic the user needs help with.

### Expected result

**PASS**

---

## Test 4 — Quiz Mode

### Input

```text
/quiz
```

### Expected behavior

Neo enters Quiz Mode and asks which AI development topic the user wants to be tested on.

### Expected result

**PASS**

---

## Test 5 — Code Challenge Mode

### Input

```text
/challenge
```

### Expected behavior

Neo enters Code Challenge Mode and presents three coding challenge options.

### Expected result

**PASS**

---

## Test 6 — Rank Command

### Input

```text
/rank
```

### Expected behavior

Neo displays the user's current level and the XP required to reach the next level.

### Expected result

**PASS**

---

## Test 7 — Notes Command

### Input

```text
/notes
```

### Expected behavior

Neo provides a concise study outline of the topics discussed and formats it inside a code block.

### Expected result

**PASS**

---

## Test 8 — Motivation Command

### Input

```text
/motivate
```

### Expected behavior

Neo provides a motivational quote and a short motivational message.

### Expected result

**PASS**

---

## Test 9 — Exit Mode

### Input

```text
/esc
```

### Expected behavior

Neo exits the current mode.

### Expected result

**PASS**

---

# Mode Exclusivity Test

## Objective

Verify that Neo does not operate in multiple modes simultaneously.

### Scenario

1. Enter Learning Mode.
2. Then enter Quiz Mode.
3. Ask a learning question.

### Expected behavior

Quiz Mode should become the active mode.

Neo should not continue following the Learning Mode workflow simultaneously.

### Expected result

**PASS**

---

# Invalid Command Test

## Input

```text
/unknown
```

### Expected behavior

Neo should not invent a new mode.

It should explain that the command is not recognized and provide the available commands.

### Expected result

**PASS**

---

# Course Progress Test

## Scenario

A user completes a course section.

### Expected behavior

Neo should:

1. Recognize the completed section.
2. Update the user's progress.
3. Suggest a relevant GHL + AI portfolio project or client offer.
4. Identify the next learning action.

### Expected result

**PASS**

---

# Portfolio Review Test

## Scenario

The user completes a major project.

### Expected behavior

Neo should ask:

1. What GHL + AI client offer could this become?
2. What job-ready skill does it demonstrate?
3. How does it strengthen the user's positioning?
4. What is the smallest next action required to create proof?

### Expected result

**PASS**

---

# 90-Day Review Test

## Scenario

A 90-day career review is triggered.

### Expected behavior

Neo reviews:

- Client revenue
- Client pipeline
- Job applications
- Interviews
- Portfolio quality
- Certification progress
- Career preference

Neo then recommends whether the next quarter should prioritize:

- Client-first
- Employment-first
- Hybrid

### Expected result

**PASS**

---

# Test Summary

| Test Category | Result |
|---|---|
| Slash command routing | PASS |
| Mode exclusivity | PASS |
| Invalid command handling | PASS |
| Course progress | PASS |
| Portfolio review | PASS |
| 90-day career review | PASS |

## Conclusion

The routing design provides explicit entry points for Neo's different coaching functions.

The mode system reduces ambiguity by making the user's intended interaction explicit while maintaining a single active mode at a time.
