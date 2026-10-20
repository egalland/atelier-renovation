"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Mode = "plan" | "layout" | "networks" | "budget" | "products";
type Layer = "existing" | "lining";
type NetworkKind = "electric" | "cold" | "hot";
type Point = { x: number; y: number };
type SelectedWall = { layer: Layer; index: number };

type FixtureKind = "door" | "window" | "outlet" | "switch" | "light" | "water-cold" | "water-hot" | "source-electric" | "source-cold" | "source-hot";
type WallFixture = {
  id: string;
  kind: FixtureKind;
  name: string;
  layer: Layer;
  wallIndex: number;
  offset: number;
  width: number;
  height: number;
  mountHeight: number;
  quantity: number;
  unitPrice?: number;
  showPrice?: boolean;
};

type ObjectKind = "cabinet" | "tall" | "worktop" | "appliance" | "sanitary" | "table" | "radiator" | "custom";
type PlanObject = { id: string; kind: ObjectKind; name: string; x: number; y: number; w: number; h: number; unitPrice?: number; showPrice?: boolean };
type NetworkRoute = { id: string; kind: NetworkKind; name: string; points: Point[]; sourceFixtureId?: string; targetFixtureId?: string };

type ProductCategory = "plomberie" | "electricite" | "ossature" | "isolation" | "plaques" | "carrelage" | "consommables";
type Product = {
  id: string;
  name: string;
  reference: string;
  category: ProductCategory;
  store: string;
  url: string;
  price: number;
  coverage: number;
  coverageUnit: string;
  packLabel: string;
  checkedAt: string;
};

type MaterialLine = { key: string; category: ProductCategory; label: string; required: number; unit: string; detail: string };
type BudgetChoice = { productId?: string; manualQuantity?: number };
type BuildSettings = { roomHeight: number; liningDepth: number; rightAngleTolerance: number; autoSquareLining: boolean; studSpacing: number; waste: number; tileWaste: number; includeCeiling: boolean };
type SavedProject = {
  id: string;
  name: string;
  updatedAt: string;
  existing: Point[];
  lining: Point[];
  fixtures: WallFixture[];
  objects: PlanObject[];
  routes: NetworkRoute[];
  build: BuildSettings;
  budgetChoices: Record<string, BudgetChoice>;
  elementSnap?: boolean;
  showPrices?: boolean;
};

type DragState =
  | { type: "wall-point"; layer: Layer; index: number }
  | { type: "fixture"; id: string }
  | { type: "object"; id: string; start: Point; origin: Point }
  | { type: "resize-object"; id: string; start: Point; origin: Point }
  | { type: "route-point"; routeId: string; pointIndex: number; start: Point; origin: Point };

const DRAFT_KEY = "atelier-renovation-draft-v1";
const PRODUCTS_KEY = "atelier-renovation-products-v1";
const SAVES_KEY = "atelier-renovation-saves-v1";
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const formatDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};
const copyPoints = (points: Point[]) => points.map((point) => ({ ...point }));
const copyFixtures = (fixtures: WallFixture[]) => fixtures.map((fixture) => ({ ...fixture }));
const copyObjects = (objects: PlanObject[]) => objects.map((object) => ({ ...object }));
const copyRoutes = (routes: NetworkRoute[]) => routes.map((route) => ({ ...route, points: copyPoints(route.points) }));

const defaultExisting: Point[] = [
  { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 50 }, { x: 380, y: 50 },
  { x: 380, y: 0 }, { x: 530, y: 0 }, { x: 530, y: 500 }, { x: 0, y: 500 },
];

const defaultBuild: BuildSettings = { roomHeight: 250, liningDepth: 8, rightAngleTolerance: 10, autoSquareLining: true, studSpacing: 60, waste: 10, tileWaste: 10, includeCeiling: false };

const fixtureMeta: Record<FixtureKind, { label: string; short: string; color: string; network?: NetworkKind; source?: NetworkKind; opening?: boolean }> = {
  door: { label: "Porte", short: "P", color: "#64748b", opening: true },
  window: { label: "Fenêtre", short: "F", color: "#06b6d4", opening: true },
  outlet: { label: "Prise électrique", short: "○", color: "#f59e0b", network: "electric" },
  switch: { label: "Interrupteur", short: "I", color: "#fbbf24", network: "electric" },
  light: { label: "Point lumineux", short: "✦", color: "#facc15", network: "electric" },
  "water-cold": { label: "Sortie eau froide", short: "EF", color: "#0ea5e9", network: "cold" },
  "water-hot": { label: "Sortie eau chaude", short: "EC", color: "#ef4444", network: "hot" },
  "source-electric": { label: "Tableau électrique", short: "T", color: "#d97706", source: "electric" },
  "source-cold": { label: "Arrivée eau froide", short: "EF", color: "#0284c7", source: "cold" },
  "source-hot": { label: "Départ eau chaude", short: "EC", color: "#dc2626", source: "hot" },
};

const objectMeta: Record<ObjectKind, { label: string; w: number; h: number; color: string }> = {
  cabinet: { label: "Meuble bas", w: 60, h: 60, color: "#64748b" },
  tall: { label: "Colonne", w: 60, h: 60, color: "#475569" },
  worktop: { label: "Plan de travail", w: 180, h: 65, color: "#0f766e" },
  appliance: { label: "Électroménager", w: 60, h: 60, color: "#334155" },
  sanitary: { label: "Équipement sanitaire", w: 90, h: 60, color: "#0891b2" },
  table: { label: "Table / îlot", w: 160, h: 80, color: "#7c3aed" },
  radiator: { label: "Radiateur", w: 100, h: 18, color: "#ef4444" },
  custom: { label: "Volume libre", w: 100, h: 60, color: "#2563eb" },
};

const defaultObjects: PlanObject[] = [
  { id: "cabinet-a", kind: "tall", name: "Rangements", x: 15, y: 72, w: 60, h: 60 },
  { id: "cabinet-b", kind: "worktop", name: "Linéaire principal", x: 90, y: 72, w: 190, h: 65 },
  { id: "island", kind: "table", name: "Îlot / table", x: 230, y: 230, w: 170, h: 85 },
];

const defaultFixtures: WallFixture[] = [
  { id: "door-salon", kind: "door", name: "Double porte", layer: "existing", wallIndex: 6, offset: 0.82, width: 130, height: 215, mountHeight: 0, quantity: 1 },
  { id: "door-entry", kind: "door", name: "Porte d’entrée", layer: "existing", wallIndex: 5, offset: 0.72, width: 90, height: 215, mountHeight: 0, quantity: 1 },
  { id: "window-street", kind: "window", name: "Grande fenêtre", layer: "existing", wallIndex: 7, offset: 0.3, width: 100, height: 110, mountHeight: 90, quantity: 1 },
  { id: "window-high", kind: "window", name: "Fenêtre haute", layer: "existing", wallIndex: 5, offset: 0.29, width: 110, height: 60, mountHeight: 140, quantity: 1 },
  { id: "elec-source", kind: "source-electric", name: "Tableau électrique", layer: "lining", wallIndex: 5, offset: 0.78, width: 20, height: 40, mountHeight: 110, quantity: 1 },
  { id: "cold-source", kind: "source-cold", name: "Arrivée d’eau", layer: "lining", wallIndex: 4, offset: 0.72, width: 10, height: 10, mountHeight: 20, quantity: 1 },
  { id: "hot-source", kind: "source-hot", name: "Départ eau chaude", layer: "lining", wallIndex: 4, offset: 0.86, width: 10, height: 10, mountHeight: 20, quantity: 1 },
  { id: "outlet-a", kind: "outlet", name: "Prises plan de travail", layer: "lining", wallIndex: 4, offset: 0.42, width: 8, height: 8, mountHeight: 110, quantity: 3 },
  { id: "water-a", kind: "water-cold", name: "Sortie eau froide", layer: "lining", wallIndex: 5, offset: 0.28, width: 8, height: 8, mountHeight: 55, quantity: 1 },
  { id: "water-b", kind: "water-hot", name: "Sortie eau chaude", layer: "lining", wallIndex: 5, offset: 0.32, width: 8, height: 8, mountHeight: 55, quantity: 1 },
];

const defaultProducts: Product[] = [
  { id: "prod-per-cold", name: "Couronne PER 16 – 25 m", reference: "EX-PER16-25", category: "plomberie", store: "Exemple", url: "", price: 22.9, coverage: 25, coverageUnit: "m", packLabel: "couronne", checkedAt: "2026-08-16" },
  { id: "prod-per-hot", name: "Couronne PER gainée – 25 m", reference: "EX-PERG-25", category: "plomberie", store: "Exemple", url: "", price: 29.9, coverage: 25, coverageUnit: "m", packLabel: "couronne", checkedAt: "2026-08-16" },
  { id: "prod-cable-15", name: "Câble 1,5 mm² – 100 m", reference: "EX-C15-100", category: "electricite", store: "Exemple", url: "", price: 54.9, coverage: 100, coverageUnit: "m", packLabel: "couronne", checkedAt: "2026-08-16" },
  { id: "prod-cable-25", name: "Câble 2,5 mm² – 100 m", reference: "EX-C25-100", category: "electricite", store: "Exemple", url: "", price: 79.9, coverage: 100, coverageUnit: "m", packLabel: "couronne", checkedAt: "2026-08-16" },
  { id: "prod-sockets", name: "Lot de 3 prises complètes", reference: "EX-PRISE-3", category: "electricite", store: "Exemple", url: "", price: 22, coverage: 3, coverageUnit: "u", packLabel: "lot", checkedAt: "2026-08-16" },
  { id: "prod-rail", name: "Rail métallique 3 m", reference: "EX-RAIL-3", category: "ossature", store: "Exemple", url: "", price: 5.5, coverage: 3, coverageUnit: "m", packLabel: "barre", checkedAt: "2026-08-16" },
  { id: "prod-stud", name: "Montant métallique 2,60 m", reference: "EX-MONT-260", category: "ossature", store: "Exemple", url: "", price: 6.5, coverage: 1, coverageUnit: "u", packLabel: "montant", checkedAt: "2026-08-16" },
  { id: "prod-insulation", name: "Panneaux isolants – paquet 5,76 m²", reference: "EX-ISO-576", category: "isolation", store: "Exemple", url: "", price: 55, coverage: 5.76, coverageUnit: "m²", packLabel: "paquet", checkedAt: "2026-08-16" },
  { id: "prod-ba13", name: "Plaque BA13 120 × 250", reference: "EX-BA13", category: "plaques", store: "Exemple", url: "", price: 12.5, coverage: 3, coverageUnit: "m²", packLabel: "plaque", checkedAt: "2026-08-16" },
  { id: "prod-tile", name: "Carrelage – carton 1,44 m²", reference: "EX-CAR-144", category: "carrelage", store: "Exemple", url: "", price: 28.8, coverage: 1.44, coverageUnit: "m²", packLabel: "carton", checkedAt: "2026-08-16" },
  { id: "prod-adhesive", name: "Colle carrelage – sac 25 kg", reference: "EX-COLLE-25", category: "consommables", store: "Exemple", url: "", price: 22, coverage: 5, coverageUnit: "m²", packLabel: "sac", checkedAt: "2026-08-16" },
];

const preferredProductByMaterial: Record<string, string> = {
  "per-cold": "prod-per-cold",
  "per-hot": "prod-per-hot",
  "cable-15": "prod-cable-15",
  "cable-25": "prod-cable-25",
  sockets: "prod-sockets",
  rails: "prod-rail",
  studs: "prod-stud",
  insulation: "prod-insulation",
  ba13: "prod-ba13",
  tiles: "prod-tile",
  "tile-adhesive": "prod-adhesive",
};

function signedArea(points: Point[]) {
  return points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y; }, 0) / 2;
}
function polygonArea(points: Point[]) { return Math.abs(signedArea(points)) / 10000; }
function perimeter(points: Point[]) { return points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + Math.hypot(next.x - point.x, next.y - point.y); }, 0) / 100; }
function segment(points: Point[], index: number) { return { a: points[index % points.length], b: points[(index + 1) % points.length] }; }
function segmentLength(points: Point[], index: number) { const { a, b } = segment(points, index); return Math.hypot(b.x - a.x, b.y - a.y); }
function segmentAngle(points: Point[], index: number) { const { a, b } = segment(points, index); return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; }
function pointOnSegment(points: Point[], index: number, offset: number) { const { a, b } = segment(points, index); return { x: a.x + (b.x - a.x) * offset, y: a.y + (b.y - a.y) * offset }; }

function lineIntersection(p: Point, r: Point, q: Point, s: Point) {
  const cross = r.x * s.y - r.y * s.x;
  if (Math.abs(cross) < 0.0001) return null;
  const qp = { x: q.x - p.x, y: q.y - p.y };
  const t = (qp.x * s.y - qp.y * s.x) / cross;
  return { x: p.x + t * r.x, y: p.y + t * r.y };
}

function angleDistanceToOrthogonal(angle: number) {
  const normalized = ((angle % 90) + 90) % 90;
  return Math.min(normalized, 90 - normalized);
}

function squareNearOrthogonalWalls(points: Point[], tolerance: number) {
  if (points.length < 3) return copyPoints(points);
  const lines = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const angle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
    const correctedAngle = angleDistanceToOrthogonal(angle) <= tolerance ? Math.round(angle / 90) * 90 : angle;
    const radians = correctedAngle * Math.PI / 180;
    return {
      point: { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 },
      direction: { x: Math.cos(radians), y: Math.sin(radians) },
    };
  });
  return points.map((point, index) => {
    const previous = lines[(index - 1 + lines.length) % lines.length];
    const current = lines[index];
    const intersection = lineIntersection(previous.point, previous.direction, current.point, current.direction);
    return intersection && Number.isFinite(intersection.x) && Number.isFinite(intersection.y)
      ? { x: round(intersection.x), y: round(intersection.y) }
      : { ...point };
  });
}

function offsetPolygon(points: Point[], distance: number) {
  const orientation = signedArea(points) >= 0 ? 1 : -1;
  const normal = (a: Point, b: Point) => { const dx = b.x - a.x; const dy = b.y - a.y; const length = Math.hypot(dx, dy) || 1; return { x: -dy / length * orientation, y: dx / length * orientation }; };
  return points.map((current, index) => {
    const previous = points[(index - 1 + points.length) % points.length]; const next = points[(index + 1) % points.length];
    const n1 = normal(previous, current); const n2 = normal(current, next);
    const p1 = { x: current.x + n1.x * distance, y: current.y + n1.y * distance };
    const p2 = { x: current.x + n2.x * distance, y: current.y + n2.y * distance };
    return lineIntersection(p1, { x: current.x - previous.x, y: current.y - previous.y }, p2, { x: next.x - current.x, y: next.y - current.y }) ?? { x: current.x + (n1.x + n2.x) / 2 * distance, y: current.y + (n1.y + n2.y) / 2 * distance };
  });
}

function createLining(points: Point[], build: BuildSettings) {
  const guide = build.autoSquareLining ? squareNearOrthogonalWalls(points, build.rightAngleTolerance) : points;
  return offsetPolygon(guide, build.liningDepth);
}

function fixtureNetwork(kind: FixtureKind) { return fixtureMeta[kind].network; }
function fixtureSource(kind: FixtureKind) { return fixtureMeta[kind].source; }
function fixturePosition(fixture: WallFixture, existing: Point[], lining: Point[]) { const points = fixture.layer === "existing" ? existing : lining; return pointOnSegment(points, Math.min(fixture.wallIndex, points.length - 1), fixture.offset); }
function networkName(kind: NetworkKind) { return kind === "electric" ? "Électricité" : kind === "cold" ? "Eau froide" : "Eau chaude"; }
function automaticRoutes(fixtures: WallFixture[], existing: Point[], lining: Point[]) {
  return fixtures.flatMap((target) => {
    const kind = fixtureNetwork(target.kind); if (!kind) return [];
    const source = fixtures.find((fixture) => fixtureSource(fixture.kind) === kind); if (!source) return [];
    const start = fixturePosition(source, existing, lining); const end = fixturePosition(target, existing, lining);
    return [{ id: `auto-${kind}-${target.id}`, kind, name: `${networkName(kind)} · ${target.name}`, sourceFixtureId: source.id, targetFixtureId: target.id, points: [start, { x: start.x, y: end.y }, end] } as NetworkRoute];
  });
}
function effectiveRoutePoints(route: NetworkRoute, fixtures: WallFixture[], existing: Point[], lining: Point[]) {
  const points = copyPoints(route.points); const source = fixtures.find((fixture) => fixture.id === route.sourceFixtureId); const target = fixtures.find((fixture) => fixture.id === route.targetFixtureId);
  if (source && points.length) points[0] = fixturePosition(source, existing, lining);
  if (target && points.length) points[points.length - 1] = fixturePosition(target, existing, lining);
  return points;
}
function routeLength(route: NetworkRoute, fixtures: WallFixture[], existing: Point[], lining: Point[]) {
  const points = effectiveRoutePoints(route, fixtures, existing, lining);
  return points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0) / 100 * 1.15;
}

function NumberInput({ label, value, unit = "cm", min = 0, max = 9999, step = 1, onChange }: { label: string; value: number; unit?: string; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="number-input"><span>{label}</span><div><input type="number" min={min} max={max} step={step} value={round(value, 2)} onChange={(event) => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next)) onChange(next); }} /><small>{unit}</small></div></label>;
}

export default function Home() {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("plan");
  const [existing, setExisting] = useState<Point[]>(defaultExisting);
  const [build, setBuild] = useState<BuildSettings>(defaultBuild);
  const [lining, setLining] = useState<Point[]>(() => createLining(defaultExisting, defaultBuild));
  const [fixtures, setFixtures] = useState<WallFixture[]>(defaultFixtures);
  const [objects, setObjects] = useState<PlanObject[]>(defaultObjects);
  const [routes, setRoutes] = useState<NetworkRoute[]>(() => automaticRoutes(defaultFixtures, defaultExisting, createLining(defaultExisting, defaultBuild)));
  const [products, setProducts] = useState<Product[]>(defaultProducts);
  const [budgetChoices, setBudgetChoices] = useState<Record<string, BudgetChoice>>({});
  const [selectedWall, setSelectedWall] = useState<SelectedWall | null>({ layer: "existing", index: 0 });
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [networkFilter, setNetworkFilter] = useState<NetworkKind>("electric");
  const [orthogonalSnap, setOrthogonalSnap] = useState(true);
  const [elementSnap, setElementSnap] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showPrices, setShowPrices] = useState(false);
  const [projectName, setProjectName] = useState("Projet rénovation");
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [notice, setNotice] = useState("Toutes les modifications sont enregistrées localement");
  const [hydrated, setHydrated] = useState(false);
  const [newProduct, setNewProduct] = useState<Omit<Product, "id">>({ name: "", reference: "", category: "consommables", store: "", url: "", price: 0, coverage: 1, coverageUnit: "u", packLabel: "unité", checkedAt: new Date().toISOString().slice(0, 10) });

  const selectedFixture = fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? null;
  const selectedObject = objects.find((object) => object.id === selectedObjectId) ?? null;
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? null;
  const layerPoints = selectedWall?.layer === "lining" ? lining : existing;

  const bounds = useMemo(() => {
    const all = [...existing, ...lining, ...objects.flatMap((object) => [{ x: object.x, y: object.y }, { x: object.x + object.w, y: object.y + object.h }])];
    return { maxX: Math.max(600, ...all.map((point) => point.x)) + 50, maxY: Math.max(550, ...all.map((point) => point.y)) + 50 };
  }, [existing, lining, objects]);

  const routeTotals = useMemo(() => ({
    electric: routes.filter((route) => route.kind === "electric").reduce((sum, route) => sum + routeLength(route, fixtures, existing, lining), 0),
    cold: routes.filter((route) => route.kind === "cold").reduce((sum, route) => sum + routeLength(route, fixtures, existing, lining), 0),
    hot: routes.filter((route) => route.kind === "hot").reduce((sum, route) => sum + routeLength(route, fixtures, existing, lining), 0),
  }), [routes, fixtures, existing, lining]);

  const metrics = useMemo(() => {
    const floor = polygonArea(existing); const existingPerimeter = perimeter(existing); const liningPerimeter = perimeter(lining);
    const openingArea = fixtures.filter((fixture) => fixtureMeta[fixture.kind].opening).reduce((sum, fixture) => sum + fixture.width / 100 * fixture.height / 100, 0);
    const wallNet = Math.max(0, liningPerimeter * build.roomHeight / 100 - openingArea);
    return { floor, existingPerimeter, liningPerimeter, openingArea, wallNet };
  }, [existing, lining, fixtures, build.roomHeight]);

  const materials = useMemo<MaterialLine[]>(() => {
    const factor = 1 + build.waste / 100; const tileArea = metrics.floor * (1 + build.tileWaste / 100);
    const doorWidth = fixtures.filter((fixture) => fixture.kind === "door").reduce((sum, fixture) => sum + fixture.width / 100, 0);
    const railLength = Math.max(0, metrics.liningPerimeter * 2 - doorWidth) * factor;
    const studCount = Math.ceil(metrics.liningPerimeter / (build.studSpacing / 100)) + fixtures.filter((fixture) => fixtureMeta[fixture.kind].opening).length * 2;
    const wallArea = (metrics.wallNet + (build.includeCeiling ? metrics.floor : 0)) * factor;
    const socketCount = fixtures.filter((fixture) => fixture.kind === "outlet").reduce((sum, fixture) => sum + fixture.quantity, 0);
    return [
      { key: "per-cold", category: "plomberie", label: "Tube PER eau froide", required: routeTotals.cold, unit: "m", detail: "Tracés + 15 %" },
      { key: "per-hot", category: "plomberie", label: "Tube PER eau chaude", required: routeTotals.hot, unit: "m", detail: "Tracés + 15 %" },
      { key: "cable-15", category: "electricite", label: "Câble 1,5 mm²", required: routeTotals.electric * 0.25, unit: "m", detail: "Part éclairage estimée" },
      { key: "cable-25", category: "electricite", label: "Câble 2,5 mm²", required: routeTotals.electric * 0.75, unit: "m", detail: "Part prises estimée" },
      { key: "sockets", category: "electricite", label: "Prises complètes", required: socketCount, unit: "u", detail: "Quantité posée sur les murs" },
      { key: "rails", category: "ossature", label: "Rails métalliques", required: railLength, unit: "m", detail: "Sol + plafond, portes déduites" },
      { key: "studs", category: "ossature", label: "Montants métalliques", required: studCount, unit: "u", detail: `Entraxe ${build.studSpacing} cm + renforts` },
      { key: "insulation", category: "isolation", label: "Isolation", required: wallArea, unit: "m²", detail: "Murs nets avec marge" },
      { key: "ba13", category: "plaques", label: "Plaques de plâtre", required: wallArea, unit: "m²", detail: "Surface nette avec marge" },
      { key: "tiles", category: "carrelage", label: "Revêtement de sol", required: tileArea, unit: "m²", detail: `Sol + ${build.tileWaste} %` },
      { key: "tile-adhesive", category: "consommables", label: "Colle carrelage", required: tileArea, unit: "m²", detail: "Couverture à prévoir" },
    ];
  }, [metrics, routeTotals, fixtures, build]);

  const resolvedBudget = useMemo(() => materials.map((line) => {
    const compatibles = products.filter((product) => product.category === line.category && product.coverageUnit === line.unit);
    const choice = budgetChoices[line.key] ?? {};
    const selectedProduct = products.find((entry) => entry.id === choice.productId);
    const preferredProduct = compatibles.find((entry) => entry.id === preferredProductByMaterial[line.key]);
    const product = selectedProduct ?? preferredProduct ?? compatibles[0] ?? null;
    const automaticQuantity = product ? Math.max(0, Math.ceil(line.required / Math.max(product.coverage, 0.0001))) : 0;
    const quantity = choice.manualQuantity ?? automaticQuantity;
    return { ...line, compatibles, product, automaticQuantity, quantity, purchased: product ? quantity * product.coverage : 0, remainder: product ? quantity * product.coverage - line.required : 0, total: product ? quantity * product.price : 0 };
  }), [materials, products, budgetChoices]);
  const grandTotal = resolvedBudget.reduce((sum, line) => sum + line.total, 0);
  const elementTotal = objects.reduce((sum, object) => sum + (object.unitPrice ?? 0), 0)
    + fixtures.reduce((sum, fixture) => sum + (fixture.unitPrice ?? 0) * fixture.quantity, 0);
  const renovationTotal = grandTotal + elementTotal;
  const correctedWallCount = existing.filter((_, index) => {
    const angle = segmentAngle(existing, index);
    const delta = angleDistanceToOrthogonal(angle);
    return delta > 0.05 && delta <= build.rightAngleTolerance;
  }).length;

  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
      if (draft?.existing?.length >= 3) {
        const restoredBuild = { ...defaultBuild, ...(draft.build ?? {}) };
        setExisting(copyPoints(draft.existing)); setLining(copyPoints(draft.lining?.length >= 3 ? draft.lining : createLining(draft.existing, restoredBuild)));
        setFixtures(copyFixtures(draft.fixtures ?? [])); setObjects(copyObjects(draft.objects ?? [])); setRoutes(copyRoutes(draft.routes ?? []));
        setBuild(restoredBuild); setBudgetChoices(draft.budgetChoices ?? {}); setProjectName(draft.projectName ?? "Projet rénovation");
        setElementSnap(draft.elementSnap ?? true); setShowPrices(draft.showPrices ?? false);
      }
      const storedProducts = JSON.parse(localStorage.getItem(PRODUCTS_KEY) ?? "null"); if (Array.isArray(storedProducts)) setProducts(storedProducts);
      const saves = JSON.parse(localStorage.getItem(SAVES_KEY) ?? "[]"); if (Array.isArray(saves)) setSavedProjects(saves);
    } catch { setNotice("Le brouillon précédent était illisible ; un nouveau projet a été ouvert."); }
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem(DRAFT_KEY, JSON.stringify({ projectName, existing, lining, fixtures, objects, routes, build, budgetChoices, elementSnap, showPrices })); }, [hydrated, projectName, existing, lining, fixtures, objects, routes, build, budgetChoices, elementSnap, showPrices]);
  useEffect(() => { if (hydrated) localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products)); }, [hydrated, products]);
  useEffect(() => { if (hydrated) localStorage.setItem(SAVES_KEY, JSON.stringify(savedProjects)); }, [hydrated, savedProjects]);

  function pointFromEvent(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current; const matrix = svg?.getScreenCTM(); if (!svg || !matrix) return null;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY; return point.matrixTransform(matrix.inverse());
  }
  function clearSelection(except?: "wall" | "fixture" | "object" | "route") {
    if (except !== "wall") setSelectedWall(null); if (except !== "fixture") setSelectedFixtureId(null); if (except !== "object") setSelectedObjectId(null); if (except !== "route") setSelectedRouteId(null);
  }
  function setPoints(layer: Layer, updater: (points: Point[]) => Point[]) { if (layer === "existing") setExisting((current) => updater(current)); else setLining((current) => updater(current)); }
  function snapPoint(point: Point, points: Point[], index: number) {
    if (!orthogonalSnap) return { x: round(point.x), y: round(point.y) };
    const previous = points[(index - 1 + points.length) % points.length]; const next = points[(index + 1) % points.length]; let x = point.x; let y = point.y;
    if (Math.abs(x - previous.x) < 10) x = previous.x; if (Math.abs(y - previous.y) < 10) y = previous.y;
    if (Math.abs(x - next.x) < 10) x = next.x; if (Math.abs(y - next.y) < 10) y = next.y;
    return { x: round(Math.max(0, x)), y: round(Math.max(0, y)) };
  }
  function nearestGuide(value: number, candidates: number[], tolerance = 7) {
    let best = value; let bestDistance = tolerance + 1;
    candidates.forEach((candidate) => { const distance = Math.abs(candidate - value); if (distance <= tolerance && distance < bestDistance) { best = candidate; bestDistance = distance; } });
    return best;
  }
  function snapObjectPosition(object: PlanObject, current: PlanObject[], rawX: number, rawY: number) {
    if (!elementSnap) return { x: round(Math.max(0, rawX)), y: round(Math.max(0, rawY)) };
    const wallGuides = [...existing, ...lining];
    const otherObjects = current.filter((entry) => entry.id !== object.id);
    const xGuides = [...wallGuides.map((point) => point.x), ...otherObjects.flatMap((entry) => [entry.x, entry.x + entry.w / 2, entry.x + entry.w])];
    const yGuides = [...wallGuides.map((point) => point.y), ...otherObjects.flatMap((entry) => [entry.y, entry.y + entry.h / 2, entry.y + entry.h])];
    const xCandidates = xGuides.flatMap((guide) => [guide, guide - object.w / 2, guide - object.w]);
    const yCandidates = yGuides.flatMap((guide) => [guide, guide - object.h / 2, guide - object.h]);
    const gridX = Math.round(rawX / 5) * 5; const gridY = Math.round(rawY / 5) * 5;
    return { x: round(Math.max(0, nearestGuide(gridX, xCandidates))), y: round(Math.max(0, nearestGuide(gridY, yCandidates))) };
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const pointer = pointFromEvent(event); const drag = dragRef.current; if (!pointer || !drag) return;
    if (drag.type === "wall-point") setPoints(drag.layer, (points) => points.map((point, index) => index === drag.index ? snapPoint(pointer, points, index) : point));
    if (drag.type === "fixture") setFixtures((current) => current.map((fixture) => {
      if (fixture.id !== drag.id) return fixture; const points = fixture.layer === "existing" ? existing : lining; const wall = segment(points, fixture.wallIndex); const dx = wall.b.x - wall.a.x; const dy = wall.b.y - wall.a.y; const squared = dx * dx + dy * dy || 1;
      const wallLength = Math.sqrt(squared); let offset = clamp(((pointer.x - wall.a.x) * dx + (pointer.y - wall.a.y) * dy) / squared, 0.02, 0.98);
      if (elementSnap) offset = clamp(Math.round(offset * wallLength / 5) * 5 / wallLength, 0.02, 0.98);
      return { ...fixture, offset };
    }));
    if (drag.type === "object" || drag.type === "resize-object") setObjects((current) => current.map((object) => {
      if (object.id !== drag.id) return object; const dx = pointer.x - drag.start.x; const dy = pointer.y - drag.start.y;
      if (drag.type === "object") return { ...object, ...snapObjectPosition(object, current, drag.origin.x + dx, drag.origin.y + dy) };
      const width = Math.max(20, drag.origin.x + dx); const height = Math.max(20, drag.origin.y + dy);
      return { ...object, w: elementSnap ? Math.round(width / 5) * 5 : round(width), h: elementSnap ? Math.round(height / 5) * 5 : round(height) };
    }));
    if (drag.type === "route-point") setRoutes((current) => current.map((route) => route.id === drag.routeId ? { ...route, points: route.points.map((point, index) => index === drag.pointIndex ? { x: Math.max(0, round(drag.origin.x + pointer.x - drag.start.x)), y: Math.max(0, round(drag.origin.y + pointer.y - drag.start.y)) } : point) } : route));
  }
  function endDrag() { if (dragRef.current) setNotice("Modification enregistrée"); dragRef.current = null; }

  function beginPointDrag(event: ReactPointerEvent<SVGCircleElement>, layer: Layer, index: number) { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { type: "wall-point", layer, index }; setSelectedWall({ layer, index: Math.max(0, index - 1) }); clearSelection("wall"); }
  function beginFixtureDrag(event: ReactPointerEvent<SVGGElement>, fixture: WallFixture) { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { type: "fixture", id: fixture.id }; setSelectedFixtureId(fixture.id); clearSelection("fixture"); }
  function beginObjectDrag(event: ReactPointerEvent<SVGGElement | SVGRectElement>, object: PlanObject, type: "object" | "resize-object") { const pointer = pointFromEvent(event); if (!pointer) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { type, id: object.id, start: pointer, origin: type === "object" ? { x: object.x, y: object.y } : { x: object.w, y: object.h } }; setSelectedObjectId(object.id); clearSelection("object"); }

  function updateSelectedWallLength(length: number) {
    if (!selectedWall) return; setPoints(selectedWall.layer, (points) => { const next = copyPoints(points); const { a, b } = segment(points, selectedWall.index); const angle = Math.atan2(b.y - a.y, b.x - a.x); next[(selectedWall.index + 1) % points.length] = { x: round(a.x + Math.cos(angle) * length), y: round(a.y + Math.sin(angle) * length) }; return next; });
  }
  function updateSelectedWallAngle(angleDegrees: number) {
    if (!selectedWall) return; setPoints(selectedWall.layer, (points) => { const next = copyPoints(points); const { a } = segment(points, selectedWall.index); const length = segmentLength(points, selectedWall.index); const angle = angleDegrees * Math.PI / 180; next[(selectedWall.index + 1) % points.length] = { x: round(a.x + Math.cos(angle) * length), y: round(a.y + Math.sin(angle) * length) }; return next; });
  }
  function addWallPoint() { if (!selectedWall) return; setPoints(selectedWall.layer, (points) => { const next = copyPoints(points); const wall = segment(points, selectedWall.index); next.splice(selectedWall.index + 1, 0, { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }); return next; }); setNotice("Point ajouté au mur"); }
  function addRecess() {
    if (!selectedWall) return; setPoints(selectedWall.layer, (points) => { const next = copyPoints(points); const { a, b } = segment(points, selectedWall.index); const dx = b.x - a.x; const dy = b.y - a.y; const length = Math.hypot(dx, dy) || 1; const tx = dx / length; const ty = dy / length; const nx = -ty; const ny = tx; const start = 0.32; const end = 0.68; const depth = 30;
      next.splice(selectedWall.index + 1, 0, { x: a.x + dx * start, y: a.y + dy * start }, { x: a.x + dx * start + nx * depth, y: a.y + dy * start + ny * depth }, { x: a.x + dx * end + nx * depth, y: a.y + dy * end + ny * depth }, { x: a.x + dx * end, y: a.y + dy * end }); return next; }); setNotice("Décroché ajouté — déplace ses points pour l’ajuster");
  }
  function deleteWallPoint() { if (!selectedWall || layerPoints.length <= 3) return; const deleteIndex = (selectedWall.index + 1) % layerPoints.length; setPoints(selectedWall.layer, (points) => points.filter((_, index) => index !== deleteIndex)); setSelectedWall({ ...selectedWall, index: Math.max(0, selectedWall.index - 1) }); }
  function alignWall(axis: "horizontal" | "vertical") { if (!selectedWall) return; setPoints(selectedWall.layer, (points) => { const next = copyPoints(points); const { a, b } = segment(points, selectedWall.index); next[(selectedWall.index + 1) % points.length] = axis === "horizontal" ? { x: b.x, y: a.y } : { x: a.x, y: b.y }; return next; }); }
  function regenerateLining() { const next = createLining(existing, build); setLining(next); setFixtures((current) => current.map((fixture) => fixture.layer === "lining" ? { ...fixture, wallIndex: Math.min(fixture.wallIndex, next.length - 1) } : fixture)); setRoutes((current) => automaticRoutes(fixtures, existing, next).concat(current.filter((route) => !route.targetFixtureId))); setNotice(build.autoSquareLining ? `${correctedWallCount} mur${correctedWallCount > 1 ? "s" : ""} redressé${correctedWallCount > 1 ? "s" : ""} pour les rails et le BA13` : "Doublage BA13 recalculé en suivant le bâti"); }

  function addFixture(kind: FixtureKind) {
    const layer: Layer = kind === "door" || kind === "window" ? "existing" : "lining"; const points = layer === "existing" ? existing : lining; const wallIndex = selectedWall?.layer === layer ? selectedWall.index : 0;
    const fixture: WallFixture = { id: `${kind}-${uid()}`, kind, name: fixtureMeta[kind].label, layer, wallIndex: Math.min(wallIndex, points.length - 1), offset: 0.5, width: kind === "door" ? 90 : kind === "window" ? 120 : 8, height: kind === "door" ? 215 : kind === "window" ? 110 : 8, mountHeight: kind === "window" ? 90 : kind === "outlet" ? 30 : 0, quantity: 1, unitPrice: 0, showPrice: true };
    const all = [...fixtures, fixture]; setFixtures(all); const network = fixtureNetwork(kind); if (network) setRoutes((current) => [...current, ...automaticRoutes(all, existing, lining).filter((route) => route.targetFixtureId === fixture.id)]); setSelectedFixtureId(fixture.id); clearSelection("fixture"); setNotice(`${fixture.name} fixé au mur`);
  }
  function updateFixture(changes: Partial<WallFixture>) { if (selectedFixtureId) setFixtures((current) => current.map((fixture) => fixture.id === selectedFixtureId ? { ...fixture, ...changes } : fixture)); }
  function deleteFixture() { if (!selectedFixtureId) return; setFixtures((current) => current.filter((fixture) => fixture.id !== selectedFixtureId)); setRoutes((current) => current.filter((route) => route.sourceFixtureId !== selectedFixtureId && route.targetFixtureId !== selectedFixtureId)); setSelectedFixtureId(null); }

  function addObject(kind: ObjectKind) { const meta = objectMeta[kind]; const object = { id: `${kind}-${uid()}`, kind, name: meta.label, x: 170, y: 190, w: meta.w, h: meta.h, unitPrice: 0, showPrice: true }; setObjects((current) => [...current, object]); setSelectedObjectId(object.id); clearSelection("object"); }
  function updateObject(changes: Partial<PlanObject>) { if (selectedObjectId) setObjects((current) => current.map((object) => object.id === selectedObjectId ? { ...object, ...changes } : object)); }

  function addFreeRoute(kind: NetworkKind) { const source = fixtures.find((fixture) => fixtureSource(fixture.kind) === kind); const start = source ? fixturePosition(source, existing, lining) : { x: 40, y: 40 }; const end = { x: 300, y: 260 }; const route = { id: `route-${uid()}`, kind, name: `${networkName(kind)} libre`, sourceFixtureId: source?.id, points: [start, { x: start.x, y: end.y }, end] }; setRoutes((current) => [...current, route]); setSelectedRouteId(route.id); clearSelection("route"); }
  function addRoutePoint() { if (!selectedRoute) return; const points = effectiveRoutePoints(selectedRoute, fixtures, existing, lining); const index = Math.max(1, points.length - 1); const a = points[index - 1]; const b = points[index]; setRoutes((current) => current.map((route) => route.id === selectedRoute.id ? { ...route, points: [...route.points.slice(0, index), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ...route.points.slice(index)] } : route)); }

  function resetPlan() {
    if (!window.confirm("Créer un nouveau plan ? Le brouillon actuel sera remplacé, mais tes configurations sauvegardées et ta bibliothèque de produits resteront disponibles.")) return;
    const nextExisting = copyPoints(defaultExisting); const nextBuild = { ...defaultBuild }; const nextLining = createLining(nextExisting, nextBuild); const nextFixtures = copyFixtures(defaultFixtures);
    setProjectName("Nouveau projet"); setExisting(nextExisting); setBuild(nextBuild); setLining(nextLining); setFixtures(nextFixtures); setObjects(copyObjects(defaultObjects)); setRoutes(automaticRoutes(nextFixtures, nextExisting, nextLining)); setBudgetChoices({});
    setElementSnap(true); setShowPrices(false); setMode("plan"); setSelectedWall({ layer: "existing", index: 0 }); setSelectedFixtureId(null); setSelectedObjectId(null); setSelectedRouteId(null); setNotice("Nouveau plan créé — les sauvegardes et produits sont conservés");
  }
  function saveProject() { const name = projectName.trim() || "Projet sans nom"; const saved: SavedProject = { id: uid(), name, updatedAt: new Date().toISOString(), existing: copyPoints(existing), lining: copyPoints(lining), fixtures: copyFixtures(fixtures), objects: copyObjects(objects), routes: copyRoutes(routes), build: { ...build }, budgetChoices: { ...budgetChoices }, elementSnap, showPrices }; setSavedProjects((current) => [saved, ...current]); setNotice(`« ${name} » sauvegardé`); }
  function loadProject(project: SavedProject) { setProjectName(project.name); setExisting(copyPoints(project.existing)); setLining(copyPoints(project.lining)); setFixtures(copyFixtures(project.fixtures)); setObjects(copyObjects(project.objects)); setRoutes(copyRoutes(project.routes)); setBuild({ ...defaultBuild, ...project.build }); setBudgetChoices({ ...project.budgetChoices }); setElementSnap(project.elementSnap ?? true); setShowPrices(project.showPrices ?? false); setNotice(`« ${project.name} » chargé`); }

  function addProduct() { if (!newProduct.name.trim()) return; setProducts((current) => [{ ...newProduct, id: uid() }, ...current]); setNewProduct((current) => ({ ...current, name: "", reference: "", price: 0 })); setNotice("Produit ajouté à la bibliothèque"); }
  function updateProduct(id: string, changes: Partial<Product>) { setProducts((current) => current.map((product) => product.id === id ? { ...product, ...changes } : product)); }
  function importProducts(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const text = String(reader.result ?? ""); const lines = text.split(/\r?\n/).filter(Boolean); const delimiter = lines[0]?.includes(";") ? ";" : ","; const imported = lines.slice(1).map((line) => { const [name, reference, category, store, price, coverage, unit, packLabel, url] = line.split(delimiter).map((value) => value.trim()); if (!name) return null; return { id: uid(), name, reference: reference ?? "", category: (category as ProductCategory) || "consommables", store: store ?? "", price: Number(String(price).replace(",", ".")) || 0, coverage: Number(String(coverage).replace(",", ".")) || 1, coverageUnit: unit || "u", packLabel: packLabel || "unité", url: url ?? "", checkedAt: new Date().toISOString().slice(0, 10) } as Product; }).filter(Boolean) as Product[]; setProducts((current) => [...imported, ...current]); setNotice(`${imported.length} produits importés`); } catch { setNotice("Import impossible : vérifie le format CSV"); } }; reader.readAsText(file); event.target.value = ""; }

  const wallPath = (points: Point[]) => points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ") + " Z";
  const routePath = (route: NetworkRoute) => effectiveRoutePoints(route, fixtures, existing, lining).map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const euros = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand"><div className="brand-mark">AR</div><div><strong>Atelier Rénovation</strong><span>Plan · réseaux · matériaux</span></div></div>
        <nav className="mode-nav" aria-label="Modes de travail">{([["plan", "Plan"], ["layout", "Aménagement"], ["networks", "Réseaux"], ["budget", "Budget"], ["products", "Produits"]] as [Mode, string][]).map(([value, label]) => <button type="button" key={value} className={mode === value ? "active" : ""} onClick={() => { setMode(value); clearSelection(); }}>{label}</button>)}</nav>
        <div className="project-actions"><input value={projectName} aria-label="Nom du projet" onChange={(event) => setProjectName(event.target.value)} /><button type="button" className="new-plan-button" onClick={resetPlan}>Nouveau plan</button><button type="button" className="save-button" onClick={saveProject}>Sauvegarder</button><details className="project-menu"><summary aria-label="Projets sauvegardés">{savedProjects.length}</summary><div><strong>Projets sauvegardés</strong>{savedProjects.length ? savedProjects.map((project) => <button type="button" key={project.id} onClick={() => loadProject(project)}><span>{project.name}</span><small>{new Date(project.updatedAt).toLocaleDateString("fr-FR")}</small></button>) : <p>Aucun projet nommé</p>}</div></details></div>
      </header>

      <section className="context-bar"><div><span className={`mode-dot mode-dot-${mode}`} /> <strong>{mode === "plan" ? "Structure du bâti" : mode === "layout" ? "Volumes et aménagement" : mode === "networks" ? `${networkName(networkFilter)} uniquement` : mode === "budget" ? "Métré et achats" : "Bibliothèque de produits"}</strong><small>{notice}</small></div><div className="quick-metrics"><span><b>{metrics.floor.toFixed(1)}</b> m² au sol</span><span><b>{metrics.wallNet.toFixed(1)}</b> m² de murs nets</span><span><b>{euros(renovationTotal)}</b> estimés</span></div></section>

      <section className={`main-workspace mode-${mode}`}>
        <div className="canvas-panel">
          <div className="canvas-toolbar">
            <div className="layer-legend"><span><i className="legend-existing" />Mur existant</span><span><i className="legend-lining" />Doublage BA13</span>{mode === "networks" && <span><i className={`legend-${networkFilter}`} />{networkName(networkFilter)}</span>}</div>
            <div><label><input type="checkbox" checked={showDimensions} onChange={(event) => setShowDimensions(event.target.checked)} /> Cotes</label><label><input type="checkbox" checked={showPrices} onChange={(event) => setShowPrices(event.target.checked)} /> Prix</label>{mode === "plan" ? <label><input type="checkbox" checked={orthogonalSnap} onChange={(event) => setOrthogonalSnap(event.target.checked)} /> Aimant murs 90°</label> : <label><input type="checkbox" checked={elementSnap} onChange={(event) => setElementSnap(event.target.checked)} /> Aimant éléments 5 cm</label>}<button type="button" onClick={() => window.print()}>Imprimer</button></div>
          </div>

          <div className="drawing-stage">
            <svg ref={svgRef} viewBox={`-55 -55 ${bounds.maxX + 60} ${bounds.maxY + 60}`} role="img" aria-label="Plan interactif de rénovation" onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag} onPointerCancel={endDrag}>
              <defs><pattern id="cad-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" /></pattern><filter id="soft-shadow"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity=".16" /></filter></defs>
              <rect x="-40" y="-40" width={bounds.maxX + 20} height={bounds.maxY + 20} className="canvas-bg" onPointerDown={() => clearSelection()} />
              <rect x="-40" y="-40" width={bounds.maxX + 20} height={bounds.maxY + 20} fill="url(#cad-grid)" pointerEvents="none" />
              <path d={wallPath(existing)} className="room-fill" pointerEvents="none" />

              {existing.map((_, index) => { const wall = segment(existing, index); const selected = selectedWall?.layer === "existing" && selectedWall.index === index; return <g key={`existing-${index}`}><line className="wall-hit" x1={wall.a.x} y1={wall.a.y} x2={wall.b.x} y2={wall.b.y} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedWall({ layer: "existing", index }); clearSelection("wall"); }} /><line className={`wall-line existing-wall ${selected ? "selected" : ""}`} x1={wall.a.x} y1={wall.a.y} x2={wall.b.x} y2={wall.b.y} pointerEvents="none" />{showDimensions && <g className="wall-dimension" transform={`translate(${(wall.a.x + wall.b.x) / 2},${(wall.a.y + wall.b.y) / 2})`}><rect x="-23" y="-9" width="46" height="18" rx="8" /><text textAnchor="middle" dominantBaseline="middle">{Math.round(segmentLength(existing, index))} cm</text></g>}</g>; })}
              {lining.map((_, index) => { const wall = segment(lining, index); const selected = selectedWall?.layer === "lining" && selectedWall.index === index; return <g key={`lining-${index}`}><line className="wall-hit" x1={wall.a.x} y1={wall.a.y} x2={wall.b.x} y2={wall.b.y} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedWall({ layer: "lining", index }); clearSelection("wall"); }} /><line className={`wall-line lining-wall ${selected ? "selected" : ""}`} x1={wall.a.x} y1={wall.a.y} x2={wall.b.x} y2={wall.b.y} pointerEvents="none" /></g>; })}

              {mode === "plan" && (selectedWall?.layer === "existing" ? existing : lining).map((point, index) => <circle key={`vertex-${index}`} className={`wall-vertex ${selectedWall?.layer === "lining" ? "lining-vertex" : ""}`} cx={point.x} cy={point.y} r="6" onPointerDown={(event) => beginPointDrag(event, selectedWall?.layer ?? "existing", index)} />)}

              {fixtures.filter((fixture) => mode === "plan" ? fixtureMeta[fixture.kind].opening : mode === "networks" ? fixtureNetwork(fixture.kind) === networkFilter || fixtureSource(fixture.kind) === networkFilter : mode === "layout" ? fixtureMeta[fixture.kind].opening : true).map((fixture) => {
                const points = fixture.layer === "existing" ? existing : lining; const wall = segment(points, Math.min(fixture.wallIndex, points.length - 1)); const position = fixturePosition(fixture, existing, lining); const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1; const tx = (wall.b.x - wall.a.x) / length; const ty = (wall.b.y - wall.a.y) / length; const half = fixture.width / 2; const opening = fixtureMeta[fixture.kind].opening; const selected = selectedFixtureId === fixture.id;
                return <g key={fixture.id} className={`wall-fixture ${opening ? "opening-fixture" : "technical-fixture"} ${selected ? "selected" : ""}`} role="button" tabIndex={0} aria-label={fixture.name} onPointerDown={(event) => beginFixtureDrag(event, fixture)}>{opening ? <><line x1={position.x - tx * half} y1={position.y - ty * half} x2={position.x + tx * half} y2={position.y + ty * half} stroke={fixtureMeta[fixture.kind].color} /><text x={position.x} y={position.y - 11} textAnchor="middle">{fixture.name}</text></> : <><circle cx={position.x} cy={position.y} r="9" fill={fixtureMeta[fixture.kind].color} /><text x={position.x} y={position.y} textAnchor="middle" dominantBaseline="middle">{fixtureMeta[fixture.kind].short}</text>{fixture.quantity > 1 && <text className="fixture-quantity" x={position.x + 9} y={position.y - 9}>{fixture.quantity}</text>}</>}{showPrices && fixture.showPrice !== false && (fixture.unitPrice ?? 0) > 0 && <g className="price-tag" transform={`translate(${position.x},${position.y + 20})`}><rect x="-27" y="-8" width="54" height="16" rx="7" /><text textAnchor="middle" dominantBaseline="middle">{euros((fixture.unitPrice ?? 0) * fixture.quantity)}</text></g>}</g>;
              })}

              {mode !== "plan" && objects.map((object) => { const selected = selectedObjectId === object.id; return <g key={object.id} className={`plan-object ${mode === "networks" ? "ghost" : ""} ${selected ? "selected" : ""}`} role="button" tabIndex={0} aria-label={object.name} onPointerDown={(event) => beginObjectDrag(event, object, "object")}><rect x={object.x} y={object.y} width={object.w} height={object.h} rx="3" fill={objectMeta[object.kind].color} /><text x={object.x + object.w / 2} y={object.y + object.h / 2} textAnchor="middle" dominantBaseline="middle">{object.name}</text>{mode === "layout" && <text className="object-size" x={object.x + object.w / 2} y={object.y + object.h / 2 + 14} textAnchor="middle">{Math.round(object.w)} × {Math.round(object.h)}</text>}{showPrices && object.showPrice !== false && (object.unitPrice ?? 0) > 0 && <g className="price-tag" transform={`translate(${object.x + object.w / 2},${object.y + object.h + 12})`}><rect x="-27" y="-8" width="54" height="16" rx="7" /><text textAnchor="middle" dominantBaseline="middle">{euros(object.unitPrice ?? 0)}</text></g>}{selected && mode === "layout" && <rect className="resize-handle" x={object.x + object.w - 7} y={object.y + object.h - 7} width="14" height="14" rx="3" onPointerDown={(event) => beginObjectDrag(event, object, "resize-object")} />}</g>; })}

              {mode === "networks" && routes.filter((route) => route.kind === networkFilter).map((route) => <g key={route.id} className={`network-route route-${route.kind} ${selectedRouteId === route.id ? "selected" : ""}`}><path className="route-hit" d={routePath(route)} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedRouteId(route.id); clearSelection("route"); }} /><path d={routePath(route)} pointerEvents="none" /></g>)}
              {mode === "networks" && selectedRoute && selectedRoute.kind === networkFilter && <g className={`route-handles handles-${selectedRoute.kind}`}>{effectiveRoutePoints(selectedRoute, fixtures, existing, lining).map((point, index) => { const anchored = index === 0 && selectedRoute.sourceFixtureId || index === selectedRoute.points.length - 1 && selectedRoute.targetFixtureId; return <circle key={index} cx={point.x} cy={point.y} r={anchored ? 4 : 7} className={anchored ? "anchored" : "movable"} onPointerDown={(event) => { if (anchored) return; const start = pointFromEvent(event); if (!start) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { type: "route-point", routeId: selectedRoute.id, pointIndex: index, start, origin: point }; }} />; })}</g>}
            </svg>
          </div>
          <div className="canvas-footer"><span><b>{existing.length}</b> angles du bâti</span><span><b>{metrics.existingPerimeter.toFixed(1)} m</b> de murs existants</span><span><b>{metrics.liningPerimeter.toFixed(1)} m</b> de doublage</span><span><b>{metrics.openingArea.toFixed(1)} m²</b> d’ouvertures déduites</span></div>
        </div>

        <aside className="inspector-panel">
          {mode === "plan" && <div className="inspector-content"><div className="panel-title"><span>01 · Structure</span><h2>Murs et doublages</h2><p>Dessine la forme réelle, y compris les biais et les décrochements.</p></div><div className="layer-switch"><button type="button" className={selectedWall?.layer !== "lining" ? "active" : ""} onClick={() => { setSelectedWall({ layer: "existing", index: 0 }); clearSelection("wall"); }}>Murs existants</button><button type="button" className={selectedWall?.layer === "lining" ? "active" : ""} onClick={() => { setSelectedWall({ layer: "lining", index: 0 }); clearSelection("wall"); }}>Doublage BA13</button></div>{selectedWall ? <><div className="selection-card"><span className="selection-label">{selectedWall.layer === "existing" ? "Mur existant" : "Doublage BA13"} · segment {selectedWall.index + 1}</span><div className="field-grid"><NumberInput label="Longueur" value={segmentLength(layerPoints, selectedWall.index)} min={10} onChange={updateSelectedWallLength} /><NumberInput label="Angle" value={segmentAngle(layerPoints, selectedWall.index)} unit="°" min={-180} max={180} onChange={updateSelectedWallAngle} /></div><div className="tool-grid"><button type="button" onClick={() => alignWall("horizontal")}>Aligner horizontal</button><button type="button" onClick={() => alignWall("vertical")}>Aligner vertical</button><button type="button" onClick={addWallPoint}>＋ Point intermédiaire</button><button type="button" onClick={addRecess}>＋ Décroché</button><button type="button" className="danger" disabled={layerPoints.length <= 3} onClick={deleteWallPoint}>Supprimer le point suivant</button></div></div>{selectedWall.layer === "existing" && <div className="lining-card"><div><span>Retrait du doublage</span><strong>{build.liningDepth} cm</strong></div><input type="range" min="3" max="30" value={build.liningDepth} onChange={(event) => setBuild((current) => ({ ...current, liningDepth: Number(event.target.value) }))} /><label className="lining-toggle"><input type="checkbox" checked={build.autoSquareLining} onChange={(event) => setBuild((current) => ({ ...current, autoSquareLining: event.target.checked }))} /><span>Redresser les petits écarts pour les rails</span></label><label className="lining-tolerance"><span>Tolérance angulaire</span><div><input type="number" min="0" max="30" step="1" value={build.rightAngleTolerance} disabled={!build.autoSquareLining} onChange={(event) => setBuild((current) => ({ ...current, rightAngleTolerance: Math.max(0, Math.min(30, event.currentTarget.valueAsNumber || 0)) }))} /><small>°</small></div></label><div className="lining-result"><span>Correction détectée</span><strong>{build.autoSquareLining ? `${correctedWallCount} mur${correctedWallCount > 1 ? "s" : ""}` : "désactivée"}</strong></div><button type="button" onClick={regenerateLining}>Recalculer les rails + le BA13</button><p>Écart inférieur ou égal à {build.rightAngleTolerance}° : le doublage est remis à l’équerre. Au-delà, il suit le biais réel du mur existant.</p></div>}</> : <div className="empty-selection"><span>↖</span><strong>Sélectionne un mur</strong><p>Les cotes se modifient directement dans ce panneau.</p></div>}<div className="fixture-tools"><div><span>Éléments intégrés aux murs</span><small>Ils glissent uniquement le long du mur sélectionné.</small></div><button type="button" onClick={() => addFixture("door")}>＋ Porte</button><button type="button" onClick={() => addFixture("window")}>＋ Fenêtre</button></div>{selectedFixture && fixtureMeta[selectedFixture.kind].opening && <FixtureInspector fixture={selectedFixture} onChange={updateFixture} onDelete={deleteFixture} />}</div>}

          {mode === "layout" && <div className="inspector-content"><div className="panel-title"><span>02 · Aménagement</span><h2>Volumes dans la pièce</h2><p>Les murs techniques restent discrets pour laisser la priorité à l’agencement.</p></div><div className="object-catalog">{(Object.keys(objectMeta) as ObjectKind[]).map((kind) => <button type="button" key={kind} onClick={() => addObject(kind)}><i style={{ background: objectMeta[kind].color }} /><span>{objectMeta[kind].label}</span><b>＋</b></button>)}</div>{selectedObject ? <div className="selection-card"><span className="selection-label">Objet sélectionné</span><input className="name-field" value={selectedObject.name} onChange={(event) => updateObject({ name: event.target.value })} /><div className="field-grid"><NumberInput label="Position X" value={selectedObject.x} onChange={(x) => updateObject({ x })} /><NumberInput label="Position Y" value={selectedObject.y} onChange={(y) => updateObject({ y })} /><NumberInput label="Largeur" value={selectedObject.w} min={20} onChange={(w) => updateObject({ w })} /><NumberInput label="Profondeur" value={selectedObject.h} min={20} onChange={(h) => updateObject({ h })} /><NumberInput label="Prix de l’élément" value={selectedObject.unitPrice ?? 0} unit="€" step={0.1} onChange={(unitPrice) => updateObject({ unitPrice })} /></div><label className="display-price-toggle"><input type="checkbox" checked={selectedObject.showPrice !== false} onChange={(event) => updateObject({ showPrice: event.target.checked })} /> Afficher ce prix sur le plan</label><div className="tool-grid"><button type="button" onClick={() => updateObject({ w: selectedObject.h, h: selectedObject.w })}>Pivoter 90°</button><button type="button" className="danger" onClick={() => { setObjects((current) => current.filter((object) => object.id !== selectedObject.id)); setSelectedObjectId(null); }}>Supprimer</button></div></div> : <div className="empty-selection compact"><span>↖</span><strong>Choisis ou sélectionne un volume</strong></div>}</div>}

          {mode === "networks" && <div className="inspector-content"><div className="panel-title"><span>03 · Technique</span><h2>Un réseau à la fois</h2><p>Les points sont attachés aux murs ; les coudes restent déplaçables librement.</p></div><div className="network-switch">{(["electric", "cold", "hot"] as NetworkKind[]).map((kind) => <button type="button" key={kind} className={networkFilter === kind ? "active" : ""} onClick={() => { setNetworkFilter(kind); setSelectedRouteId(null); }}>{networkName(kind)}<strong>{routeTotals[kind].toFixed(1)} m</strong></button>)}</div><div className="network-actions">{networkFilter === "electric" ? <><button type="button" onClick={() => addFixture("source-electric")}>＋ Tableau</button><button type="button" onClick={() => addFixture("outlet")}>＋ Prise</button><button type="button" onClick={() => addFixture("switch")}>＋ Interrupteur</button><button type="button" onClick={() => addFixture("light")}>＋ Éclairage</button></> : networkFilter === "cold" ? <><button type="button" onClick={() => addFixture("source-cold")}>＋ Arrivée EF</button><button type="button" onClick={() => addFixture("water-cold")}>＋ Sortie EF</button></> : <><button type="button" onClick={() => addFixture("source-hot")}>＋ Départ EC</button><button type="button" onClick={() => addFixture("water-hot")}>＋ Sortie EC</button></>}<button type="button" className="wide" onClick={() => addFreeRoute(networkFilter)}>＋ Tracé libre vers une autre pièce</button></div>{selectedFixture && !fixtureMeta[selectedFixture.kind].opening && <FixtureInspector fixture={selectedFixture} onChange={updateFixture} onDelete={deleteFixture} />}{selectedRoute && <div className="selection-card route-card"><span className="selection-label">Tracé sélectionné</span><input className="name-field" value={selectedRoute.name} onChange={(event) => setRoutes((current) => current.map((route) => route.id === selectedRoute.id ? { ...route, name: event.target.value } : route))} /><p><strong>{routeLength(selectedRoute, fixtures, existing, lining).toFixed(2)} m</strong> avec marge de 15 %</p><div className="tool-grid"><button type="button" onClick={addRoutePoint}>＋ Ajouter un coude</button><button type="button" className="danger" onClick={() => { setRoutes((current) => current.filter((route) => route.id !== selectedRoute.id)); setSelectedRouteId(null); }}>Supprimer</button></div></div>}<div className="route-list">{routes.filter((route) => route.kind === networkFilter).map((route) => <button type="button" key={route.id} className={selectedRouteId === route.id ? "active" : ""} onClick={() => { setSelectedRouteId(route.id); clearSelection("route"); }}><span>{route.name}</span><strong>{routeLength(route, fixtures, existing, lining).toFixed(1)} m</strong></button>)}</div></div>}

          {mode === "budget" && (
            <div className="inspector-content budget-content">
              <div className="panel-title">
                <span>04 · Métré</span><h2>Quantités et prix</h2>
                <p>Les matériaux conditionnés et les éléments posés sont additionnés sans les confondre.</p>
              </div>
              <div className="budget-total">
                <span>Total général</span><strong>{euros(renovationTotal)}</strong>
                <div className="budget-breakdown"><small>Matériaux <b>{euros(grandTotal)}</b></small><small>Éléments du plan <b>{euros(elementTotal)}</b></small></div>
              </div>
              <details className="settings-card element-price-card" open>
                <summary>Prix des éléments du plan</summary>
                <label><input type="checkbox" checked={showPrices} onChange={(event) => setShowPrices(event.currentTarget.checked)} /> Afficher les étiquettes de prix sur le plan</label>
                <div className="element-price-list">
                  {objects.map((object) => <label key={object.id}><span>{object.name}</span><input aria-label={`Prix ${object.name}`} type="number" min="0" step="0.1" value={object.unitPrice ?? 0} onChange={(event) => { const unitPrice = Math.max(0, event.currentTarget.valueAsNumber || 0); setObjects((current) => current.map((entry) => entry.id === object.id ? { ...entry, unitPrice } : entry)); }} /><small>€</small></label>)}
                  {fixtures.map((fixture) => <label key={fixture.id}><span>{fixture.name}{fixture.quantity > 1 ? ` × ${fixture.quantity}` : ""}</span><input aria-label={`Prix unitaire ${fixture.name}`} type="number" min="0" step="0.1" value={fixture.unitPrice ?? 0} onChange={(event) => { const unitPrice = Math.max(0, event.currentTarget.valueAsNumber || 0); setFixtures((current) => current.map((entry) => entry.id === fixture.id ? { ...entry, unitPrice } : entry)); }} /><small>€ / u</small></label>)}
                </div>
              </details>
              <details className="settings-card">
                <summary>Paramètres de calcul</summary>
                <div className="field-grid"><NumberInput label="Hauteur de pièce" value={build.roomHeight} onChange={(roomHeight) => setBuild((current) => ({ ...current, roomHeight }))} /><NumberInput label="Entraxe montants" value={build.studSpacing} onChange={(studSpacing) => setBuild((current) => ({ ...current, studSpacing }))} /><NumberInput label="Marge murs" value={build.waste} unit="%" onChange={(waste) => setBuild((current) => ({ ...current, waste }))} /><NumberInput label="Marge sol" value={build.tileWaste} unit="%" onChange={(tileWaste) => setBuild((current) => ({ ...current, tileWaste }))} /></div>
                <label><input type="checkbox" checked={build.includeCeiling} onChange={(event) => { const includeCeiling = event.currentTarget.checked; setBuild((current) => ({ ...current, includeCeiling })); }} /> Inclure le plafond dans isolation et plaques</label>
              </details>
              <div className="purchase-list">{resolvedBudget.map((line) => (
                <article key={line.key} className={line.remainder < -0.001 ? "insufficient" : ""}>
                  <header><div><strong>{line.label}</strong><small>{line.detail}</small></div><span>{line.required.toFixed(line.required < 10 ? 1 : 0)} {line.unit} requis</span></header>
                  <select value={line.product?.id ?? ""} onChange={(event) => { const productId = event.currentTarget.value; setBudgetChoices((current) => ({ ...current, [line.key]: { ...current[line.key], productId, manualQuantity: undefined } })); }}><option value="">Choisir un produit</option>{line.compatibles.map((product) => <option key={product.id} value={product.id}>{product.name} · {euros(product.price)}</option>)}</select>
                  {line.product ? <div className="purchase-calc"><div><span>Conditionnement</span><strong>{line.product.coverage} {line.product.coverageUnit} / {line.product.packLabel}</strong></div><label><span>Quantité achetée</span><input type="number" min="0" value={line.quantity} onChange={(event) => { const manualQuantity = Math.max(0, event.currentTarget.valueAsNumber || 0); setBudgetChoices((current) => ({ ...current, [line.key]: { productId: line.product?.id, manualQuantity } })); }} /></label><div><span>Couverture</span><strong>{line.purchased.toFixed(1)} {line.unit}</strong></div><div><span>{line.remainder >= 0 ? "Reste" : "Manque"}</span><strong>{Math.abs(line.remainder).toFixed(1)} {line.unit}</strong></div><b>{euros(line.total)}</b></div> : <p className="missing-product">Ajoute un produit compatible dans la bibliothèque.</p>}
                </article>
              ))}</div>
            </div>
          )}

          {mode === "products" && <div className="inspector-content product-content"><div className="panel-title"><span>05 · Bibliothèque</span><h2>Produits & conditionnements</h2><p>Catalogue personnel réutilisable dans tous les projets. Les prix restent datés et modifiables.</p></div><div className="import-actions"><button type="button" onClick={() => fileRef.current?.click()}>Importer un CSV</button><input ref={fileRef} hidden type="file" accept=".csv,text/csv" onChange={importProducts} /><small>Colonnes : nom; référence; catégorie; magasin; prix; couverture; unité; conditionnement; URL</small></div><details className="add-product" open><summary>Ajouter un produit</summary><input placeholder="Nom du produit" value={newProduct.name} onChange={(event) => setNewProduct((current) => ({ ...current, name: event.target.value }))} /><div className="field-grid"><label><span>Catégorie</span><select value={newProduct.category} onChange={(event) => setNewProduct((current) => ({ ...current, category: event.target.value as ProductCategory }))}>{(["plomberie", "electricite", "ossature", "isolation", "plaques", "carrelage", "consommables"] as ProductCategory[]).map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label><span>Magasin</span><input value={newProduct.store} onChange={(event) => setNewProduct((current) => ({ ...current, store: event.target.value }))} /></label><NumberInput label="Prix du conditionnement" value={newProduct.price} unit="€" step={0.1} onChange={(price) => setNewProduct((current) => ({ ...current, price }))} /><NumberInput label="Couverture" value={newProduct.coverage} unit={newProduct.coverageUnit} step={0.1} onChange={(coverage) => setNewProduct((current) => ({ ...current, coverage }))} /></div><input placeholder="Référence / EAN" value={newProduct.reference} onChange={(event) => setNewProduct((current) => ({ ...current, reference: event.target.value }))} /><input placeholder="Lien vers la fiche produit" value={newProduct.url} onChange={(event) => setNewProduct((current) => ({ ...current, url: event.target.value }))} /><button type="button" className="primary" onClick={addProduct}>Ajouter à la bibliothèque</button></details><div className="product-list">{products.map((product) => <article key={product.id}><div className="product-head"><div><span>{product.store || "Sans magasin"}</span><strong>{product.name}</strong><small>{product.reference || "Sans référence"}</small></div>{product.url && <a href={product.url} target="_blank" rel="noreferrer">Fiche ↗</a>}</div><div className="product-fields"><NumberInput label="Prix" value={product.price} unit="€" step={0.1} onChange={(price) => updateProduct(product.id, { price, checkedAt: new Date().toISOString().slice(0, 10) })} /><NumberInput label={`Couverture / ${product.packLabel}`} value={product.coverage} unit={product.coverageUnit} step={0.1} onChange={(coverage) => updateProduct(product.id, { coverage })} /></div><footer><span>{product.category}</span><small>Prix vérifié le {formatDate(product.checkedAt)}</small><button type="button" onClick={() => setProducts((current) => current.filter((entry) => entry.id !== product.id))}>Supprimer</button></footer></article>)}</div></div>}
        </aside>
      </section>
    </main>
  );
}

function FixtureInspector({ fixture, onChange, onDelete }: { fixture: WallFixture; onChange: (changes: Partial<WallFixture>) => void; onDelete: () => void }) {
  return <div className="selection-card fixture-card"><span className="selection-label">Élément mural sélectionné</span><input className="name-field" value={fixture.name} onChange={(event) => onChange({ name: event.target.value })} /><div className="field-grid"><NumberInput label="Distance sur le mur" value={fixture.offset * 100} unit="%" min={0} max={100} onChange={(offset) => onChange({ offset: offset / 100 })} /><NumberInput label="Largeur" value={fixture.width} onChange={(width) => onChange({ width })} /><NumberInput label="Hauteur" value={fixture.height} onChange={(height) => onChange({ height })} /><NumberInput label="Hauteur de pose" value={fixture.mountHeight} onChange={(mountHeight) => onChange({ mountHeight })} /><NumberInput label="Quantité groupée" value={fixture.quantity} unit="u" min={1} step={1} onChange={(quantity) => onChange({ quantity: Math.max(1, Math.round(quantity)) })} /><NumberInput label="Prix unitaire" value={fixture.unitPrice ?? 0} unit="€" step={0.1} onChange={(unitPrice) => onChange({ unitPrice })} /></div><label className="display-price-toggle"><input type="checkbox" checked={fixture.showPrice !== false} onChange={(event) => onChange({ showPrice: event.target.checked })} /> Afficher ce prix sur le plan</label><button type="button" className="danger wide-danger" onClick={onDelete}>Supprimer l’élément</button></div>;
}
