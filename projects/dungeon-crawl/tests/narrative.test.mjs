import test from "node:test";
import assert from "node:assert/strict";
import { getSceneNarrative, scenarioTaglines, scenarioTitles } from "../src/game/narrative.ts";

test("scenario identity and taglines retain their mode-specific presentation", () => {
  assert.equal(scenarioTitles["lost-heir"].solo, "The Lost Heir");
  assert.equal(scenarioTitles["plague-below"].multiplayer, "The Plague Below");
  assert.equal(scenarioTitles["dragon-hoard"].solo, "The Dragon's Hoard");
  assert.equal(scenarioTitles["dragon-hoard"].multiplayer, "The Dragon’s Hoard");
  assert.equal(scenarioTaglines["dragon-hoard"], "Every treasure has a price.");
});

test("shared exploration scenes preserve the existing copy and mode-specific typography", () => {
  const solo = getSceneNarrative("lost-heir", "contract", "solo");
  const multiplayer = getSceneNarrative("lost-heir", "contract", "multiplayer");
  assert.equal(solo.eyebrow, multiplayer.eyebrow);
  assert.equal(solo.body, multiplayer.body);
  assert.equal(solo.quote, multiplayer.quote);
  assert.equal(solo.title, "The Throne's Price");
  assert.equal(multiplayer.title, "The Throne’s Price");

  assert.equal(getSceneNarrative("plague-below", "contract", "solo").body,
    "The ledger records a quarantine that began twenty years ago. Every name is crossed out except one: the name of the city's founder.");
  assert.equal(getSceneNarrative("plague-below", "contract", "multiplayer").body,
    "The ledger records a quarantine that began twenty years ago. Every name is crossed out except one: the name of the city’s founder.");
});

test("all scenario scene variants remain defined for both modes", () => {
  for (const scenarioId of ["lost-heir", "plague-below", "dragon-hoard"]) {
    for (const scene of ["gate", "contract", "blood-door", "well", "armory"]) {
      for (const mode of ["solo", "multiplayer"]) {
        const content = getSceneNarrative(scenarioId, scene, mode);
        assert.ok(content.title && content.body && content.eyebrow && content.quote);
      }
    }
  }
});
