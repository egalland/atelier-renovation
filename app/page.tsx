"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type ItemKind =
  | "base"
  | "column"
  | "shelf"
  | "table"
  | "fridge"
  | "oven"
  | "hob"
  | "sink"
  | "dishwasher"
  | "hood"
  | "outlet"
  | "light"
  | "source-electric"
  | "source-cold"
  | "source-hot";

type PanelTab = "element" | "catalog" | "networks" | "saves";
type NetworkKind = "electric" | "cold" | "hot";

type PlanItem = {
  id: string;
  kind: ItemKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type NetworkVisibility = Record<NetworkKind, boolean>;

type SavedConfiguration = {
  id: string;
  name: string;
  updatedAt: string;
  items: PlanItem[];
  networks: NetworkVisibility;
};

type ItemSpec = {
  label: string;
  short: string;
  group: "Meubles" | "Équipements" | "Réseaux";
  defaultW: number;
  defaultH: number;
  color: string;
  electric?: { protection: string; section: string };
  water?: { cold?: boolean; hot?: boolean; drain?: boolean };
  source?: NetworkKind;
};

type Gesture = {
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originW: number;
  originH: number;
};

const ROOM_W = 530;
const ROOM_H = 500;
const DRAFT_KEY = "emmanuel-kitchen-editor-draft-v2";
const SAVES_KEY = "emmanuel-kitchen-editor-saves-v2";

const specs: Record<ItemKind, ItemSpec> = {
  base: { label: "Meuble bas", short: "Meuble", group: "Meubles", defaultW: 60, defaultH: 60, color: "#c8744f" },
  column: { label: "Colonne de rangement", short: "Colonne", group: "Meubles", defaultW: 60, defaultH: 60, color: "#28433f" },
  shelf: { label: "Meuble coulissant", short: "Étagère", group: "Meubles", defaultW: 180, defaultH: 60, color: "#87907d" },
  table: { label: "Table / îlot libre", short: "Table", group: "Meubles", defaultW: 140, defaultH: 80, color: "#dfa95a" },
  fridge: { label: "Réfrigérateur", short: "Frigo", group: "Équipements", defaultW: 60, defaultH: 60, color: "#345c56", electric: { protection: "16 A dédié conseillé", section: "2,5 mm²" } },
  oven: { label: "Four", short: "Four", group: "Équipements", defaultW: 60, defaultH: 60, color: "#345c56", electric: { protection: "20 A", section: "2,5 mm²" } },
  hob: { label: "Plaque de cuisson", short: "Plaque", group: "Équipements", defaultW: 60, defaultH: 60, color: "#36504d", electric: { protection: "32 A", section: "6 mm²" } },
  sink: { label: "Évier", short: "Évier", group: "Équipements", defaultW: 90, defaultH: 60, color: "#4e8993", water: { cold: true, hot: true, drain: true } },
  dishwasher: { label: "Lave-vaisselle", short: "LV", group: "Équipements", defaultW: 60, defaultH: 60, color: "#4e8993", electric: { protection: "20 A", section: "2,5 mm²" }, water: { cold: true, drain: true } },
  hood: { label: "Hotte", short: "Hotte", group: "Équipements", defaultW: 60, defaultH: 35, color: "#64736f", electric: { protection: "16 A", section: "1,5 mm²" } },
  outlet: { label: "Prise de plan de travail", short: "Prise", group: "Réseaux", defaultW: 24, defaultH: 24, color: "#d49635", electric: { protection: "Circuit prises", section: "2,5 mm²" } },
  light: { label: "Point lumineux", short: "Lumière", group: "Réseaux", defaultW: 24, defaultH: 24, color: "#e5b552", electric: { protection: "10 / 16 A", section: "1,5 mm²" } },
  "source-electric": { label: "Tableau électrique", short: "Élec.", group: "Réseaux", defaultW: 26, defaultH: 26, color: "#d49635", source: "electric" },
  "source-cold": { label: "Arrivée eau froide", short: "EF", group: "Réseaux", defaultW: 26, defaultH: 26, color: "#2684c7", source: "cold" },
  "source-hot": { label: "Départ eau chaude", short: "EC", group: "Réseaux", defaultW: 26, defaultH: 26, color: "#d35c45", source: "hot" },
};

const defaultItems: PlanItem[] = [
  { id: "pantry", kind: "column", name: "Garde-manger", x: 0, y: 0, w: 60, h: 60 },
  { id: "oven", kind: "oven", name: "Colonne four", x: 60, y: 0, w: 60, h: 60 },
  { id: "fridge", kind: "fridge", name: "Réfrigérateur", x: 120, y: 0, w: 60, h: 60 },
  { id: "pullout", kind: "base", name: "Coulissant", x: 380, y: 0, w: 30, h: 60 },
  { id: "hob", kind: "hob", name: "Plaque", x: 410, y: 0, w: 60, h: 60 },
  { id: "corner", kind: "base", name: "Angle", x: 470, y: 0, w: 60, h: 60 },
  { id: "sink", kind: "sink", name: "Évier", x: 470, y: 60, w: 60, h: 90 },
  { id: "prep", kind: "base", name: "Préparation", x: 230, y: 180, w: 120, h: 75 },
  { id: "sorting", kind: "base", name: "Tri", x: 350, y: 180, w: 60, h: 75 },
  { id: "dishwasher", kind: "dishwasher", name: "Lave-vaisselle", x: 410, y: 180, w: 60, h: 75 },
  { id: "fixed-shelf", kind: "shelf", name: "Meuble coulissant prévu", x: 160, y: 440, w: 370, h: 60 },
  { id: "source-electric", kind: "source-electric", name: "Tableau électrique", x: 493, y: 382, w: 26, h: 26 },
  { id: "source-cold", kind: "source-cold", name: "Arrivée eau froide", x: 392, y: 8, w: 26, h: 26 },
  { id: "source-hot", kind: "source-hot", name: "Départ eau chaude", x: 424, y: 8, w: 26, h: 26 },
];

const catalogGroups = (["Meubles", "Équipements", "Réseaux"] as const).map((group) => ({
  group,
  kinds: (Object.keys(specs) as ItemKind[]).filter((kind) => specs[kind].group === group),
}));

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const copyItems = (items: PlanItem[]) => items.map((item) => ({ ...item }));

function isValidItems(value: unknown): value is PlanItem[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<PlanItem>;
    return typeof candidate.id === "string" && typeof candidate.name === "string" &&
      typeof candidate.kind === "string" && candidate.kind in specs &&
      [candidate.x, candidate.y, candidate.w, candidate.h].every(Number.isFinite);
  });
}

function connectionPoint(item: PlanItem) {
  return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input type="number" value={Math.round(value)} min={min} max={max} step={5} onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next)) onChange(next);
        }} />
        <small>cm</small>
      </div>
    </label>
  );
}

export default function Home() {
  const svgRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [items, setItems] = useState<PlanItem[]>(defaultItems);
  const [selectedId, setSelectedId] = useState<string | null>("prep");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>("element");
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [networks, setNetworks] = useState<NetworkVisibility>({ electric: true, cold: true, hot: true });
  const [savedConfigs, setSavedConfigs] = useState<SavedConfiguration[]>([]);
  const [configName, setConfigName] = useState("Configuration péninsule");
  const [currentConfigId, setCurrentConfigId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("Prêt à déplacer les éléments");

  const selected = items.find((item) => item.id === selectedId) ?? null;

  const networkConnections = useMemo(() => {
    const sourceFor = (network: NetworkKind, target: PlanItem) => {
      const targetPoint = connectionPoint(target);
      return items
        .filter((item) => specs[item.kind].source === network)
        .sort((a, b) => {
          const pa = connectionPoint(a);
          const pb = connectionPoint(b);
          return (Math.abs(pa.x - targetPoint.x) + Math.abs(pa.y - targetPoint.y)) - (Math.abs(pb.x - targetPoint.x) + Math.abs(pb.y - targetPoint.y));
        })[0];
    };

    const connections: { network: NetworkKind; item: PlanItem; source: PlanItem; length: number }[] = [];
    items.forEach((item) => {
      const spec = specs[item.kind];
      const needed: NetworkKind[] = [];
      if (spec.electric) needed.push("electric");
      if (spec.water?.cold) needed.push("cold");
      if (spec.water?.hot) needed.push("hot");
      needed.forEach((network) => {
        const source = sourceFor(network, item);
        if (!source) return;
        const a = connectionPoint(source);
        const b = connectionPoint(item);
        connections.push({ network, item, source, length: (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / 100 * 1.15 });
      });
    });
    return connections;
  }, [items]);

  const networkTotals = useMemo(() => {
    const totals: Record<NetworkKind, number> = { electric: 0, cold: 0, hot: 0 };
    networkConnections.forEach((connection) => { totals[connection.network] += connection.length; });
    return totals;
  }, [networkConnections]);

  const circuits = useMemo(() => items.filter((item) => Boolean(specs[item.kind].electric)), [items]);

  const collisions = useMemo(() => {
    const furniture = items.filter((item) => !specs[item.kind].source && item.kind !== "outlet" && item.kind !== "light");
    let count = 0;
    for (let i = 0; i < furniture.length; i += 1) {
      for (let j = i + 1; j < furniture.length; j += 1) {
        const a = furniture[i];
        const b = furniture[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) count += 1;
      }
    }
    return count;
  }, [items]);

  useEffect(() => {
    try {
      const draft = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null");
      if (draft && isValidItems(draft.items)) {
        setItems(copyItems(draft.items));
        if (draft.networks) setNetworks({ electric: Boolean(draft.networks.electric), cold: Boolean(draft.networks.cold), hot: Boolean(draft.networks.hot) });
      }
      const saves = JSON.parse(window.localStorage.getItem(SAVES_KEY) ?? "[]");
      if (Array.isArray(saves)) setSavedConfigs(saves.filter((entry) => entry && typeof entry.name === "string" && isValidItems(entry.items)));
    } catch {
      setNotice("Le brouillon local était illisible ; le plan de départ a été restauré.");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ items, networks }));
  }, [hydrated, items, networks]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(SAVES_KEY, JSON.stringify(savedConfigs));
  }, [hydrated, savedConfigs]);

  function toPlanPoint(event: ReactPointerEvent<SVGElement>) {
    const svg = svgRef.current;
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  }

  function snapped(value: number) {
    return snapToGrid ? Math.round(value / 5) * 5 : Math.round(value);
  }

  function beginGesture(event: ReactPointerEvent<SVGGElement | SVGRectElement>, item: PlanItem, mode: "move" | "resize") {
    const point = toPlanPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(item.id);
    setDraggingId(item.id);
    gestureRef.current = { id: item.id, mode, startX: point.x, startY: point.y, originX: item.x, originY: item.y, originW: item.w, originH: item.h };
  }

  function moveGesture(event: ReactPointerEvent<SVGSVGElement>) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const point = toPlanPoint(event);
    if (!point) return;
    setItems((current) => current.map((item) => {
      if (item.id !== gesture.id) return item;
      const dx = point.x - gesture.startX;
      const dy = point.y - gesture.startY;
      if (gesture.mode === "move") {
        return { ...item, x: clamp(snapped(gesture.originX + dx), 0, ROOM_W - item.w), y: clamp(snapped(gesture.originY + dy), 0, ROOM_H - item.h) };
      }
      return { ...item, w: clamp(snapped(gesture.originW + dx), 20, ROOM_W - item.x), h: clamp(snapped(gesture.originH + dy), 20, ROOM_H - item.y) };
    }));
  }

  function endGesture() {
    if (gestureRef.current) setNotice("Position enregistrée dans le brouillon");
    gestureRef.current = null;
    setDraggingId(null);
  }

  function updateSelected(changes: Partial<PlanItem>) {
    if (!selectedId) return;
    setItems((current) => current.map((item) => {
      if (item.id !== selectedId) return item;
      const next = { ...item, ...changes };
      next.w = clamp(next.w, 20, ROOM_W);
      next.h = clamp(next.h, 20, ROOM_H);
      next.x = clamp(next.x, 0, ROOM_W - next.w);
      next.y = clamp(next.y, 0, ROOM_H - next.h);
      return next;
    }));
  }

  function nudgeSelected(event: ReactKeyboardEvent<SVGGElement>, item: PlanItem) {
    const direction: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (direction[event.key]) {
      event.preventDefault();
      const [dx, dy] = direction[event.key];
      const step = event.shiftKey ? 10 : 5;
      setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, x: clamp(candidate.x + dx * step, 0, ROOM_W - candidate.w), y: clamp(candidate.y + dy * step, 0, ROOM_H - candidate.h) } : candidate));
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedId === item.id) {
      event.preventDefault();
      removeSelected();
    }
  }

  function addItem(kind: ItemKind) {
    const spec = specs[kind];
    const offset = (items.length * 13) % 90;
    const item: PlanItem = { id: `${kind}-${uid()}`, kind, name: spec.label, x: clamp(195 + offset, 0, ROOM_W - spec.defaultW), y: clamp(285 + offset / 2, 0, ROOM_H - spec.defaultH), w: spec.defaultW, h: spec.defaultH };
    setItems((current) => [...current, item]);
    setSelectedId(item.id);
    setActiveTab("element");
    setNotice(`${spec.label} ajouté au plan`);
  }

  function removeSelected() {
    if (!selectedId) return;
    const item = items.find((candidate) => candidate.id === selectedId);
    setItems((current) => current.filter((candidate) => candidate.id !== selectedId));
    setSelectedId(null);
    setNotice(item ? `${item.name} supprimé` : "Élément supprimé");
  }

  function duplicateSelected() {
    if (!selected) return;
    const duplicate = { ...selected, id: `${selected.kind}-${uid()}`, name: `${selected.name} – copie`, x: clamp(selected.x + 20, 0, ROOM_W - selected.w), y: clamp(selected.y + 20, 0, ROOM_H - selected.h) };
    setItems((current) => [...current, duplicate]);
    setSelectedId(duplicate.id);
    setNotice("Élément dupliqué");
  }

  function rotateSelected() {
    if (!selected) return;
    updateSelected({ w: selected.h, h: selected.w });
    setNotice("Élément pivoté à 90°");
  }

  function resetPlan() {
    setItems(copyItems(defaultItems));
    setSelectedId("prep");
    setNetworks({ electric: true, cold: true, hot: true });
    setCurrentConfigId(null);
    setConfigName("Configuration péninsule");
    setNotice("Plan de départ restauré");
  }

  function saveNewConfiguration() {
    const name = configName.trim() || `Configuration ${savedConfigs.length + 1}`;
    const saved: SavedConfiguration = { id: uid(), name, updatedAt: new Date().toISOString(), items: copyItems(items), networks: { ...networks } };
    setSavedConfigs((current) => [saved, ...current]);
    setCurrentConfigId(saved.id);
    setConfigName(saved.name);
    setNotice(`« ${saved.name} » sauvegardée`);
  }

  function updateCurrentConfiguration() {
    if (!currentConfigId) return;
    const name = configName.trim() || "Configuration sans nom";
    setSavedConfigs((current) => current.map((entry) => entry.id === currentConfigId ? { ...entry, name, updatedAt: new Date().toISOString(), items: copyItems(items), networks: { ...networks } } : entry));
    setNotice(`« ${name} » mise à jour`);
  }

  function loadConfiguration(configuration: SavedConfiguration) {
    setItems(copyItems(configuration.items));
    setNetworks({ ...configuration.networks });
    setCurrentConfigId(configuration.id);
    setConfigName(configuration.name);
    setSelectedId(null);
    setNotice(`« ${configuration.name} » chargée`);
  }

  function deleteConfiguration(id: string) {
    const removed = savedConfigs.find((entry) => entry.id === id);
    setSavedConfigs((current) => current.filter((entry) => entry.id !== id));
    if (currentConfigId === id) setCurrentConfigId(null);
    setNotice(removed ? `« ${removed.name} » supprimée` : "Configuration supprimée");
  }

  function renderRoute(connection: (typeof networkConnections)[number], index: number) {
    const start = connectionPoint(connection.source);
    const end = connectionPoint(connection.item);
    const shift = connection.network === "cold" ? -3 : connection.network === "hot" ? 3 : 0;
    const path = connection.network === "cold" ? `M ${start.x + shift} ${start.y} V ${end.y + shift} H ${end.x}` : `M ${start.x} ${start.y + shift} H ${end.x + shift} V ${end.y}`;
    return (
      <g key={`${connection.network}-${connection.item.id}-${index}`} className={`network-line network-${connection.network}`}>
        <path d={path} />
        <circle cx={end.x} cy={end.y} r="3.5" />
      </g>
    );
  }

  return (
    <main>
      <header className="site-header">
        <div>
          <p className="eyebrow">Atelier de conception · pièce 5,30 × 5,00 m</p>
          <h1>Dessine ta cuisine, meuble par meuble.</h1>
          <p className="intro">Déplace, redimensionne et équipe le plan. Le configurateur estime en direct les tracés électriques, l’eau froide et l’eau chaude.</p>
        </div>
        <div className="header-tools">
          <button type="button" className="text-action" onClick={resetPlan}>Plan de départ</button>
          <button type="button" className="print-action" onClick={() => window.print()}>Imprimer</button>
          <div className="header-mark" aria-hidden="true">EG</div>
        </div>
      </header>

      <section className="status-strip" aria-live="polite">
        <span className="status-dot" /><span>{notice}</span><span className="status-spacer" />
        <strong>{items.length} éléments</strong>
        <strong className={collisions ? "status-alert" : ""}>{collisions ? `${collisions} chevauchement${collisions > 1 ? "s" : ""}` : "Aucun chevauchement"}</strong>
      </section>

      <section className="workspace">
        <div className="plan-shell">
          <div className="plan-toolbar">
            <div><span className="section-kicker">Vue du dessus</span><strong>Glisser pour déplacer · poignée carrée pour redimensionner</strong></div>
            <div className="toolbar-toggles">
              <label><input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} /> Aimant 5 cm</label>
              <label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} /> Grille</label>
              <label><input type="checkbox" checked={showDimensions} onChange={(event) => setShowDimensions(event.target.checked)} /> Cotes</label>
            </div>
          </div>

          <div className="network-legend" aria-label="Légende des réseaux">
            {(["electric", "cold", "hot"] as NetworkKind[]).map((network) => (
              <button type="button" key={network} className={`legend-chip legend-${network} ${networks[network] ? "is-on" : ""}`} aria-pressed={networks[network]} onClick={() => setNetworks((current) => ({ ...current, [network]: !current[network] }))}>
                <span />{network === "electric" ? "Électricité" : network === "cold" ? "Eau froide" : "Eau chaude"}
              </button>
            ))}
          </div>

          <div className="plan-stage">
            <svg ref={svgRef} viewBox="-45 -45 620 590" role="img" aria-labelledby="plan-title plan-description" onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture} onPointerLeave={endGesture}>
              <title id="plan-title">Éditeur interactif du plan de cuisine</title>
              <desc id="plan-description">Les éléments du plan peuvent être déplacés et redimensionnés. Les réseaux sont représentés par des tracés colorés.</desc>
              <defs>
                <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" className="grid-line" fill="none" /></pattern>
                <filter id="module-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#1f2b29" floodOpacity="0.13" /></filter>
              </defs>

              <rect x="0" y="0" width={ROOM_W} height={ROOM_H} className="floor" onPointerDown={() => setSelectedId(null)} />
              {showGrid && <rect x="0" y="0" width={ROOM_W} height={ROOM_H} fill="url(#grid)" opacity="0.58" pointerEvents="none" />}

              <g className="room-details" pointerEvents="none">
                <g className="walls"><path d="M0 0 H200 V50 H380 V0 H530 V90" /><path d="M530 200 V300" /><path d="M530 420 V500 H160" /><path d="M30 500 H0 V400" /><path d="M0 300 V0" /></g>
                <g className="windows"><path d="M0 300 V400 M-7 305 H7 M-7 395 H7" /><path d="M530 90 V200 M523 95 H537 M523 195 H537" /></g>
                <g className="doors"><path d="M30 500 H160 M30 500 A130 130 0 0 1 160 370" /><path d="M530 300 V420 M530 300 A120 120 0 0 0 410 420" /></g>
                <rect x="200" y="0" width="180" height="50" className="chimney-zone" />
                <text x="290" y="27" textAnchor="middle" className="chimney-label">cheminée condamnée · zone libre</text>
                <text x="265" y="-17" textAnchor="middle" className="room-size">530 cm</text>
                <text x="-24" y="250" textAnchor="middle" className="room-size" transform="rotate(-90 -24 250)">500 cm</text>
                <text x="65" y="526" textAnchor="middle" className="opening-label">double porte salon</text>
                <text x="554" y="360" textAnchor="middle" className="opening-label" transform="rotate(-90 554 360)">entrée</text>
              </g>

              <g className="network-routes" pointerEvents="none">{networkConnections.filter((connection) => networks[connection.network]).map(renderRoute)}</g>

              <g className="plan-items">
                {items.map((item) => {
                  const spec = specs[item.kind];
                  const isSource = Boolean(spec.source);
                  const isSelected = item.id === selectedId;
                  const center = connectionPoint(item);
                  if (isSource) {
                    return (
                      <g key={item.id} className={`source-item source-${spec.source} ${isSelected ? "selected" : ""} ${draggingId === item.id ? "dragging" : ""}`} role="button" tabIndex={0} aria-label={`${item.name}, déplacer sur le plan`} onPointerDown={(event) => beginGesture(event, item, "move")} onKeyDown={(event) => nudgeSelected(event, item)}>
                        <circle cx={center.x} cy={center.y} r={item.w / 2} />
                        <text x={center.x} y={center.y} textAnchor="middle" dominantBaseline="middle">{spec.short}</text>
                        <text className="source-caption" x={center.x} y={center.y + item.h / 2 + 13} textAnchor="middle">{item.name}</text>
                      </g>
                    );
                  }
                  return (
                    <g key={item.id} className={`plan-item ${isSelected ? "selected" : ""} ${draggingId === item.id ? "dragging" : ""}`} role="button" tabIndex={0} aria-label={`${item.name}, ${Math.round(item.w)} par ${Math.round(item.h)} centimètres`} onPointerDown={(event) => beginGesture(event, item, "move")} onKeyDown={(event) => nudgeSelected(event, item)}>
                      <rect x={item.x} y={item.y} width={item.w} height={item.h} rx="2" fill={spec.color} />
                      <rect className="item-inner" x={item.x + 4} y={item.y + 4} width={Math.max(0, item.w - 8)} height={Math.max(0, item.h - 8)} rx="1" />
                      <text className="item-label" x={center.x} y={center.y - (showDimensions ? 5 : 0)} textAnchor="middle" dominantBaseline="middle">{item.w < 45 ? spec.short : item.name}</text>
                      {showDimensions && <text className="item-size" x={center.x} y={center.y + 13} textAnchor="middle" dominantBaseline="middle">{Math.round(item.w)} × {Math.round(item.h)}</text>}
                      {isSelected && <rect className="resize-handle" x={item.x + item.w - 7} y={item.y + item.h - 7} width="14" height="14" rx="2" onPointerDown={(event) => beginGesture(event, item, "resize")} />}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          <div className="plan-foot">
            <div><span>Électricité estimée</span><strong>{networkTotals.electric.toFixed(1)} m</strong></div>
            <div><span>Eau froide estimée</span><strong>{networkTotals.cold.toFixed(1)} m</strong></div>
            <div><span>Eau chaude estimée</span><strong>{networkTotals.hot.toFixed(1)} m</strong></div>
            <p>Tracé orthogonal indicatif, avec 15 % de marge.</p>
          </div>
        </div>

        <aside className="control-panel">
          <div className="panel-tabs" role="tablist" aria-label="Outils du configurateur">
            {([["element", "Élément"], ["catalog", "Ajouter"], ["networks", "Réseaux"], ["saves", "Plans"]] as [PanelTab, string][]).map(([tab, label]) => (
              <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{label}</button>
            ))}
          </div>

          {activeTab === "element" && (
            <div className="panel-content" role="tabpanel">
              {selected ? (
                <>
                  <div className="panel-heading compact-heading">
                    <span className="section-kicker">Élément sélectionné</span>
                    <input className="name-input" value={selected.name} aria-label="Nom de l’élément" onChange={(event) => updateSelected({ name: event.target.value })} />
                    <p>{specs[selected.kind].label}</p>
                  </div>
                  <div className="dimension-grid">
                    <NumberField label="Position X" value={selected.x} min={0} max={ROOM_W - selected.w} onChange={(x) => updateSelected({ x })} />
                    <NumberField label="Position Y" value={selected.y} min={0} max={ROOM_H - selected.h} onChange={(y) => updateSelected({ y })} />
                    <NumberField label="Largeur" value={selected.w} min={20} max={ROOM_W - selected.x} onChange={(w) => updateSelected({ w })} />
                    <NumberField label="Profondeur" value={selected.h} min={20} max={ROOM_H - selected.y} onChange={(h) => updateSelected({ h })} />
                  </div>
                  <div className="button-grid">
                    <button type="button" onClick={rotateSelected}>↻ Pivoter 90°</button>
                    <button type="button" onClick={duplicateSelected}>＋ Dupliquer</button>
                    <button type="button" className="danger-action" onClick={removeSelected}>Supprimer</button>
                  </div>
                  <div className="item-requirements">
                    <span className="section-kicker">Besoins techniques</span>
                    {!specs[selected.kind].electric && !specs[selected.kind].water && !specs[selected.kind].source && <p>Aucun raccordement associé.</p>}
                    {specs[selected.kind].electric && <p><i className="dot electric-dot" /> Électricité · {specs[selected.kind].electric?.protection} · {specs[selected.kind].electric?.section}</p>}
                    {specs[selected.kind].water?.cold && <p><i className="dot cold-dot" /> Alimentation eau froide</p>}
                    {specs[selected.kind].water?.hot && <p><i className="dot hot-dot" /> Alimentation eau chaude</p>}
                    {specs[selected.kind].water?.drain && <p><i className="dot drain-dot" /> Évacuation à prévoir</p>}
                    {specs[selected.kind].source && <p>Point de départ du réseau {specs[selected.kind].source === "electric" ? "électrique" : specs[selected.kind].source === "cold" ? "d’eau froide" : "d’eau chaude"}.</p>}
                  </div>
                </>
              ) : (
                <div className="empty-state"><span className="empty-icon">↖</span><h2>Sélectionne un élément</h2><p>Clique sur un meuble pour régler sa position et ses dimensions au centimètre près.</p><button type="button" onClick={() => setActiveTab("catalog")}>Ouvrir le catalogue</button></div>
              )}
            </div>
          )}

          {activeTab === "catalog" && (
            <div className="panel-content" role="tabpanel">
              <div className="panel-heading compact-heading"><span className="section-kicker">Catalogue</span><h2>Ajouter un élément</h2><p>Il apparaîtra au centre du plan, prêt à être placé.</p></div>
              <div className="catalog-groups">
                {catalogGroups.map(({ group, kinds }) => (
                  <section key={group}><h3>{group}</h3><div className="catalog-grid">
                    {kinds.map((kind) => (
                      <button type="button" key={kind} onClick={() => addItem(kind)}><span className="catalog-swatch" style={{ background: specs[kind].color }} /><span><strong>{specs[kind].label}</strong><small>{specs[kind].defaultW} × {specs[kind].defaultH} cm</small></span><b>＋</b></button>
                    ))}
                  </div></section>
                ))}
              </div>
            </div>
          )}

          {activeTab === "networks" && (
            <div className="panel-content" role="tabpanel">
              <div className="panel-heading compact-heading"><span className="section-kicker">Simulation technique</span><h2>Réseaux nécessaires</h2><p>Déplace les pastilles de départ directement sur le plan pour comparer les longueurs.</p></div>
              <div className="network-cards">
                <button type="button" className={`network-card electric-card ${networks.electric ? "active" : ""}`} onClick={() => setNetworks((current) => ({ ...current, electric: !current.electric }))}><span>Électricité</span><strong>{networkTotals.electric.toFixed(1)} m</strong><small>{circuits.length} point{circuits.length > 1 ? "s" : ""}</small></button>
                <button type="button" className={`network-card cold-card ${networks.cold ? "active" : ""}`} onClick={() => setNetworks((current) => ({ ...current, cold: !current.cold }))}><span>Eau froide</span><strong>{networkTotals.cold.toFixed(1)} m</strong><small>{networkConnections.filter((entry) => entry.network === "cold").length} point(s)</small></button>
                <button type="button" className={`network-card hot-card ${networks.hot ? "active" : ""}`} onClick={() => setNetworks((current) => ({ ...current, hot: !current.hot }))}><span>Eau chaude</span><strong>{networkTotals.hot.toFixed(1)} m</strong><small>{networkConnections.filter((entry) => entry.network === "hot").length} point(s)</small></button>
              </div>
              <div className="circuit-list">
                <div className="circuit-heading"><span>Équipement</span><span>Protection · section</span></div>
                {circuits.length ? circuits.map((item) => {
                  const spec = specs[item.kind];
                  const length = networkConnections.find((entry) => entry.network === "electric" && entry.item.id === item.id)?.length;
                  return <button type="button" key={item.id} onClick={() => { setSelectedId(item.id); setActiveTab("element"); }}><span><strong>{item.name}</strong><small>{length ? `${length.toFixed(1)} m estimés` : "source absente"}</small></span><span>{spec.electric?.protection}<small>{spec.electric?.section}</small></span></button>;
                }) : <p className="muted-copy">Aucun appareil électrique sur le plan.</p>}
              </div>
              <div className="technical-note"><strong>Avant travaux</strong><p>Ces tracés sont une aide à l’implantation. Sections, protections, volumes de sécurité, chutes de tension, évacuations et parcours réels doivent être validés par les professionnels du chantier.</p></div>
            </div>
          )}

          {activeTab === "saves" && (
            <div className="panel-content" role="tabpanel">
              <div className="panel-heading compact-heading"><span className="section-kicker">Configurations locales</span><h2>Sauvegarder plusieurs plans</h2><p>Les plans restent enregistrés dans ce navigateur.</p></div>
              <label className="save-name-field"><span>Nom de la configuration</span><input value={configName} onChange={(event) => setConfigName(event.target.value)} placeholder="Ex. Péninsule 240 cm" /></label>
              <div className="save-actions"><button type="button" className="primary-action" onClick={saveNewConfiguration}>Enregistrer une copie</button>{currentConfigId && <button type="button" onClick={updateCurrentConfiguration}>Mettre à jour</button>}</div>
              <div className="saved-list">
                <div className="saved-list-heading"><span>Mes plans</span><strong>{savedConfigs.length}</strong></div>
                {savedConfigs.length ? savedConfigs.map((configuration) => (
                  <article key={configuration.id} className={currentConfigId === configuration.id ? "current" : ""}>
                    <button type="button" className="load-save" onClick={() => loadConfiguration(configuration)}><span><strong>{configuration.name}</strong><small>{configuration.items.length} éléments · {new Date(configuration.updatedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small></span><b>Ouvrir</b></button>
                    <button type="button" className="delete-save" aria-label={`Supprimer ${configuration.name}`} onClick={() => deleteConfiguration(configuration.id)}>×</button>
                  </article>
                )) : <div className="empty-saves"><p>Aucune configuration nommée.</p><small>Le plan courant est tout de même conservé comme brouillon automatique.</small></div>}
              </div>
            </div>
          )}
        </aside>
      </section>

      <section className="help-band">
        <div><span className="section-kicker">Mode d’emploi</span><h2>Du croquis à une implantation comparable.</h2></div>
        <ol>
          <li><span>01</span><p><strong>Place les volumes</strong>Glisse les meubles et redimensionne avec la poignée.</p></li>
          <li><span>02</span><p><strong>Ajoute les équipements</strong>Leurs besoins techniques sont associés automatiquement.</p></li>
          <li><span>03</span><p><strong>Compare les réseaux</strong>Déplace les trois départs et observe les longueurs.</p></li>
          <li><span>04</span><p><strong>Nomme tes variantes</strong>Enregistre autant de configurations que nécessaire.</p></li>
        </ol>
      </section>
    </main>
  );
}
