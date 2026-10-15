import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getHeroAbilityModifier } from "../game/rules";
import { getSceneNarrative, scenarioTitles } from "../game/narrative";
import { availableExplorationActions, explorationActions, sceneTitles } from "../game/multiplayerExploration";
import type { Hero, HeroAncestry, HeroBackground, HeroClass, HeroGender, ScenarioId } from "../game/types";
import type { Ack, CampaignSnapshot, ClientToServerEvents, CombatActionId, ExplorationActionId, Identity, ServerToClientEvents } from "./protocol";

const SESSION_KEY = "dungeon-crawl-multiplayer-session-v1";
const SERVER_URL = import.meta.env.VITE_MULTIPLAYER_URL ?? "http://localhost:3001";
const scenarios: { id: ScenarioId; title: string }[] = [
  { id: "lost-heir", title: scenarioTitles["lost-heir"].multiplayer },
  { id: "plague-below", title: scenarioTitles["plague-below"].multiplayer },
  { id: "dragon-hoard", title: scenarioTitles["dragon-hoard"].multiplayer },
];
const blankHero: Hero = { name: "", gender: "female", className: "Warrior", ancestry: "Human", background: "Noble", difficulty: "Balanced" };
const multiplayerDiscoveryNarrative: Record<ScenarioId, { eyebrow: string; title: string; body: string; quote: string }> = {
  "lost-heir": { eyebrow: "DISCOVERY SECURED", title: "A Door Stirs Below", body: "The party has secured this discovery and can return to the central chamber with what it learned.", quote: "The next gate is stirring." },
  "plague-below": { eyebrow: "DISCOVERY SECURED", title: "The Bells Below", body: "The party has secured this discovery and can return to the mine entrance with what it learned.", quote: "The quarantine bells ring below." },
  "dragon-hoard": { eyebrow: "DISCOVERY SECURED", title: "The Name in the Hoard", body: "The party has secured this discovery and can return to the cavern with what it learned.", quote: "Something vast stirs above the hoard." },
};
type Session = { inviteCode: string; resumeToken: string };
type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function savedSession(): Session | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const session = value as Record<string, unknown>;
    return typeof session.inviteCode === "string" && typeof session.resumeToken === "string"
      ? { inviteCode: session.inviteCode, resumeToken: session.resumeToken }
      : null;
  } catch { return null; }
}

export default function MultiplayerLobby({ onClose }: { onClose: () => void }) {
  const [hero, setHero] = useState<Hero>(blankHero);
  const [scenarioId, setScenarioId] = useState<ScenarioId>("lost-heir");
  const [inviteCode, setInviteCode] = useState("");
  const [snapshot, setSnapshot] = useState<CampaignSnapshot | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState("Connecting to multiplayer server…");
  const sessionRef = useRef(savedSession());
  const [socket, setSocket] = useState<GameSocket | null>(null);

  useEffect(() => {
    const client = io(SERVER_URL, { autoConnect: true, reconnection: true, timeout: 5000 });
    setSocket(client);
    const onConnect = () => {
      setConnection("Connected");
      const session = sessionRef.current;
      if (session) {
        setBusy(true);
        client.emit("campaign:resume", session, (result: Ack<Identity>) => {
          setBusy(false);
          if (result.ok) {
            setPlayerId(result.playerId);
            setInviteCode(result.snapshot.inviteCode);
            setSnapshot(result.snapshot);
            setMessage("Reconnected to your campaign.");
          } else {
            sessionStorage.removeItem(SESSION_KEY);
            sessionRef.current = null;
            setMessage(result.error.message);
          }
        });
      }
    };
    const onDisconnect = () => setConnection("Disconnected — reconnecting…");
    const onConnectError = () => setConnection("Multiplayer server unavailable");
    client.on("connect", onConnect);
    client.on("disconnect", onDisconnect);
    client.on("connect_error", onConnectError);
    client.on("campaign:snapshot", next => setSnapshot(current => !current || next.revision >= current.revision ? next : current));
    return () => { client.removeAllListeners(); client.disconnect(); };
  }, []);

  const beginRequest = () => {
    if (!socket?.connected) { setMessage("Wait for the multiplayer server connection, then try again."); return false; }
    if (!hero.name.trim()) { setMessage("Enter a character name first."); return false; }
    setBusy(true);
    setMessage("");
    return true;
  };
  const acceptIdentity = (result: Ack<Identity>) => {
    setBusy(false);
    if (!result.ok) { setMessage(result.error.message); return; }
    setPlayerId(result.playerId);
    setInviteCode(result.snapshot.inviteCode);
    setSnapshot(result.snapshot);
    const nextSession = { inviteCode: result.snapshot.inviteCode, resumeToken: result.resumeToken } satisfies Session;
    sessionRef.current = nextSession;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
  };
  const createCampaign = () => {
    if (!beginRequest()) return;
    socket!.emit("campaign:create", { scenarioId, character: { ...hero, name: hero.name.trim() } }, acceptIdentity);
  };
  const joinCampaign = () => {
    if (!beginRequest()) return;
    socket!.emit("campaign:join", { inviteCode: inviteCode.trim().toUpperCase(), character: { ...hero, name: hero.name.trim() } }, acceptIdentity);
  };
  const submitAction = (action: ExplorationActionId) => {
    if (!snapshot || !playerId || !socket || busy) return;
    setBusy(true);
    setMessage("");
    socket.emit("campaign:act", {
      campaignId: snapshot.campaignId,
      commandId: crypto.randomUUID(),
      expectedRevision: snapshot.revision,
      action,
    }, (result: Ack<{ snapshot: CampaignSnapshot }>) => {
      setBusy(false);
      if (!result.ok) { setMessage(result.error.message); return; }
      setSnapshot(current => !current || result.snapshot.revision >= current.revision ? result.snapshot : current);
    });
  };
  const submitCombatAction = (action: CombatActionId) => {
    if (!snapshot || !playerId || !socket || busy) return;
    setBusy(true);
    setMessage("");
    socket.emit("campaign:combat:act", {
      campaignId: snapshot.campaignId,
      commandId: crypto.randomUUID(),
      expectedRevision: snapshot.revision,
      action,
    }, (result: Ack<{ snapshot: CampaignSnapshot }>) => {
      setBusy(false);
      if (!result.ok) { setMessage(result.error.message); return; }
      setSnapshot(current => !current || result.snapshot.revision >= current.revision ? result.snapshot : current);
    });
  };
  const retreat = () => {
    if (!snapshot || !socket || busy) return;
    setBusy(true);
    setMessage("");
    socket.emit("campaign:combat:retreat", {
      campaignId: snapshot.campaignId,
      commandId: crypto.randomUUID(),
      expectedRevision: snapshot.revision,
    }, (result: Ack<{ snapshot: CampaignSnapshot }>) => {
      setBusy(false);
      if (!result.ok) { setMessage(result.error.message); return; }
      setSnapshot(current => !current || result.snapshot.revision >= current.revision ? result.snapshot : current);
    });
  };
  const leaveView = () => {
    if (snapshot && socket?.connected) socket.emit("campaign:leave", { campaignId: snapshot.campaignId }, () => undefined);
    setSnapshot(null);
    setPlayerId(null);
    sessionRef.current = null;
    sessionStorage.removeItem(SESSION_KEY);
    setMessage("You left the campaign. Reopen Play online to start or join another one.");
  };
  const myTurn = snapshot?.turnOwnerId === playerId;
  const currentPlayer = snapshot?.players.find(player => player.playerId === playerId);
  const turnOwner = snapshot?.players.find(player => player.playerId === snapshot.turnOwnerId);
  const actionIds = snapshot ? availableExplorationActions(snapshot.scenarioId, snapshot.scene, snapshot.explorationProgress.discoveries) : [];

  const activeScene = snapshot ? snapshot.scene === "victory" ? multiplayerDiscoveryNarrative[snapshot.scenarioId] : getSceneNarrative(snapshot.scenarioId, snapshot.scene, "multiplayer") : null;

  return <div className="scenario-overlay multiplayer-overlay" role="dialog" aria-modal="true" aria-labelledby="multiplayer-title">
    <section className={`scenario-modal multiplayer-modal${snapshot ? " multiplayer-modal-in-campaign" : ""}`}>
      {!snapshot ? <>
        <header className="multiplayer-lobby-heading">
          <div className="section-kicker">ONLINE ADVENTURE · POSTGRESQL-BACKED</div>
          <h2 id="multiplayer-title">Gather your party</h2>
          <p className="scenario-lead">Create a campaign and share its invite code, or join another party. Your hero’s resources belong to you; the server keeps the shared adventure authoritative and persistent.</p>
          <div className="multiplayer-connection-pill"><i className={connection === "Connected" ? "is-connected" : ""} />{connection}</div>
        </header>
        {sessionRef.current && <button className="secondary-button multiplayer-resume" disabled={busy || !socket?.connected} onClick={() => {
          if (!socket?.connected) return;
          setBusy(true);
          socket.emit("campaign:resume", sessionRef.current!, acceptIdentity);
        }}>↻ &nbsp;Resume campaign <strong>{sessionRef.current.inviteCode}</strong></button>}
        <div className="multiplayer-forms">
          <div className="multiplayer-form-card"><span className="multiplayer-form-symbol">✦</span><h3>Create a campaign</h3>
            <label>Scenario<select value={scenarioId} onChange={event => setScenarioId(event.target.value as ScenarioId)}>{scenarios.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <CharacterFields hero={hero} setHero={setHero} />
            <button className="primary-button" disabled={busy || !socket?.connected} onClick={createCampaign}>Create invite code</button>
          </div>
          <div className="multiplayer-form-card"><span className="multiplayer-form-symbol">⌘</span><h3>Join a campaign</h3>
            <label>Invite code<input value={inviteCode} onChange={event => setInviteCode(event.target.value.toUpperCase().slice(0, 8))} maxLength={8} autoCapitalize="characters" placeholder="8-character code" /></label>
            <CharacterFields hero={hero} setHero={setHero} />
            <button className="primary-button" disabled={busy || !socket?.connected || inviteCode.trim().length !== 8} onClick={joinCampaign}>Join campaign</button>
          </div>
        </div>
      </> : <>
        <header className="multiplayer-adventure-header">
          <div className="multiplayer-brand-lockup"><span className="multiplayer-brand-mark">✦</span><div><div className="section-kicker">DUNGEON CRAWL · PARTY ADVENTURE</div><h2 id="multiplayer-title">{scenarios.find(item => item.id === snapshot.scenarioId)?.title}</h2></div></div>
          <div className="multiplayer-campaign-meta"><span className="multiplayer-live"><i className={connection === "Connected" ? "is-connected" : ""} />{connection}</span><span>INVITE <b>{snapshot.inviteCode}</b></span><span>REV. <b>{snapshot.revision}</b></span><span className="multiplayer-phase-tag">{snapshot.phase}</span></div>
        </header>
        <div className="multiplayer-adventure-grid">
          <main className="multiplayer-adventure-main">
            {activeScene && <section className={`multiplayer-scene-panel scene-${snapshot.scene}`} aria-labelledby="multiplayer-scene-title">
              <div className={`multiplayer-scene-art scene-art ${snapshot.scene === "blood-door" ? "blood" : snapshot.scene === "well" ? "well" : snapshot.scene === "armory" ? "armory" : snapshot.scene === "contract" ? "contract" : snapshot.phase === "combat" ? "combat" : snapshot.scene === "victory" ? "victory" : ""}`} aria-hidden="true"><span className="multiplayer-art-rune">{snapshot.phase === "combat" ? "⚔" : snapshot.scenarioId === "plague-below" ? "☣" : snapshot.scenarioId === "dragon-hoard" ? "ᛟ" : "♜"}</span><div className="art-grain"/><div className="scene-badge"><span/>{activeScene.eyebrow}</div><div className="art-title"><span>{scenarios.find(item => item.id === snapshot.scenarioId)?.title.toUpperCase()}</span><h1 id="multiplayer-scene-title">{activeScene.title}</h1><p>{sceneTitles[snapshot.scenarioId][snapshot.scene]}</p></div></div>
              <div className="multiplayer-story-panel"><div className="chapter-label"><span>✦</span> {activeScene.eyebrow}</div><p>{activeScene.body}</p><blockquote>{activeScene.quote}</blockquote></div>
            </section>}
            {snapshot.combat && (snapshot.phase === "combat" || snapshot.combat.status !== "active") && <section className={`multiplayer-combat multiplayer-combat-featured${snapshot.combat.status === "victory" ? " is-complete" : ""}`} aria-label={`${snapshot.combat.enemy.name} encounter`}>
              <div className="multiplayer-combat-heading"><div><span className="section-kicker">ENCOUNTER · ROUND {snapshot.combat.round}</span><h3>{snapshot.combat.enemy.name}</h3><small>{snapshot.combat.status === "active" ? "The Sentinel holds the line." : snapshot.combat.status === "victory" ? "Victory · encounter complete" : snapshot.combat.recovered ? "Retreated and recovered" : "Party defeated"}</small></div><strong>{snapshot.combat.enemy.hp} / {snapshot.combat.enemy.maxHp} HP <span>·</span> AC {snapshot.combat.enemy.ac}</strong></div>
              <div className="multiplayer-combat-meter" role="meter" aria-label="Sentinel hit points" aria-valuemin={0} aria-valuemax={snapshot.combat.enemy.maxHp} aria-valuenow={snapshot.combat.enemy.hp}><span style={{ width: `${Math.max(0, snapshot.combat.enemy.hp / snapshot.combat.enemy.maxHp * 100)}%` }} /></div>
              <div className="multiplayer-initiative"><strong>Initiative</strong>{snapshot.combat.initiative.map((combatant, index) => <span className={index === snapshot.combat?.initiativeIndex && snapshot.combat.status === "active" ? "active" : ""} key={combatant.kind === "player" ? combatant.playerId : combatant.id}>{combatant.name} · {combatant.total}{index === snapshot.combat?.initiativeIndex && snapshot.combat.status === "active" ? " · acting" : ""}</span>)}</div>
              {snapshot.combat.status === "active" ? <div className="multiplayer-combat-actions">
                <button className="primary-button" disabled={!myTurn || busy || !socket?.connected || !currentPlayer || currentPlayer.resources.hp <= 0} onClick={() => submitCombatAction("attack")}>⚔ Attack the Sentinel</button>
                <button className="secondary-button" disabled={!myTurn || busy || !socket?.connected || !currentPlayer || currentPlayer.resources.potions <= 0 || currentPlayer.resources.hp >= currentPlayer.resources.maxHp} onClick={() => submitCombatAction("potion")}>🧪 Drink potion · {currentPlayer?.resources.potions ?? 0}</button>
                {myTurn && currentPlayer && currentPlayer.resources.potions <= 0 && <small>No potions remain.</small>}
                {myTurn && currentPlayer && currentPlayer.resources.hp >= currentPlayer.resources.maxHp && <small>You are at maximum HP; potions are unavailable.</small>}
                {!myTurn && <small>Waiting for {turnOwner?.name ?? "a connected hero"} to finish their turn.</small>}
              </div> : <div className={`multiplayer-combat-result ${snapshot.combat.status}`}>
                <strong>{snapshot.combat.status === "victory" ? `${snapshot.combat.enemy.name} defeated` : snapshot.combat.recovered ? "The party retreated and recovered." : "The party is defeated."}</strong>
                {snapshot.combat.status === "victory" && <p>{snapshot.combat.history.find(entry => entry.action === "victory")?.text ?? "The encounter is complete. See combat history for its recorded outcome."}</p>}
                {snapshot.combat.status === "defeat" && !snapshot.combat.recovered && <button className="primary-button" disabled={busy || !socket?.connected} onClick={retreat}>Retreat and recover</button>}
              </div>}
              <details className="multiplayer-history-details"><summary>Combat history <span>{snapshot.combat.history.length} events</span></summary><ol className="multiplayer-combat-history">{snapshot.combat.history.map(entry => <li key={entry.id}>{entry.text}</li>)}</ol></details>
            </section>}
            {snapshot.phase === "exploration" && <section className="multiplayer-action-list" aria-label="Available exploration actions"><div className="multiplayer-section-heading"><div><span className="section-kicker">YOUR NEXT MOVE</span><h3>Choose an approach</h3></div><span>{myTurn ? "YOUR TURN" : `WAITING · ${turnOwner?.name ?? "PARTY MEMBER"}`}</span></div>
              {actionIds.length ? actionIds.map(id => {
                const action = explorationActions[id];
                const check = action.check?.[snapshot.scenarioId];
                const modifier = check && currentPlayer ? getHeroAbilityModifier(currentPlayer.hero, check.ability) : null;
                return <article className="multiplayer-action" key={id}><div className="multiplayer-action-emblem">{check ? "ᛟ" : "✦"}</div><div className="multiplayer-action-copy"><strong>{action.title[snapshot.scenarioId]}</strong><p>{action.description[snapshot.scenarioId]}</p>{check && <small>Server rolls d20 + your {check.ability} modifier ({modifier !== null && modifier >= 0 ? "+" : ""}{modifier ?? "—"}) against DC {check.dc} · {check.label}</small>}</div><button className="primary-button" disabled={!myTurn || busy || !socket?.connected || snapshot.phase !== "exploration"} onClick={() => submitAction(id)}>{busy ? "Resolving…" : myTurn ? "Choose" : "Await turn"}</button></article>;
              }) : <p className="multiplayer-empty-actions">No actions are available in this scene.</p>}
              {!myTurn && <p className="multiplayer-turn-explainer" role="status">{turnOwner?.name ?? "Another party member"} has the turn. The server will enable your actions when the turn passes to you.</p>}
            </section>}
            {snapshot.phase === "exploration" && <div className="multiplayer-progress"><strong>Exploration trail</strong><span>Visited: {snapshot.explorationProgress.visitedScenes.map(scene => sceneTitles[snapshot.scenarioId][scene]).join(" · ")}</span><span>Discoveries: {snapshot.explorationProgress.discoveries.length || "None yet"}</span></div>}
          </main>
          <aside className="multiplayer-party-rail" aria-label="Party and character status">
            <section className="multiplayer-party-panel"><div className="multiplayer-section-heading"><div><span className="section-kicker">THE FELLOWSHIP</span><h3>Party roster</h3></div><span>{snapshot.players.length} / 4</span></div>
              <div className="multiplayer-roster">{snapshot.players.map(player => <article className={`multiplayer-player${player.playerId === snapshot.turnOwnerId ? " is-turn-owner" : ""}${player.playerId === playerId ? " is-self" : ""}`} key={player.playerId}>
                <HeroPortrait hero={player.hero} />
                <div className="multiplayer-player-identity"><strong>{player.name}{player.playerId === playerId ? " · you" : ""}</strong><span>{player.hero.ancestry} {player.hero.className}</span><small><i className={player.connected ? "is-connected" : ""}/>{player.connected ? "Connected" : "Disconnected"}</small></div>
                <div className="multiplayer-player-stats"><div className="multiplayer-hp-line"><span>HP</span><b>{player.resources.hp}<i> / {player.resources.maxHp}</i></b></div><div className="multiplayer-mini-meter"><span style={{width:`${Math.max(0, Math.min(100, player.resources.hp / Math.max(1, player.resources.maxHp) * 100))}%`}}/></div><small>{player.resources.xp} XP <i>·</i> {player.resources.gold} gp</small></div>
                {player.playerId === snapshot.turnOwnerId && <span className="multiplayer-turn-ribbon">✦ TURN</span>}
              </article>)}</div>
            </section>
            {currentPlayer && <section className="multiplayer-personal-panel"><div className="section-kicker">YOUR CHARACTER</div><h3>{currentPlayer.name}</h3><div className="multiplayer-personal-stats"><span><b>{currentPlayer.resources.hp}</b><i>/ {currentPlayer.resources.maxHp} HP</i></span><span><b>{currentPlayer.resources.xp}</b><i>XP</i></span><span><b>{currentPlayer.resources.gold}</b><i>GOLD</i></span></div><div className="multiplayer-inventory-heading">Equipment & inventory <span>{currentPlayer.resources.potions} potions</span></div><div className="multiplayer-inventory">{currentPlayer.resources.inventory.length ? currentPlayer.resources.inventory.map((item,index)=><span key={`${item}-${index}`}>{item}</span>) : <small>No carried items.</small>}</div></section>}
            <section className="multiplayer-turn-card" role="status"><span className="section-kicker">TURN ORDER</span><strong>{myTurn ? "Your turn" : `${turnOwner?.name ?? "Party member"} acts now`}</strong><p>{snapshot.phase === "combat" ? myTurn ? "Choose an attack or use a potion." : "Combat actions unlock when your turn arrives." : myTurn ? "Choose one exploration action." : "The server advances turns after each accepted action."}</p></section>
          </aside>
          <section className="multiplayer-journal-panel" aria-label="Shared adventure journal"><div className="multiplayer-section-heading"><div><span className="section-kicker">CHRONICLE · SHARED WITH THE PARTY</span><h3>Adventure journal</h3></div><span>Latest events first in the tale</span></div><ol className="multiplayer-log">{snapshot.sharedLog.slice(-12).reverse().map(entry => <li key={entry.id} className={entry.kind}><span className="multiplayer-log-mark">{entry.kind === "good" ? "✦" : entry.kind === "danger" ? "⚠" : "ᛟ"}</span><div>{entry.text}{entry.check && <small>Check: {entry.check.label} · d20 {entry.check.die} + {entry.check.modifier} = {entry.check.total} vs DC {entry.check.dc} · {entry.check.success ? "Success" : "Failure"}</small>}</div></li>)}</ol></section>
        </div>
        <footer className="multiplayer-footer"><span>Campaign state is saved by the server · revision {snapshot.revision}</span><div><button className="secondary-button" onClick={leaveView}>Leave campaign</button><button className="secondary-button" onClick={onClose}>Return to menu</button></div></footer>
      </>}
      <div className="multiplayer-status" aria-live="polite">{message || (!snapshot ? connection : "")}</div>
      {!snapshot && <div className="character-actions"><button className="secondary-button" onClick={onClose}>Back to main menu</button></div>}
    </section>
  </div>;
}

function HeroPortrait({ hero }: { hero: Hero }) {
  const [failed, setFailed] = useState(false);
  const filename = `${hero.className.toLowerCase()}-${hero.gender}-${hero.ancestry.toLowerCase().replace(/ /g, "-")}-full.webp`;
  return <div className="multiplayer-portrait-frame" aria-label={`${hero.name}, ${hero.ancestry} ${hero.className}`}>
    {failed ? <span aria-hidden="true">{hero.name.slice(0, 1).toUpperCase()}</span> : <img src={`/images/characters/${filename}`} alt={`${hero.gender} ${hero.ancestry} ${hero.className}`} onError={() => setFailed(true)} />}
  </div>;
}

function CharacterFields({ hero, setHero }: { hero: Hero; setHero: (update: (current: Hero) => Hero) => void }) {
  return <>
    <label>Character name<input maxLength={24} value={hero.name} onChange={event => setHero(current => ({ ...current, name: event.target.value }))} placeholder="Your character name" /></label>
    <div className="multiplayer-field-row">
      <label>Gender<select value={hero.gender} onChange={event => setHero(current => ({ ...current, gender: event.target.value as HeroGender }))}><option value="female">Female</option><option value="male">Male</option></select></label>
      <label>Class<select value={hero.className} onChange={event => setHero(current => ({ ...current, className: event.target.value as HeroClass }))}>{["Warrior", "Ranger", "Mage", "Rogue", "Paladin"].map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <div className="multiplayer-field-row">
      <label>Ancestry<select value={hero.ancestry} onChange={event => setHero(current => ({ ...current, ancestry: event.target.value as HeroAncestry }))}>{["Human", "Elf", "Dwarf", "Half-Orc"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Background<select value={hero.background} onChange={event => setHero(current => ({ ...current, background: event.target.value as HeroBackground }))}>{["Noble", "Outlander", "Scholar", "Mercenary"].map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <label>Difficulty<select value={hero.difficulty} onChange={event => setHero(current => ({ ...current, difficulty: event.target.value as Hero["difficulty"] }))}><option>Story</option><option>Balanced</option><option>Hard</option></select></label>
  </>;
}
