import { useEffect, useMemo, useState } from "react";

type Scene = "gate" | "blood-door" | "well" | "armory" | "contract" | "combat" | "victory";
type LogEntry = { text: string; kind?: "roll" | "danger" | "good" };
type PartyMember = { name: string; role: string; hp: number; maxHp: number; detail: string; icon: string };

type SaveState = {
  scene: Scene; hp: number; maxHp: number; gold: number; xp: number; potions: number;
  inventory: string[]; log: LogEntry[]; explored: string[]; enemyHp: number; enemyMaxHp: number;
  round: number; lastRoll: number | null;
};

const initialParty: PartyMember[] = [
  { name: "Brom Ironvein", role: "Dwarf Guardian", hp: 28, maxHp: 28, detail: "Front-line protector", icon: "🛡️" },
  { name: "Lyra Thornwhisper", role: "Elven Ranger", hp: 20, maxHp: 20, detail: "Scout and archer", icon: "🏹" },
  { name: "Mira Voss", role: "Human Mage", hp: 18, maxHp: 18, detail: "Arcane investigator", icon: "🔮" },
];
const starterInventory = ["Ancestral longsword", "Reinforced armor", "Shield", "5 torches", "50 ft rope", "Flint & steel", "3 days of rations", "Signet of the First King"];
const initialState: SaveState = {
  scene: "gate", hp: 24, maxHp: 24, gold: 25, xp: 0, potions: 2,
  inventory: starterInventory, log: [
    { text: "Campaign started: Eleni, the Lost Heir. Your signet has awakened.", kind: "good" },
    { text: "Brom, Lyra, and Mira join your expedition." },
    { text: "The gate whispers: “The rightful heir has come home.”", kind: "danger" },
  ], explored: [], enemyHp: 22, enemyMaxHp: 22, round: 1, lastRoll: null,
};

const roll = (sides: number) => Math.floor(Math.random() * sides) + 1;

export default function App() {
  const [game, setGame] = useState<SaveState>(() => {
    try {
      const raw = localStorage.getItem("dungeon-crawl-save-v1");
      return raw ? { ...initialState, ...JSON.parse(raw) as Partial<SaveState> } : initialState;
    } catch { return initialState; }
  });
  const [party, setParty] = useState(initialParty);
  const [tab, setTab] = useState<"journal" | "inventory">("journal");

  useEffect(() => {
    localStorage.setItem("dungeon-crawl-save-v1", JSON.stringify(game));
  }, [game]);

  const addLog = (entries: LogEntry[]) => setGame(g => ({ ...g, log: [...g.log, ...entries].slice(-40) }));
  const check = (label: string, bonus = 0, dc = 12) => {
    const die = roll(20); const total = die + bonus;
    const success = die === 20 || (die !== 1 && total >= dc);
    addLog([{ text: `${label}: d20 (${die}) ${bonus >= 0 ? "+" : ""}${bonus} = ${total} vs DC ${dc} — ${success ? "SUCCESS" : "FAILURE"}`, kind: success ? "good" : "danger" }]);
    setGame(g => ({ ...g, lastRoll: die }));
    return success;
  };

  const updateParty = (damage: number) => setParty(p => p.map((member, i) =>
    i === 0 ? { ...member, hp: Math.max(0, member.hp - damage) } : member
  ));

  const startCombat = () => {
    setGame(g => ({ ...g, scene: "combat", enemyHp: g.enemyMaxHp, round: 1 }));
    addLog([{ text: "COMBAT: A Crownbound Sentinel tears free from the wall!", kind: "danger" }]);
  };

  const attack = () => {
    const die = roll(20); const hit = die + 5 >= 12 || die === 20;
    const damage = hit ? roll(8) + 3 : 0;
    const afterHit = Math.max(0, game.enemyHp - damage);
    const entries: LogEntry[] = [{ text: `Eleni attacks: d20 (${die}) + 5. ${hit ? `Hit for ${damage} damage!` : "Miss!"}`, kind: hit ? "good" : "danger" }];
    if (afterHit <= 0) {
      entries.push({ text: "The sentinel collapses into a storm of black ash. The chamber falls silent.", kind: "good" });
      setGame(g => ({ ...g, scene: "victory", enemyHp: 0, xp: g.xp + 50, gold: g.gold + 15, log: [...g.log, ...entries] }));
      return;
    }
    const enemyDamage = roll(6) + 1;
    const newHp = Math.max(0, game.hp - enemyDamage);
    entries.push({ text: `The sentinel retaliates for ${enemyDamage} damage.`, kind: "danger" });
    if (newHp === 0) entries.push({ text: "Eleni falls unconscious. Use a healing potion or restart the encounter.", kind: "danger" });
    setGame(g => ({ ...g, enemyHp: afterHit, hp: newHp, round: g.round + 1, log: [...g.log, ...entries] }));
  };

  const usePotion = () => {
    if (game.potions <= 0 || game.hp === game.maxHp) return;
    const healing = roll(4) + roll(4) + 2;
    setGame(g => ({ ...g, hp: Math.min(g.maxHp, g.hp + healing), potions: g.potions - 1, log: [...g.log, { text: `You drink a healing potion and recover ${healing} HP.`, kind: "good" }] }));
  };

  const choose = (scene: Scene, title: string, description: string, action: () => void) => (
    <button className="choice" onClick={() => { action(); setGame(g => ({ ...g, explored: g.explored.includes(title) ? g.explored : [...g.explored, title] })); }}>
      <span className="choice-letter">{title.slice(0, 1)}</span><span><strong>{title}</strong><small>{description}</small></span><span className="arrow">↗</span>
    </button>
  );

  const sceneContent = useMemo(() => {
    switch (game.scene) {
      case "gate": return { eyebrow: "CHAPTER I · THE GATE THAT BREATHES", title: "The Heir Has Come Home", art: "gate", body: "Rain hammers the ruined fortress above you. The black-iron gate opens at the touch of your signet. Beyond it, ankle-deep black water surrounds four faceless statues and a bronze pedestal.", quote: "“The heir may claim the throne, but the throne claims the heir.”" };
      case "blood-door": return { eyebrow: "LOCATION · THE BLOOD-SEALED DOOR", title: "Someone Knows Your Name", art: "blood", body: "A crimson seal throbs on an iron door. Something pounds against the other side. Between each impact, a voice cries: “Your Majesty! Please, you must let me out!”", quote: "Brom whispers: “I've seen this crest on a tomb door. From the inside.”" };
      case "well": return { eyebrow: "LOCATION · THE WHISPERING WELL", title: "A Voice from Below", art: "well", body: "Cold blue light shimmers over a circular well. From its depths, your own voice repeats a sentence you have never spoken: “Do not trust Brom.”", quote: "Brom refuses to meet your eyes. Mira says the magic is old enough to have a memory." };
      case "armory": return { eyebrow: "LOCATION · THE FORGOTTEN ARMORY", title: "Steel Remembers", art: "armory", body: "Weapons hang in rows beneath a collapsed arch. A golden light flickers behind a fallen statue, and somewhere in the dark, a blade is being sharpened.", quote: "Lyra spots fresh tracks. Whatever is here has been waiting." };
      case "contract": return { eyebrow: "DISCOVERY · THE ROYAL CONTRACT", title: "The Throne's Price", art: "contract", body: "The inscription is not a warning but a contract. Your signet fits a hollow in the pedestal. Ancient letters rearrange themselves around your hand.", quote: "“Blood grants entry. Memory grants passage. A name grants the crown.”" };
      case "combat": return { eyebrow: `ENCOUNTER · ROUND ${game.round}`, title: "Crownbound Sentinel", art: "combat", body: "A suit of royal armor pulls itself upright. Green fire burns inside its empty visor. Its sword points at your heart.", quote: "“UNRECOGNIZED HEIR. SUBMIT FOR JUDGMENT.”" };
      case "victory": return { eyebrow: "ENCOUNTER COMPLETE", title: "The Sentinel Falls", art: "victory", body: "The ancient armor collapses. Beneath the ash, a silver key gleams beside a fragment of a royal banner. Your signet cools for the first time since you entered.", quote: "Somewhere deeper in the dungeon, a second gate begins to open." };
    }
  }, [game.scene, game.round]);

  const reset = () => { setGame({ ...initialState, log: [...initialState.log] }); setParty(initialParty); };
  const alive = game.hp > 0;

  return (
    <div className="app-shell">
      <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">✦</span><span>DUNGEON<span className="brand-muted">CRAWL</span><small> A LOST HEIR CAMPAIGN</small></span></a><div className="top-actions"><span className="online-dot"/> <span className="prototype-label">SINGLE-PLAYER PROTOTYPE</span><button className="ghost-button" onClick={reset} title="Start a new campaign">↻ <span>New game</span></button></div></header>
      <main className="layout">
        <aside className="sidebar">
          <div className="section-kicker">YOUR HERO</div>
          <div className="hero-card"><div className="hero-avatar">⚔</div><div><h2>Eleni</h2><p>The Lost Heir · Warrior</p><span className="level-pill">LEVEL 1</span></div></div>
          <div className="stat-line"><span>❤️ Health</span><strong>{game.hp} <i>/ {game.maxHp}</i></strong></div><div className="meter"><span className={game.hp < 9 ? "low" : ""} style={{ width: `${game.hp / game.maxHp * 100}%` }}/></div>
          <div className="stat-line"><span>✦ Experience</span><strong>{game.xp} <i>/ 100 XP</i></strong></div><div className="meter xp"><span style={{ width: `${Math.min(100, game.xp)}%` }}/></div>
          <div className="stat-grid">{[["STR","16","+3"],["DEX","12","+1"],["CON","15","+2"],["INT","10","+0"],["WIS","13","+1"],["CHA","14","+2"]].map(s => <div className="stat-tile" key={s[0]}><small>{s[0]}</small><strong>{s[1]}</strong><span>{s[2]}</span></div>)}</div>
          <div className="side-divider"/><div className="section-kicker">EQUIPMENT</div><div className="equipment"><span>⚔</span><div><strong>Ancestral Longsword</strong><small>1d8 + 3 damage</small></div></div><div className="equipment"><span>🛡</span><div><strong>Reinforced Armor</strong><small>Armor Class 16</small></div></div><div className="equipment"><span>🧪</span><div><strong>Healing Potions <b>×{game.potions}</b></strong><small>Restore 2d4 + 2 HP</small></div></div>
          <div className="side-divider"/><div className="section-kicker">PARTY COMPANIONS</div>{party.map(p => <div className="companion" key={p.name}><div className="companion-icon">{p.icon}</div><div className="companion-info"><strong>{p.name}</strong><small>{p.role}</small><div className="mini-meter"><span style={{ width: `${p.hp / p.maxHp * 100}%` }}/></div></div><b>{p.hp}<i>/{p.maxHp}</i></b></div>)}
          <div className="party-note">AI companions are simulated in this prototype. Networked player turns are planned for Phase 2.</div>
        </aside>
        <section className="main-column">
          <div className={`scene-art ${sceneContent.art}`}><div className="art-grain"/><div className="scene-badge"><span/> {sceneContent.eyebrow}</div><div className="art-title"><span>THE CHRONICLES OF</span><h1>THE LOST HEIR</h1><p>What was buried was never forgotten.</p></div><div className="art-rune">ᚷ</div></div>
          <article className="story-panel"><div className="chapter-label"><span>✦</span> {sceneContent.eyebrow}</div><h2>{sceneContent.title}</h2><p>{sceneContent.body}</p><blockquote>{sceneContent.quote}</blockquote>
            {game.scene === "combat" ? <div className="combat-panel"><div className="enemy-heading"><span>☠</span><div><strong>Crownbound Sentinel</strong><small>Undead construct · AC 12</small></div><b>{game.enemyHp} / {game.enemyMaxHp} HP</b></div><div className="meter enemy-meter"><span style={{ width: `${game.enemyHp / game.enemyMaxHp * 100}%` }}/></div><div className="combat-actions"><button className="primary-button" onClick={attack} disabled={!alive || game.enemyHp <= 0}>⚔ Attack with longsword</button><button className="secondary-button" onClick={usePotion} disabled={game.potions <= 0 || game.hp === game.maxHp}>🧪 Drink potion ({game.potions})</button></div>{!alive && <button className="primary-button" onClick={() => { setGame(g => ({ ...g, hp: 12, scene: "gate", enemyHp: g.enemyMaxHp, log: [...g.log, { text: "The party drags you to safety. You recover with 12 HP; the encounter resets.", kind: "good" }] })); }}>Recover and retreat</button>}</div> : null}
            {game.scene === "gate" && <div className="choices"><div className="choices-heading">WHAT WILL YOU DO? <span>CHOOSE YOUR PATH</span></div>
              {choose("gate","Inspect the royal contract","Study the pedestal and faceless statues before committing.",() => { const success = check("Royal history", 1, 12); setGame(g => ({ ...g, scene: "contract", xp: g.xp + (success ? 10 : 0) })); })}
              {choose("gate","Approach the blood-sealed door","Answer the voice calling you Majesty.",() => { setGame(g => ({ ...g, scene: "blood-door" })); addLog([{ text: "You approach the blood-sealed door. Something pounds from within.", kind: "danger" }]); })}
              {choose("gate","Investigate the whispering well","Find the source of the warning about Brom.",() => { setGame(g => ({ ...g, scene: "well" })); addLog([{ text: "The well repeats your voice in the dark.", kind: "danger" }]); })}
              {choose("gate","Search the forgotten armory","Look for supplies and clues among the abandoned weapons.",() => { setGame(g => ({ ...g, scene: "armory" })); addLog([{ text: "You enter the forgotten armory. Something stirs among the weapons." }]); })}
            </div>}
            {game.scene === "contract" && <div className="choices"><div className="choices-heading">THE CONTRACT <span>YOUR BLOODLINE</span></div>
              {choose("contract","Place the signet in the pedestal","Test whether the relic recognizes its heir.",() => { const success = check("Heir's Instinct", 3, 13); setGame(g => ({ ...g, scene: success ? "victory" : "combat", xp: g.xp + (success ? 15 : 0), log: [...g.log, { text: success ? "The signet unlocks a hidden cache: +15 XP and a silver key." : "The pedestal rejects the signet. A sentinel awakens!", kind: success ? "good" : "danger" }] })); if (!success) startCombat(); })}
              {choose("contract","Return to the chamber","Keep exploring before risking the contract.",() => setGame(g => ({ ...g, scene: "gate" })))}
            </div>}
            {game.scene === "blood-door" && <div className="choices"><div className="choices-heading">THE SEALED DOOR <span>MAKE A CHOICE</span></div>
              {choose("blood-door","Touch the seal with your signet","Use your lineage to open the door.",() => { const success = check("Royal bloodline", 3, 13); if (success) { setGame(g => ({ ...g, scene: "armory", xp: g.xp + 15, inventory: [...g.inventory, "Blood-forged key"], log: [...g.log, { text: "The seal breaks. You find a blood-forged key behind the door. +15 XP.", kind: "good" }] })); } else startCombat(); })}
              {choose("blood-door","Break the seal by force","Test your strength against ancient magic.",() => { const success = check("Strength", 3, 14); if (success) { setGame(g => ({ ...g, scene: "armory", hp: Math.max(1, g.hp - 3), inventory: [...g.inventory, "Blood-forged key"], log: [...g.log, { text: "The seal shatters. The recoil costs you 3 HP, but you claim a key.", kind: "good" }] })); } else startCombat(); })}
              {choose("blood-door","Retreat to the chamber","Keep the mystery unresolved for now.",() => setGame(g => ({ ...g, scene: "gate" })))}
            </div>}
            {game.scene === "well" && <div className="choices"><div className="choices-heading">THE WHISPERING WELL <span>SEEK THE TRUTH</span></div>
              {choose("well","Ask Mira to examine the magic","Let the mage test the well's enchantment.",() => { const success = check("Arcana", 2, 12); setGame(g => ({ ...g, scene: "gate", xp: g.xp + (success ? 10 : 0), log: [...g.log, { text: success ? "Mira identifies a memory echo, not proof of betrayal. +10 XP." : "The magic resists Mira's spell. The warning remains unexplained.", kind: success ? "good" : "danger" }] })); })}
              {choose("well","Look into the water","Face the voice yourself.",() => { const success = check("Wisdom", 1, 13); setGame(g => ({ ...g, scene: success ? "contract" : "gate", hp: Math.max(1, g.hp - (success ? 0 : 2)), xp: g.xp + (success ? 10 : 0), log: [...g.log, { text: success ? "A forgotten royal memory surfaces. +10 XP." : "A cold hand brushes your mind. You lose 2 HP.", kind: success ? "good" : "danger" }] })); })}
              {choose("well","Return to the central chamber","Keep your distance from the well.",() => setGame(g => ({ ...g, scene: "gate" })))}
            </div>}
            {game.scene === "armory" && <div className="choices"><div className="choices-heading">THE FORGOTTEN ARMORY <span>SEARCH THE RUINS</span></div>
              {choose("armory","Search behind the fallen statue","Recover whatever the golden light is guarding.",() => { const success = check("Investigation", 1, 12); setGame(g => ({ ...g, scene: success ? "victory" : "combat", xp: g.xp + (success ? 15 : 0), gold: g.gold + (success ? 10 : 0), inventory: success ? [...g.inventory, "Royal ward charm"] : g.inventory, log: [...g.log, { text: success ? "You find a Royal Ward Charm and 10 gold. +15 XP." : "The statue collapses. A Crownbound Sentinel rises from the debris.", kind: success ? "good" : "danger" }] })); if (!success) startCombat(); })}
              {choose("armory","Take a torch and study the tracks","Look for clues before touching anything.",() => { const success = check("Perception", 1, 11); setGame(g => ({ ...g, scene: "gate", xp: g.xp + (success ? 5 : 0), log: [...g.log, { text: success ? "The tracks belong to a heavy armored construct. +5 XP." : "The tracks disappear beneath a sheet of dust.", kind: success ? "good" : "danger" }] })); })}
              {choose("armory","Return to the central chamber","Leave the weapons undisturbed.",() => setGame(g => ({ ...g, scene: "gate" })))}
            </div>}
            {game.scene === "victory" && <div className="victory-reward"><div className="reward-icon">♛</div><div><strong>Reward secured</strong><p>+50 XP · +15 gold · The next gate is stirring.</p></div><button className="primary-button" onClick={() => { setGame(g => ({ ...g, scene: "gate", enemyHp: g.enemyMaxHp, log: [...g.log, { text: "You return to the central chamber, stronger and carrying new clues.", kind: "good" }] })); }}>Continue expedition →</button></div>}
          </article>
          <section className="journal-panel"><div className="journal-head"><div><span className="section-kicker">CAMPAIGN RECORD</span><h3>Adventure log</h3></div><div className="tabs"><button className={tab === "journal" ? "active" : ""} onClick={() => setTab("journal")}>Journal</button><button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}>Inventory</button></div></div>
            {tab === "journal" ? <div className="log-list">{game.log.slice().reverse().map((entry, i) => <div className={`log-entry ${entry.kind ?? ""}`} key={i}><span className="log-marker">{entry.kind === "danger" ? "!" : entry.kind === "good" ? "✦" : "·"}</span><p>{entry.text}</p></div>)}</div> : <div className="inventory-list">{game.inventory.map((item, i) => <span key={item + i}>✦ {item}</span>)}<span>🧪 Healing potions ×{game.potions}</span><span>◈ Gold: {game.gold} gp</span></div>}
          </section>
        </section>
        <aside className="rightbar"><div className="right-card"><div className="section-kicker">QUEST LOG</div><div className="quest-main"><span className="quest-icon">♜</span><div><strong>The Gate That Breathes</strong><small>Chapter I · Main quest</small></div></div><p>Discover why the ancient gate recognizes your bloodline.</p><div className="quest-status"><span className="status-dot"/> In progress</div><div className="side-divider"/><div className="section-kicker">OBJECTIVES</div><div className="objective"><span className={game.explored.length ? "objective-check done" : "objective-check"}/><span>Explore the entry chamber</span></div><div className="objective"><span className={game.explored.includes("Inspect the royal contract") ? "objective-check done" : "objective-check"}/><span>Investigate the royal contract</span></div><div className="objective"><span className={game.explored.length >= 2 ? "objective-check done" : "objective-check"}/><span>Find a way deeper</span></div><div className="side-divider"/><div className="section-kicker">CAMPAIGN DETAILS</div><div className="detail-row"><span>Difficulty</span><strong>Balanced</strong></div><div className="detail-row"><span>Party</span><strong>4 adventurers</strong></div><div className="detail-row"><span>Gold</span><strong>◈ {game.gold} gp</strong></div><div className="detail-row"><span>Session</span><strong>Auto-saved</strong></div></div><div className="rules-card"><span>✧</span><strong>Every choice matters.</strong><p>Skill checks use a d20 plus your relevant bonus. Your campaign saves automatically in this browser.</p></div><div className="footer-note">BUILT FOR ADVENTURERS<br/>PROTOTYPE v0.1.0</div></aside>
      </main>
    </div>
  );
}