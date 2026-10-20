"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type NetworkKind = "electric" | "cold" | "hot";
type PanelTab = "element" | "catalog" | "networks" | "budget" | "saves";
type ItemGroup = "Meubles" | "Équipements" | "Ouvertures" | "Réseaux";
type ItemKind =
  | "base" | "column" | "shelf" | "table" | "fridge" | "oven" | "hob" | "sink"
  | "dishwasher" | "hood" | "door" | "window" | "chimney" | "outlet" | "light"
  | "water-outlet-cold" | "water-outlet-hot" | "source-electric" | "source-cold" | "source-hot";

type PlanItem = {
  id: string;
  kind: ItemKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  openingHeight?: number;
};

type RoomSettings = { width: number; depth: number; height: number };
type BuildSettings = { studSpacing: number; studLength: number; waste: number; tileWaste: number; includeCeiling: boolean };
type RoutePoint = { x: number; y: number };
type NetworkRoute = {
  id: string;
  kind: NetworkKind;
  name: string;
  points: RoutePoint[];
  sourceId?: string;
  targetId?: string;
  autoLinked?: boolean;
};
type NetworkVisibility = Record<NetworkKind, boolean>;

type PriceKey =
  | "perColdM" | "perHotM" | "perFitting" | "perElbow" | "waterOutlet"
  | "cable15M" | "cable25M" | "cable6M" | "socket" | "socketBox" | "breaker" | "light"
  | "rail3M" | "stud" | "insulationM2" | "ba13Sheet" | "screwsBox"
  | "tileM2" | "adhesiveBag" | "groutBag";
type PriceCatalog = Record<PriceKey, number>;

type SavedConfiguration = {
  id: string;
  name: string;
  updatedAt: string;
  items: PlanItem[];
  networks: NetworkVisibility;
  routes?: NetworkRoute[];
  room?: RoomSettings;
  prices?: PriceCatalog;
  build?: BuildSettings;
};

type ItemSpec = {
  label: string;
  short: string;
  group: ItemGroup;
  defaultW: number;
  defaultH: number;
  color: string;
  electric?: { protection: string; section: "1,5 mm²" | "2,5 mm²" | "6 mm²" };
  water?: { cold?: boolean; hot?: boolean; drain?: boolean };
  source?: NetworkKind;
};

type ItemGesture = { id: string; mode: "move" | "resize"; startX: number; startY: number; originX: number; originY: number; originW: number; originH: number };
type RouteGesture = { routeId: string; pointIndex: number; startX: number; startY: number; originX: number; originY: number };
type MaterialLine = { category: "Plomberie" | "Électricité" | "Cloisons" | "Carrelage"; label: string; detail: string; qty: number; unit: string; priceKey: PriceKey };

const DRAFT_KEY = "emmanuel-kitchen-editor-draft-v2";
const SAVES_KEY = "emmanuel-kitchen-editor-saves-v2";
const defaultRoom: RoomSettings = { width: 530, depth: 500, height: 250 };
const defaultBuild: BuildSettings = { studSpacing: 60, studLength: 260, waste: 10, tileWaste: 10, includeCeiling: false };
const defaultNetworks: NetworkVisibility = { electric: true, cold: true, hot: true };
const defaultPrices: PriceCatalog = {
  perColdM: 0.95, perHotM: 0.95, perFitting: 3.5, perElbow: 2.5, waterOutlet: 8,
  cable15M: 0.75, cable25M: 1.35, cable6M: 3.8, socket: 8.5, socketBox: 2.2, breaker: 15, light: 6,
  rail3M: 5.5, stud: 6.5, insulationM2: 9, ba13Sheet: 12.5, screwsBox: 7,
  tileM2: 25, adhesiveBag: 22, groutBag: 15,
};

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
  door: { label: "Porte", short: "Porte", group: "Ouvertures", defaultW: 90, defaultH: 12, color: "#8b8173" },
  window: { label: "Fenêtre", short: "Fenêtre", group: "Ouvertures", defaultW: 120, defaultH: 12, color: "#4f8b95" },
  chimney: { label: "Cheminée / obstacle", short: "Cheminée", group: "Ouvertures", defaultW: 180, defaultH: 50, color: "#a69c8c" },
  outlet: { label: "Prise électrique", short: "Prise", group: "Réseaux", defaultW: 24, defaultH: 24, color: "#d49635", electric: { protection: "Circuit prises", section: "2,5 mm²" } },
  light: { label: "Point lumineux", short: "Lumière", group: "Réseaux", defaultW: 24, defaultH: 24, color: "#e5b552", electric: { protection: "10 / 16 A", section: "1,5 mm²" } },
  "water-outlet-cold": { label: "Sortie eau froide libre", short: "Sortie EF", group: "Réseaux", defaultW: 24, defaultH: 24, color: "#2684c7", water: { cold: true } },
  "water-outlet-hot": { label: "Sortie eau chaude libre", short: "Sortie EC", group: "Réseaux", defaultW: 24, defaultH: 24, color: "#d35c45", water: { hot: true } },
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
  { id: "chimney", kind: "chimney", name: "Cheminée condamnée", x: 200, y: 0, w: 180, h: 50 },
  { id: "salon-door", kind: "door", name: "Double porte salon", x: 30, y: 488, w: 130, h: 12, openingHeight: 215 },
  { id: "entry-door", kind: "door", name: "Porte d’entrée", x: 518, y: 300, w: 12, h: 120, openingHeight: 215 },
  { id: "street-window", kind: "window", name: "Grande fenêtre", x: 0, y: 300, w: 12, h: 100, openingHeight: 110 },
  { id: "high-window", kind: "window", name: "Fenêtre haute", x: 518, y: 90, w: 12, h: 110, openingHeight: 60 },
  { id: "source-electric", kind: "source-electric", name: "Tableau électrique", x: 493, y: 382, w: 26, h: 26 },
  { id: "source-cold", kind: "source-cold", name: "Arrivée eau froide", x: 392, y: 8, w: 26, h: 26 },
  { id: "source-hot", kind: "source-hot", name: "Départ eau chaude", x: 424, y: 8, w: 26, h: 26 },
];

const groups: ItemGroup[] = ["Meubles", "Équipements", "Ouvertures", "Réseaux"];
const catalogGroups = groups.map((group) => ({ group, kinds: (Object.keys(specs) as ItemKind[]).filter((kind) => specs[kind].group === group) }));
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const copyItems = (items: PlanItem[]) => items.map((item) => ({ ...item }));
const copyRoutes = (routes: NetworkRoute[]) => routes.map((route) => ({ ...route, points: route.points.map((point) => ({ ...point })) }));
const centerOf = (item: PlanItem) => ({ x: item.x + item.w / 2, y: item.y + item.h / 2 });
const networkLabel = (kind: NetworkKind) => kind === "electric" ? "Électricité" : kind === "cold" ? "Eau froide" : "Eau chaude";

function isValidItems(value: unknown): value is PlanItem[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<PlanItem>;
    return typeof candidate.id === "string" && typeof candidate.name === "string" && typeof candidate.kind === "string" && candidate.kind in specs && [candidate.x, candidate.y, candidate.w, candidate.h].every(Number.isFinite);
  });
}

function networksNeeded(item: PlanItem): NetworkKind[] {
  const spec = specs[item.kind];
  return [spec.electric ? "electric" : null, spec.water?.cold ? "cold" : null, spec.water?.hot ? "hot" : null].filter(Boolean) as NetworkKind[];
}

function nearestSource(items: PlanItem[], kind: NetworkKind, target: PlanItem) {
  const end = centerOf(target);
  return items.filter((item) => specs[item.kind].source === kind).sort((a, b) => {
    const pa = centerOf(a); const pb = centerOf(b);
    return (Math.abs(pa.x - end.x) + Math.abs(pa.y - end.y)) - (Math.abs(pb.x - end.x) + Math.abs(pb.y - end.y));
  })[0];
}

function linkedRoutesForItem(items: PlanItem[], item: PlanItem, prefix = "auto"): NetworkRoute[] {
  return networksNeeded(item).flatMap((kind) => {
    const source = nearestSource(items, kind, item);
    if (!source) return [];
    const start = centerOf(source); const end = centerOf(item);
    return [{ id: `${prefix}-${kind}-${item.id}`, kind, name: `${networkLabel(kind)} · ${item.name}`, sourceId: source.id, targetId: item.id, autoLinked: true, points: [start, { x: start.x, y: end.y }, end] }];
  });
}

function automaticRoutes(items: PlanItem[]) {
  return items.flatMap((item) => linkedRoutesForItem(items, item));
}

function effectivePoints(route: NetworkRoute, items: PlanItem[]) {
  const points = route.points.map((point) => ({ ...point }));
  const source = items.find((item) => item.id === route.sourceId);
  const target = items.find((item) => item.id === route.targetId);
  if (source && points.length) points[0] = centerOf(source);
  if (target && points.length) points[points.length - 1] = centerOf(target);
  return points;
}

function routeLength(route: NetworkRoute, items: PlanItem[]) {
  const points = effectivePoints(route, items);
  return points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0) / 100 * 1.15;
}

function NumberField({ label, value, min, max, unit = "cm", onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="number-field"><span>{label}</span><div><input type="number" value={Math.round(value * 100) / 100} min={min} max={max} step={unit === "€" ? 0.1 : 5} onChange={(event) => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next)) onChange(next); }} /><small>{unit}</small></div></label>;
}

export default function Home() {
  const svgRef = useRef<SVGSVGElement>(null);
  const itemGesture = useRef<ItemGesture | null>(null);
  const routeGesture = useRef<RouteGesture | null>(null);
  const [room, setRoom] = useState<RoomSettings>(defaultRoom);
  const [build, setBuild] = useState<BuildSettings>(defaultBuild);
  const [items, setItems] = useState<PlanItem[]>(defaultItems);
  const [routes, setRoutes] = useState<NetworkRoute[]>(() => automaticRoutes(defaultItems));
  const [selectedId, setSelectedId] = useState<string | null>("prep");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>("element");
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [networks, setNetworks] = useState<NetworkVisibility>(defaultNetworks);
  const [prices, setPrices] = useState<PriceCatalog>(defaultPrices);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfiguration[]>([]);
  const [configName, setConfigName] = useState("Configuration péninsule");
  const [currentConfigId, setCurrentConfigId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("Brouillon automatique actif");

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? null;
  const networkTotals = useMemo(() => routes.reduce((totals, route) => ({ ...totals, [route.kind]: totals[route.kind] + routeLength(route, items) }), { electric: 0, cold: 0, hot: 0 } as Record<NetworkKind, number>), [routes, items]);
  const circuits = useMemo(() => items.filter((item) => Boolean(specs[item.kind].electric)), [items]);

  const roomMetrics = useMemo(() => {
    const floor = room.width * room.depth / 10000;
    const perimeter = 2 * (room.width + room.depth) / 100;
    const openings = items.filter((item) => item.kind === "door" || item.kind === "window");
    const openingArea = openings.reduce((sum, item) => sum + Math.max(item.w, item.h) / 100 * (item.openingHeight ?? (item.kind === "door" ? 215 : 110)) / 100, 0);
    const wallGross = perimeter * room.height / 100;
    const wallNet = Math.max(0, wallGross - openingArea);
    return { floor, perimeter, openingArea, wallGross, wallNet, openings };
  }, [room, items]);

  const materials = useMemo<MaterialLine[]>(() => {
    const len = (kind: NetworkKind) => routes.filter((route) => route.kind === kind).reduce((sum, route) => sum + routeLength(route, items), 0);
    const waterRoutes = routes.filter((route) => route.kind === "cold" || route.kind === "hot");
    const cableBySection = { "1,5 mm²": 0, "2,5 mm²": 0, "6 mm²": 0 };
    routes.filter((route) => route.kind === "electric").forEach((route) => {
      const target = items.find((item) => item.id === route.targetId);
      const section = target && specs[target.kind].electric?.section || "2,5 mm²";
      cableBySection[section] += routeLength(route, items);
    });
    const doorsWidth = items.filter((item) => item.kind === "door").reduce((sum, item) => sum + Math.max(item.w, item.h) / 100, 0);
    const railLinear = Math.max(0, roomMetrics.perimeter * 2 - doorsWidth) * (1 + build.waste / 100);
    const railUnits = Math.ceil(railLinear / 3);
    const studCount = Math.ceil(roomMetrics.perimeter / (build.studSpacing / 100)) + roomMetrics.openings.length * 2;
    const studUnits = studCount * Math.max(1, Math.ceil(room.height / build.studLength));
    const liningArea = (roomMetrics.wallNet + (build.includeCeiling ? roomMetrics.floor : 0)) * (1 + build.waste / 100);
    const sheets = Math.ceil(liningArea / 3);
    const tileArea = roomMetrics.floor * (1 + build.tileWaste / 100);
    const sockets = items.filter((item) => item.kind === "outlet").length;
    const lights = items.filter((item) => item.kind === "light").length;
    const outlets = items.filter((item) => item.kind === "water-outlet-cold" || item.kind === "water-outlet-hot").length;
    return [
      { category: "Plomberie", label: "Tube PER 16 eau froide", detail: "Longueur des tracés + 15 %", qty: len("cold"), unit: "m", priceKey: "perColdM" },
      { category: "Plomberie", label: "Tube PER 16 eau chaude", detail: "Longueur des tracés + 15 %", qty: len("hot"), unit: "m", priceKey: "perHotM" },
      { category: "Plomberie", label: "Raccords PER", detail: "Deux raccords par conduite", qty: waterRoutes.length * 2, unit: "u", priceKey: "perFitting" },
      { category: "Plomberie", label: "Coudes / raccords d’angle", detail: "Selon les points intermédiaires", qty: waterRoutes.reduce((sum, route) => sum + Math.max(0, route.points.length - 2), 0), unit: "u", priceKey: "perElbow" },
      { category: "Plomberie", label: "Sorties d’eau libres", detail: "Vers une autre pièce ou attente", qty: outlets, unit: "u", priceKey: "waterOutlet" },
      { category: "Électricité", label: "Câble 1,5 mm²", detail: "Éclairage et hotte", qty: cableBySection["1,5 mm²"], unit: "m", priceKey: "cable15M" },
      { category: "Électricité", label: "Câble 2,5 mm²", detail: "Prises et circuits spécialisés", qty: cableBySection["2,5 mm²"], unit: "m", priceKey: "cable25M" },
      { category: "Électricité", label: "Câble 6 mm²", detail: "Plaque de cuisson", qty: cableBySection["6 mm²"], unit: "m", priceKey: "cable6M" },
      { category: "Électricité", label: "Prises électriques", detail: "Mécanismes complets", qty: sockets, unit: "u", priceKey: "socket" },
      { category: "Électricité", label: "Boîtes d’encastrement", detail: "Une par prise", qty: sockets, unit: "u", priceKey: "socketBox" },
      { category: "Électricité", label: "Disjoncteurs / départs", detail: "Estimation par point ou appareil", qty: circuits.length, unit: "u", priceKey: "breaker" },
      { category: "Électricité", label: "Points lumineux", detail: "Douille ou sortie DCL", qty: lights, unit: "u", priceKey: "light" },
      { category: "Cloisons", label: "Rails de 3 m", detail: `${railLinear.toFixed(1)} m linéaires avec marge`, qty: railUnits, unit: "u", priceKey: "rail3M" },
      { category: "Cloisons", label: `Montants de ${build.studLength} cm`, detail: `Entraxe ${build.studSpacing} cm + renforts ouvertures`, qty: studUnits, unit: "u", priceKey: "stud" },
      { category: "Cloisons", label: "Isolation", detail: "Surface nette avec marge", qty: liningArea, unit: "m²", priceKey: "insulationM2" },
      { category: "Cloisons", label: "Plaques BA13 120 × 250", detail: `${liningArea.toFixed(1)} m² à couvrir`, qty: sheets, unit: "u", priceKey: "ba13Sheet" },
      { category: "Cloisons", label: "Boîtes de vis", detail: "Base 1 000 vis", qty: Math.max(1, Math.ceil(sheets * 30 / 1000)), unit: "u", priceKey: "screwsBox" },
      { category: "Carrelage", label: "Carrelage", detail: `Sol + ${build.tileWaste} % de marge`, qty: tileArea, unit: "m²", priceKey: "tileM2" },
      { category: "Carrelage", label: "Colle carrelage", detail: "Rendement estimé 5 m² / sac", qty: Math.ceil(tileArea / 5), unit: "sac", priceKey: "adhesiveBag" },
      { category: "Carrelage", label: "Joint carrelage", detail: "Rendement estimé 20 m² / sac", qty: Math.max(1, Math.ceil(tileArea / 20)), unit: "sac", priceKey: "groutBag" },
    ];
  }, [routes, items, room, build, roomMetrics]);

  const categoryTotals = useMemo(() => materials.reduce((totals, line) => ({ ...totals, [line.category]: (totals[line.category] ?? 0) + line.qty * prices[line.priceKey] }), {} as Record<string, number>), [materials, prices]);
  const grandTotal = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0);

  const collisions = useMemo(() => {
    const solids = items.filter((item) => !specs[item.kind].source && !["outlet", "light", "door", "window", "water-outlet-cold", "water-outlet-hot"].includes(item.kind));
    let count = 0;
    for (let i = 0; i < solids.length; i += 1) for (let j = i + 1; j < solids.length; j += 1) {
      const a = solids[i]; const b = solids[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) count += 1;
    }
    return count;
  }, [items]);

  useEffect(() => {
    try {
      const draft = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null");
      if (draft && isValidItems(draft.items)) {
        const legacyInfrastructure = draft.items.some((item: PlanItem) => item.kind === "door" || item.kind === "window" || item.kind === "chimney")
          ? []
          : defaultItems.filter((item) => item.kind === "door" || item.kind === "window" || item.kind === "chimney");
        const loadedItems = copyItems([...draft.items, ...legacyInfrastructure]);
        setItems(loadedItems);
        setRoom({ ...defaultRoom, ...(draft.room ?? {}) });
        setBuild({ ...defaultBuild, ...(draft.build ?? {}) });
        setPrices({ ...defaultPrices, ...(draft.prices ?? {}) });
        setNetworks({ ...defaultNetworks, ...(draft.networks ?? {}) });
        setRoutes(Array.isArray(draft.routes) ? copyRoutes(draft.routes) : automaticRoutes(loadedItems));
      }
      const saves = JSON.parse(window.localStorage.getItem(SAVES_KEY) ?? "[]");
      if (Array.isArray(saves)) setSavedConfigs(saves.filter((entry) => entry && typeof entry.name === "string" && isValidItems(entry.items)));
    } catch { setNotice("Le brouillon local était illisible ; le plan de départ a été restauré."); }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ items, routes, room, build, prices, networks }));
  }, [hydrated, items, routes, room, build, prices, networks]);
  useEffect(() => { if (hydrated) window.localStorage.setItem(SAVES_KEY, JSON.stringify(savedConfigs)); }, [hydrated, savedConfigs]);

  function toPlanPoint(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current; const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  }
  const snapped = (value: number) => snapToGrid ? Math.round(value / 5) * 5 : Math.round(value);

  function beginItemGesture(event: ReactPointerEvent<SVGGElement | SVGRectElement>, item: PlanItem, mode: "move" | "resize") {
    const point = toPlanPoint(event); if (!point) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(item.id); setSelectedRouteId(null); setDraggingId(item.id); setActiveTab("element");
    itemGesture.current = { id: item.id, mode, startX: point.x, startY: point.y, originX: item.x, originY: item.y, originW: item.w, originH: item.h };
  }

  function beginRouteGesture(event: ReactPointerEvent<SVGCircleElement>, route: NetworkRoute, pointIndex: number) {
    if ((pointIndex === 0 && route.sourceId) || (pointIndex === route.points.length - 1 && route.targetId)) return;
    const point = toPlanPoint(event); if (!point) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    const origin = effectivePoints(route, items)[pointIndex];
    routeGesture.current = { routeId: route.id, pointIndex, startX: point.x, startY: point.y, originX: origin.x, originY: origin.y };
  }

  function moveGesture(event: ReactPointerEvent<SVGSVGElement>) {
    const point = toPlanPoint(event); if (!point) return;
    if (routeGesture.current) {
      const gesture = routeGesture.current;
      setRoutes((current) => current.map((route) => route.id === gesture.routeId ? { ...route, points: route.points.map((routePoint, index) => index === gesture.pointIndex ? { x: clamp(snapped(gesture.originX + point.x - gesture.startX), 0, room.width), y: clamp(snapped(gesture.originY + point.y - gesture.startY), 0, room.depth) } : routePoint) } : route));
      return;
    }
    const gesture = itemGesture.current; if (!gesture) return;
    setItems((current) => current.map((item) => {
      if (item.id !== gesture.id) return item;
      const dx = point.x - gesture.startX; const dy = point.y - gesture.startY;
      if (gesture.mode === "move") return { ...item, x: clamp(snapped(gesture.originX + dx), 0, room.width - item.w), y: clamp(snapped(gesture.originY + dy), 0, room.depth - item.h) };
      return { ...item, w: clamp(snapped(gesture.originW + dx), 10, room.width - item.x), h: clamp(snapped(gesture.originH + dy), 10, room.depth - item.y) };
    }));
  }

  function endGesture() {
    if (itemGesture.current || routeGesture.current) setNotice("Modification enregistrée dans le brouillon");
    itemGesture.current = null; routeGesture.current = null; setDraggingId(null);
  }

  function updateSelected(changes: Partial<PlanItem>) {
    if (!selectedId) return;
    setItems((current) => current.map((item) => {
      if (item.id !== selectedId) return item;
      const next = { ...item, ...changes };
      next.w = clamp(next.w, 10, room.width); next.h = clamp(next.h, 10, room.depth);
      next.x = clamp(next.x, 0, room.width - next.w); next.y = clamp(next.y, 0, room.depth - next.h);
      return next;
    }));
  }

  function updateRoom(changes: Partial<RoomSettings>) {
    const next = { ...room, ...changes };
    next.width = clamp(next.width, 200, 900); next.depth = clamp(next.depth, 200, 900); next.height = clamp(next.height, 180, 500);
    setRoom(next);
    setItems((current) => current.map((item) => ({ ...item, w: Math.min(item.w, next.width), h: Math.min(item.h, next.depth), x: clamp(item.x, 0, next.width - Math.min(item.w, next.width)), y: clamp(item.y, 0, next.depth - Math.min(item.h, next.depth)) })));
  }

  function nudgeSelected(event: ReactKeyboardEvent<SVGGElement>, item: PlanItem) {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (directions[event.key]) { event.preventDefault(); const [dx, dy] = directions[event.key]; const step = event.shiftKey ? 10 : 5; updateSelected({ x: clamp(item.x + dx * step, 0, room.width - item.w), y: clamp(item.y + dy * step, 0, room.depth - item.h) }); }
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removeSelected(); }
  }

  function addItem(kind: ItemKind) {
    const spec = specs[kind]; const offset = (items.length * 13) % 90;
    const isOpening = kind === "door" || kind === "window";
    const item: PlanItem = { id: `${kind}-${uid()}`, kind, name: spec.label, x: clamp(195 + offset, 0, room.width - spec.defaultW), y: isOpening ? room.depth - spec.defaultH : clamp(285 + offset / 2, 0, room.depth - spec.defaultH), w: spec.defaultW, h: spec.defaultH, ...(isOpening ? { openingHeight: kind === "door" ? 215 : 110 } : {}) };
    const all = [...items, item]; setItems(all);
    setRoutes((current) => [...current, ...linkedRoutesForItem(all, item, uid())]);
    setSelectedId(item.id); setSelectedRouteId(null); setActiveTab("element"); setNotice(`${spec.label} ajouté au plan`);
  }

  function removeSelected() {
    if (!selectedId) return;
    const item = items.find((candidate) => candidate.id === selectedId);
    setItems((current) => current.filter((candidate) => candidate.id !== selectedId));
    setRoutes((current) => current.filter((route) => route.sourceId !== selectedId && route.targetId !== selectedId));
    setSelectedId(null); setNotice(item ? `${item.name} supprimé` : "Élément supprimé");
  }

  function duplicateSelected() {
    if (!selected) return;
    const duplicate = { ...selected, id: `${selected.kind}-${uid()}`, name: `${selected.name} – copie`, x: clamp(selected.x + 20, 0, room.width - selected.w), y: clamp(selected.y + 20, 0, room.depth - selected.h) };
    const all = [...items, duplicate]; setItems(all); setRoutes((current) => [...current, ...linkedRoutesForItem(all, duplicate, uid())]); setSelectedId(duplicate.id); setNotice("Élément dupliqué");
  }

  function addFreeRoute(kind: NetworkKind) {
    const source = items.find((item) => specs[item.kind].source === kind);
    const start = source ? centerOf(source) : { x: 40, y: 40 }; const end = { x: room.width / 2, y: room.depth / 2 };
    const route: NetworkRoute = { id: `route-${uid()}`, kind, name: `${networkLabel(kind)} libre`, sourceId: source?.id, points: [start, { x: start.x, y: end.y }, end] };
    setRoutes((current) => [...current, route]); setSelectedRouteId(route.id); setSelectedId(null); setActiveTab("networks"); setNotice(`${networkLabel(kind)} libre ajouté`);
  }

  function addRoutePoint() {
    if (!selectedRoute) return;
    const points = effectivePoints(selectedRoute, items); let index = 1; let longest = -1;
    for (let i = 1; i < points.length; i += 1) { const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y); if (length > longest) { longest = length; index = i; } }
    const a = points[index - 1]; const b = points[index]; const next = [...selectedRoute.points]; next.splice(index, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    setRoutes((current) => current.map((route) => route.id === selectedRoute.id ? { ...route, points: next } : route));
  }

  function removeRoutePoint() {
    if (!selectedRoute || selectedRoute.points.length <= 2) return;
    setRoutes((current) => current.map((route) => route.id === selectedRoute.id ? { ...route, points: route.points.filter((_, index) => index !== route.points.length - 2) } : route));
  }

  function resetPlan() {
    setRoom(defaultRoom); setBuild(defaultBuild); setItems(copyItems(defaultItems)); setRoutes(automaticRoutes(defaultItems)); setPrices(defaultPrices); setNetworks(defaultNetworks); setSelectedId("prep"); setSelectedRouteId(null); setCurrentConfigId(null); setConfigName("Configuration péninsule"); setNotice("Plan de départ restauré");
  }

  function configurationSnapshot(id: string, name: string): SavedConfiguration {
    return { id, name, updatedAt: new Date().toISOString(), items: copyItems(items), routes: copyRoutes(routes), room: { ...room }, build: { ...build }, prices: { ...prices }, networks: { ...networks } };
  }
  function saveNewConfiguration() { const name = configName.trim() || `Configuration ${savedConfigs.length + 1}`; const saved = configurationSnapshot(uid(), name); setSavedConfigs((current) => [saved, ...current]); setCurrentConfigId(saved.id); setConfigName(name); setNotice(`« ${name} » sauvegardée`); }
  function updateCurrentConfiguration() { if (!currentConfigId) return; const name = configName.trim() || "Configuration sans nom"; setSavedConfigs((current) => current.map((entry) => entry.id === currentConfigId ? configurationSnapshot(currentConfigId, name) : entry)); setNotice(`« ${name} » mise à jour`); }
  function loadConfiguration(configuration: SavedConfiguration) { const loadedItems = copyItems(configuration.items); setItems(loadedItems); setRoom({ ...defaultRoom, ...(configuration.room ?? {}) }); setBuild({ ...defaultBuild, ...(configuration.build ?? {}) }); setPrices({ ...defaultPrices, ...(configuration.prices ?? {}) }); setNetworks({ ...defaultNetworks, ...configuration.networks }); setRoutes(configuration.routes ? copyRoutes(configuration.routes) : automaticRoutes(loadedItems)); setCurrentConfigId(configuration.id); setConfigName(configuration.name); setSelectedId(null); setSelectedRouteId(null); setNotice(`« ${configuration.name} » chargée`); }
  function deleteConfiguration(id: string) { const removed = savedConfigs.find((entry) => entry.id === id); setSavedConfigs((current) => current.filter((entry) => entry.id !== id)); if (currentConfigId === id) setCurrentConfigId(null); setNotice(removed ? `« ${removed.name} » supprimée` : "Configuration supprimée"); }

  const routePath = (route: NetworkRoute) => effectivePoints(route, items).map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const fmt = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);

  return (
    <main>
      <header className="site-header">
        <div><p className="eyebrow">Atelier cuisine & rénovation</p><h1>Dessine, raccorde et chiffre toute la pièce.</h1><p className="intro">Le plan reste ajustable tant que les cotes ne sont pas définitives. Chaque tracé, ouverture, prise et matériau alimente le métré et le budget.</p></div>
        <div className="header-tools"><button type="button" className="text-action" onClick={resetPlan}>Plan de départ</button><button type="button" className="print-action" onClick={() => window.print()}>Imprimer</button><div className="header-mark" aria-hidden="true">EG</div></div>
      </header>

      <section className="status-strip" aria-live="polite"><span className="status-dot" /><span>{notice}</span><span className="status-spacer" /><strong>{room.width} × {room.depth} × H {room.height} cm</strong><strong>{items.length} éléments</strong><strong className={collisions ? "status-alert" : ""}>{collisions ? `${collisions} chevauchement${collisions > 1 ? "s" : ""}` : "Aucun chevauchement"}</strong></section>

      <section className="workspace">
        <div className="plan-shell">
          <div className="plan-toolbar">
            <div><span className="section-kicker">Plan de la pièce</span><strong>Meubles et points techniques déplaçables · réseaux avec coudes manuels</strong></div>
            <div className="toolbar-toggles"><button type="button" className="room-edit-button" onClick={() => { setSelectedId(null); setSelectedRouteId(null); setActiveTab("element"); }}>Modifier la pièce</button><label><input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} /> Aimant 5 cm</label><label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} /> Grille</label><label><input type="checkbox" checked={showDimensions} onChange={(event) => setShowDimensions(event.target.checked)} /> Cotes</label></div>
          </div>

          <div className="network-legend">{(["electric", "cold", "hot"] as NetworkKind[]).map((kind) => <button type="button" key={kind} className={`legend-chip legend-${kind} ${networks[kind] ? "is-on" : ""}`} aria-pressed={networks[kind]} onClick={() => setNetworks((current) => ({ ...current, [kind]: !current[kind] }))}><span />{networkLabel(kind)} · {networkTotals[kind].toFixed(1)} m</button>)}</div>

          <div className="plan-stage">
            <svg ref={svgRef} viewBox={`-45 -45 ${room.width + 90} ${room.depth + 90}`} role="img" aria-label="Éditeur interactif du plan, des meubles et des réseaux" onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture} onPointerLeave={endGesture}>
              <defs><pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" className="grid-line" fill="none" /></pattern><filter id="module-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#1f2b29" floodOpacity="0.13" /></filter></defs>
              <rect x="0" y="0" width={room.width} height={room.depth} className="floor" onPointerDown={() => { setSelectedId(null); setSelectedRouteId(null); setActiveTab("element"); }} />
              {showGrid && <rect x="0" y="0" width={room.width} height={room.depth} fill="url(#grid)" opacity="0.58" pointerEvents="none" />}
              <rect x="0" y="0" width={room.width} height={room.depth} className="editable-room-wall" pointerEvents="none" />
              <g pointerEvents="none"><text x={room.width / 2} y="-17" textAnchor="middle" className="room-size">{room.width} cm</text><text x="-24" y={room.depth / 2} textAnchor="middle" className="room-size" transform={`rotate(-90 -24 ${room.depth / 2})`}>{room.depth} cm</text></g>

              <g className="network-routes">
                {routes.filter((route) => networks[route.kind]).map((route) => <g key={route.id} className={`network-line network-${route.kind} ${selectedRouteId === route.id ? "selected" : ""}`}><path className="route-hit" d={routePath(route)} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedRouteId(route.id); setSelectedId(null); setActiveTab("networks"); }} /><path d={routePath(route)} pointerEvents="none" /></g>)}
              </g>

              <g className="plan-items">
                {items.map((item) => {
                  const spec = specs[item.kind]; const isSource = Boolean(spec.source); const isOpening = item.kind === "door" || item.kind === "window" || item.kind === "chimney"; const isSelected = item.id === selectedId; const center = centerOf(item);
                  if (isSource) return <g key={item.id} className={`source-item source-${spec.source} ${isSelected ? "selected" : ""}`} role="button" tabIndex={0} aria-label={`${item.name}, déplacer sur le plan`} onPointerDown={(event) => beginItemGesture(event, item, "move")} onKeyDown={(event) => nudgeSelected(event, item)}><circle cx={center.x} cy={center.y} r={item.w / 2} /><text x={center.x} y={center.y} textAnchor="middle" dominantBaseline="middle">{spec.short}</text><text className="source-caption" x={center.x} y={center.y + item.h / 2 + 13} textAnchor="middle">{item.name}</text></g>;
                  return <g key={item.id} className={`plan-item ${isOpening ? `opening-item opening-${item.kind}` : ""} ${isSelected ? "selected" : ""} ${draggingId === item.id ? "dragging" : ""}`} role="button" tabIndex={0} aria-label={`${item.name}, ${Math.round(item.w)} par ${Math.round(item.h)} centimètres`} onPointerDown={(event) => beginItemGesture(event, item, "move")} onKeyDown={(event) => nudgeSelected(event, item)}><rect x={item.x} y={item.y} width={item.w} height={item.h} rx="2" fill={spec.color} /><rect className="item-inner" x={item.x + 3} y={item.y + 3} width={Math.max(0, item.w - 6)} height={Math.max(0, item.h - 6)} rx="1" /><text className="item-label" x={center.x} y={center.y - (showDimensions && item.h > 25 ? 5 : 0)} textAnchor="middle" dominantBaseline="middle">{item.w < 45 ? spec.short : item.name}</text>{showDimensions && item.h > 25 && <text className="item-size" x={center.x} y={center.y + 12} textAnchor="middle" dominantBaseline="middle">{Math.round(item.w)} × {Math.round(item.h)}</text>}{isSelected && <rect className="resize-handle" x={item.x + item.w - 7} y={item.y + item.h - 7} width="14" height="14" rx="2" onPointerDown={(event) => beginItemGesture(event, item, "resize")} />}</g>;
                })}
              </g>

              {selectedRoute && networks[selectedRoute.kind] && <g className={`route-handles route-${selectedRoute.kind}`}>{effectivePoints(selectedRoute, items).map((point, index) => { const anchored = (index === 0 && selectedRoute.sourceId) || (index === selectedRoute.points.length - 1 && selectedRoute.targetId); return <circle key={index} cx={point.x} cy={point.y} r={anchored ? 4 : 7} className={anchored ? "anchored" : "movable"} onPointerDown={(event) => beginRouteGesture(event, selectedRoute, index)} />; })}</g>}
            </svg>
          </div>

          <div className="plan-foot"><div><span>Surface au sol</span><strong>{roomMetrics.floor.toFixed(1)} m²</strong></div><div><span>Murs nets</span><strong>{roomMetrics.wallNet.toFixed(1)} m²</strong></div><div><span>Réseaux cumulés</span><strong>{Object.values(networkTotals).reduce((a, b) => a + b, 0).toFixed(1)} m</strong></div><div><span>Budget matériaux</span><strong>{fmt(grandTotal)}</strong></div></div>
        </div>

        <aside className="control-panel">
          <div className="panel-tabs" role="tablist" aria-label="Outils du configurateur">{([["element", "Sélection"], ["catalog", "Ajouter"], ["networks", "Réseaux"], ["budget", "Budget"], ["saves", "Plans"]] as [PanelTab, string][]).map(([tab, label]) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{label}</button>)}</div>

          {activeTab === "element" && <div className="panel-content" role="tabpanel">
            {selected ? <><div className="panel-heading compact-heading"><span className="section-kicker">Élément sélectionné</span><input className="name-input" value={selected.name} aria-label="Nom de l’élément" onChange={(event) => updateSelected({ name: event.target.value })} /><p>{specs[selected.kind].label}</p></div><div className="dimension-grid"><NumberField label="Position X" value={selected.x} min={0} max={room.width - selected.w} onChange={(x) => updateSelected({ x })} /><NumberField label="Position Y" value={selected.y} min={0} max={room.depth - selected.h} onChange={(y) => updateSelected({ y })} /><NumberField label="Largeur plan" value={selected.w} min={10} max={room.width - selected.x} onChange={(w) => updateSelected({ w })} /><NumberField label="Profondeur plan" value={selected.h} min={10} max={room.depth - selected.y} onChange={(h) => updateSelected({ h })} />{(selected.kind === "door" || selected.kind === "window") && <NumberField label="Hauteur ouverture" value={selected.openingHeight ?? 110} min={20} max={room.height} onChange={(openingHeight) => updateSelected({ openingHeight })} />}</div><div className="button-grid"><button type="button" onClick={() => updateSelected({ w: selected.h, h: selected.w })}>↻ Pivoter 90°</button><button type="button" onClick={duplicateSelected}>＋ Dupliquer</button><button type="button" className="danger-action" onClick={removeSelected}>Supprimer</button></div><div className="item-requirements"><span className="section-kicker">Impact du calcul</span>{specs[selected.kind].electric && <p><i className="dot electric-dot" /> {specs[selected.kind].electric?.protection} · {specs[selected.kind].electric?.section}</p>}{specs[selected.kind].water?.cold && <p><i className="dot cold-dot" /> Conduite PER eau froide</p>}{specs[selected.kind].water?.hot && <p><i className="dot hot-dot" /> Conduite PER eau chaude</p>}{specs[selected.kind].water?.drain && <p><i className="dot drain-dot" /> Évacuation non chiffrée à ce stade</p>}{(selected.kind === "door" || selected.kind === "window") && <p>Déduit {(Math.max(selected.w, selected.h) / 100 * (selected.openingHeight ?? 110) / 100).toFixed(2)} m² de doublage.</p>}{selected.kind === "chimney" && <p>Obstacle conservé libre sur le plan.</p>}</div></> : <div className="room-editor"><div className="panel-heading compact-heading"><span className="section-kicker">Géométrie modifiable</span><h2>Dimensions de la pièce</h2><p>Tu peux saisir des valeurs approximatives maintenant et les corriger plus tard.</p></div><div className="dimension-grid"><NumberField label="Largeur" value={room.width} min={200} max={900} onChange={(width) => updateRoom({ width })} /><NumberField label="Profondeur" value={room.depth} min={200} max={900} onChange={(depth) => updateRoom({ depth })} /><NumberField label="Hauteur sous plafond" value={room.height} min={180} max={500} onChange={(height) => updateRoom({ height })} /></div><div className="room-metrics"><p><span>Sol</span><strong>{roomMetrics.floor.toFixed(2)} m²</strong></p><p><span>Murs bruts</span><strong>{roomMetrics.wallGross.toFixed(2)} m²</strong></p><p><span>Ouvertures déduites</span><strong>− {roomMetrics.openingArea.toFixed(2)} m²</strong></p><p><span>Murs nets</span><strong>{roomMetrics.wallNet.toFixed(2)} m²</strong></p></div><button type="button" className="primary-action wide-action" onClick={() => setActiveTab("catalog")}>Ajouter portes, fenêtres ou obstacle</button></div>}
          </div>}

          {activeTab === "catalog" && <div className="panel-content" role="tabpanel"><div className="panel-heading compact-heading"><span className="section-kicker">Catalogue complet</span><h2>Ajouter au plan</h2><p>Les prises et sorties d’eau créent automatiquement leur tracé depuis le départ correspondant.</p></div><div className="catalog-groups">{catalogGroups.map(({ group, kinds }) => <section key={group}><h3>{group}</h3><div className="catalog-grid">{kinds.map((kind) => <button type="button" key={kind} onClick={() => addItem(kind)}><span className="catalog-swatch" style={{ background: specs[kind].color }} /><span><strong>{specs[kind].label}</strong><small>{specs[kind].defaultW} × {specs[kind].defaultH} cm</small></span><b>＋</b></button>)}</div></section>)}</div></div>}

          {activeTab === "networks" && <div className="panel-content" role="tabpanel"><div className="panel-heading compact-heading"><span className="section-kicker">Tracés techniques</span><h2>Réseaux modifiables</h2><p>Sélectionne une ligne puis déplace ses poignées. Les extrémités liées suivent automatiquement les équipements.</p></div><div className="free-route-actions"><button type="button" onClick={() => addFreeRoute("electric")}>＋ Câble libre</button><button type="button" onClick={() => addFreeRoute("cold")}>＋ PER froid libre</button><button type="button" onClick={() => addFreeRoute("hot")}>＋ PER chaud libre</button></div>{selectedRoute && <div className={`route-inspector route-inspector-${selectedRoute.kind}`}><span className="section-kicker">Tracé sélectionné</span><input value={selectedRoute.name} aria-label="Nom du tracé" onChange={(event) => setRoutes((current) => current.map((route) => route.id === selectedRoute.id ? { ...route, name: event.target.value } : route))} /><p><strong>{routeLength(selectedRoute, items).toFixed(2)} m</strong> avec 15 % de marge · {selectedRoute.points.length} points</p><div><button type="button" onClick={addRoutePoint}>＋ Ajouter un coude</button><button type="button" disabled={selectedRoute.points.length <= 2} onClick={removeRoutePoint}>− Retirer un coude</button><button type="button" className="danger-action" onClick={() => { setRoutes((current) => current.filter((route) => route.id !== selectedRoute.id)); setSelectedRouteId(null); }}>Supprimer le tracé</button></div></div>}<div className="network-cards">{(["electric", "cold", "hot"] as NetworkKind[]).map((kind) => <button type="button" key={kind} className={`network-card ${kind}-card ${networks[kind] ? "active" : ""}`} onClick={() => setNetworks((current) => ({ ...current, [kind]: !current[kind] }))}><span>{networkLabel(kind)}</span><strong>{networkTotals[kind].toFixed(1)} m</strong><small>{routes.filter((route) => route.kind === kind).length} tracé(s)</small></button>)}</div><div className="route-list"><div className="circuit-heading"><span>Tracé</span><span>Longueur</span></div>{routes.map((route) => <button type="button" key={route.id} className={selectedRouteId === route.id ? "current" : ""} onClick={() => { setSelectedRouteId(route.id); setSelectedId(null); }}><span><i className={`dot ${route.kind}-dot`} /><strong>{route.name}</strong></span><b>{routeLength(route, items).toFixed(1)} m</b></button>)}</div><button type="button" className="rebuild-routes" onClick={() => { setRoutes(automaticRoutes(items)); setSelectedRouteId(null); setNotice("Tracés automatiques recalculés"); }}>Recalculer tous les raccordements automatiques</button><div className="technical-note"><strong>Repère de chantier</strong><p>Le calcul est un avant-métré. Les protections, sections, chutes de tension, évacuations et règles de pose restent à valider par un électricien et un plombier.</p></div></div>}

          {activeTab === "budget" && <div className="panel-content budget-panel" role="tabpanel"><div className="panel-heading compact-heading"><span className="section-kicker">Métré & prix modifiables</span><h2>Estimation matériaux</h2><p>Les prix ci-dessous sont des exemples de départ. Modifie chaque prix unitaire selon ton magasin et ta gamme.</p></div><div className="budget-summary">{(["Plomberie", "Électricité", "Cloisons", "Carrelage"] as const).map((category) => <button type="button" key={category}><span>{category}</span><strong>{fmt(categoryTotals[category] ?? 0)}</strong></button>)}<div><span>Total matériaux</span><strong>{fmt(grandTotal)}</strong></div></div><details className="build-settings" open><summary>Paramètres du métré</summary><div className="dimension-grid"><NumberField label="Entraxe montants" value={build.studSpacing} min={30} max={100} onChange={(studSpacing) => setBuild((current) => ({ ...current, studSpacing }))} /><NumberField label="Longueur montants" value={build.studLength} min={200} max={400} onChange={(studLength) => setBuild((current) => ({ ...current, studLength }))} /><NumberField label="Marge cloisons" value={build.waste} min={0} max={30} unit="%" onChange={(waste) => setBuild((current) => ({ ...current, waste }))} /><NumberField label="Marge carrelage" value={build.tileWaste} min={0} max={30} unit="%" onChange={(tileWaste) => setBuild((current) => ({ ...current, tileWaste }))} /></div><label className="ceiling-toggle"><input type="checkbox" checked={build.includeCeiling} onChange={(event) => setBuild((current) => ({ ...current, includeCeiling: event.target.checked }))} /> Inclure le plafond dans isolation et BA13</label></details>{(["Plomberie", "Électricité", "Cloisons", "Carrelage"] as const).map((category) => <section className="material-section" key={category}><h3><span>{category}</span><strong>{fmt(categoryTotals[category] ?? 0)}</strong></h3><div className="material-table">{materials.filter((line) => line.category === category).map((line) => <div className="material-row" key={line.priceKey}><div><strong>{line.label}</strong><small>{line.detail}</small></div><span className="material-qty">{line.qty < 10 && line.unit !== "u" ? line.qty.toFixed(1) : Math.ceil(line.qty)} {line.unit}</span><label><input type="number" min="0" step="0.1" value={prices[line.priceKey]} aria-label={`Prix ${line.label}`} onChange={(event) => { const value = event.currentTarget.valueAsNumber; if (Number.isFinite(value)) setPrices((current) => ({ ...current, [line.priceKey]: value })); }} /><small>€/{line.unit}</small></label><b>{fmt(line.qty * prices[line.priceKey])}</b></div>)}</div></section>)}</div>}

          {activeTab === "saves" && <div className="panel-content" role="tabpanel"><div className="panel-heading compact-heading"><span className="section-kicker">Configurations locales</span><h2>Sauvegarder plusieurs plans</h2><p>Chaque sauvegarde conserve le plan, les tracés, les prix et les paramètres de travaux dans ce navigateur.</p></div><label className="save-name-field"><span>Nom de la configuration</span><input value={configName} onChange={(event) => setConfigName(event.target.value)} placeholder="Ex. Version cotes provisoires" /></label><div className="save-actions"><button type="button" className="primary-action" onClick={saveNewConfiguration}>Enregistrer une copie</button>{currentConfigId && <button type="button" onClick={updateCurrentConfiguration}>Mettre à jour</button>}</div><div className="saved-list"><div className="saved-list-heading"><span>Mes plans</span><strong>{savedConfigs.length}</strong></div>{savedConfigs.length ? savedConfigs.map((configuration) => <article key={configuration.id} className={currentConfigId === configuration.id ? "current" : ""}><button type="button" className="load-save" onClick={() => loadConfiguration(configuration)}><span><strong>{configuration.name}</strong><small>{configuration.items.length} éléments · {new Date(configuration.updatedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small></span><b>Ouvrir</b></button><button type="button" className="delete-save" aria-label={`Supprimer ${configuration.name}`} onClick={() => deleteConfiguration(configuration.id)}>×</button></article>) : <div className="empty-saves"><p>Aucune configuration nommée.</p><small>Le plan courant est conservé comme brouillon automatique.</small></div>}</div></div>}
        </aside>
      </section>

      <section className="help-band"><div><span className="section-kicker">Calcul en cascade</span><h2>Une modification du plan met tout le chantier à jour.</h2></div><ol><li><span>01</span><p><strong>Pièce & ouvertures</strong>Les portes et fenêtres sont déduites des murs.</p></li><li><span>02</span><p><strong>Réseaux libres</strong>Ajoute des coudes ou une attente vers une autre pièce.</p></li><li><span>03</span><p><strong>Métré complet</strong>PER, câbles, rails, montants, isolation, BA13 et carrelage.</p></li><li><span>04</span><p><strong>Prix personnalisés</strong>Chaque quantité et chaque prix restent modifiables.</p></li></ol></section>
    </main>
  );
}
