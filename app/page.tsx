"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Mode = "plan" | "layout" | "networks" | "budget" | "products";
type Layer = "existing" | "lining";
type NetworkKind = "electric" | "cold" | "hot";
type Point = { x: number; y: number };
type Measurement = { id: string; points: Point[] };
type DimensionVisibility = { existing: boolean; lining: boolean; layout: boolean; networks: boolean; measurements: boolean };
type DimensionLabelPlacement = Point & { width: number };
type RoutePoint = Point & { wallIndex?: number; wallOffset?: number; wallLayer?: Layer };
type SelectedWall = { layer: Layer; index: number };
type ViewBox = { x: number; y: number; width: number; height: number };
type PanState = { pointerId: number; startClient: Point; origin: ViewBox; scaleX: number; scaleY: number };
type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type ContextTarget =
  | { type: "plan"; point: Point }
  | { type: "object"; id: string }
  | { type: "fixture"; id: string }
  | { type: "route"; id: string }
  | { type: "route-point"; routeId: string; pointIndex: number }
  | { type: "measurement"; id: string }
  | { type: "wall"; layer: Layer; index: number; point: Point };
type ContextMenuState = { x: number; y: number; target: ContextTarget };

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
  freePosition?: Point;
  unitPrice?: number;
  showPrice?: boolean;
};

type ObjectKind = "cabinet" | "tall" | "worktop" | "appliance" | "sanitary" | "table" | "radiator" | "custom";
type PlanObject = { id: string; kind: ObjectKind; name: string; x: number; y: number; w: number; h: number; connections?: NetworkKind[]; unitPrice?: number; showPrice?: boolean };
type NetworkRoute = { id: string; kind: NetworkKind; name: string; points: RoutePoint[]; sourceFixtureId?: string; targetFixtureId?: string; targetObjectId?: string };

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
  measurements?: Measurement[];
  build: BuildSettings;
  budgetChoices: Record<string, BudgetChoice>;
  dimensionVisibility?: DimensionVisibility;
  measurementSnap?: boolean;
  elementSnap?: boolean;
  showPrices?: boolean;
  showAllNetworks?: boolean;
};

type DragState =
  | { type: "wall-point"; layer: Layer; index: number }
  | { type: "fixture"; id: string }
  | { type: "object"; id: string; start: Point; origin: Point }
  | { type: "resize-object"; id: string; edge: ResizeEdge; start: Point; origin: { x: number; y: number; w: number; h: number } }
  | { type: "route-point"; routeId: string; pointIndex: number; start: Point; origin: Point }
  | { type: "measurement-point"; measurementId: string; pointIndex: number };

const DRAFT_KEY = "atelier-renovation-draft-v1";
const PRODUCTS_KEY = "atelier-renovation-products-v1";
const SAVES_KEY = "atelier-renovation-saves-v1";
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const fitViewBoxToAspect = (view: ViewBox, aspect: number): ViewBox => {
  if (!Number.isFinite(aspect) || aspect <= 0) return view;
  const currentAspect = view.width / view.height;
  if (Math.abs(currentAspect - aspect) < 0.0001) return view;
  if (currentAspect < aspect) {
    const width = view.height * aspect;
    return { x: view.x - (width - view.width) / 2, y: view.y, width, height: view.height };
  }
  const height = view.width / aspect;
  return { x: view.x, y: view.y - (height - view.height) / 2, width: view.width, height };
};
const formatDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};
const copyPoints = <T extends Point>(points: T[]): T[] => points.map((point) => ({ ...point }));
const copyFixtures = (fixtures: WallFixture[]) => fixtures.map((fixture) => ({ ...fixture, freePosition: fixture.freePosition ? { ...fixture.freePosition } : undefined }));
const copyObjects = (objects: PlanObject[]) => objects.map((object) => ({ ...object, connections: object.connections ? [...object.connections] : undefined }));
const copyRoutes = (routes: NetworkRoute[]) => routes.map((route) => ({ ...route, points: copyPoints(route.points) }));
const copyMeasurements = (measurements: Measurement[]) => measurements.map((measurement) => ({ ...measurement, points: copyPoints(measurement.points) }));

const defaultExisting: Point[] = [
  { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 50 }, { x: 380, y: 50 },
  { x: 380, y: 0 }, { x: 530, y: 0 }, { x: 530, y: 500 }, { x: 0, y: 500 },
];

const defaultBuild: BuildSettings = { roomHeight: 250, liningDepth: 8, rightAngleTolerance: 10, autoSquareLining: true, studSpacing: 60, waste: 10, tileWaste: 10, includeCeiling: false };
const defaultDimensionVisibility: DimensionVisibility = { existing: true, lining: true, layout: false, networks: false, measurements: true };

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

const objectMeta: Record<ObjectKind, { label: string; w: number; h: number; color: string; connections?: NetworkKind[] }> = {
  cabinet: { label: "Meuble bas", w: 60, h: 60, color: "#64748b" },
  tall: { label: "Colonne", w: 60, h: 60, color: "#475569" },
  worktop: { label: "Plan de travail", w: 180, h: 65, color: "#0f766e" },
  appliance: { label: "Électroménager", w: 60, h: 60, color: "#334155", connections: ["electric"] },
  sanitary: { label: "Équipement sanitaire", w: 90, h: 60, color: "#0891b2", connections: ["cold", "hot"] },
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
function projectOnSegment(point: Point, points: Point[], index: number) {
  const wall = segment(points, index); const dx = wall.b.x - wall.a.x; const dy = wall.b.y - wall.a.y; const squared = dx * dx + dy * dy || 1;
  const offset = clamp(((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / squared, 0.02, 0.98);
  const projected = pointOnSegment(points, index, offset);
  return { wallIndex: index, wallOffset: offset, point: projected, distance: Math.hypot(point.x - projected.x, point.y - projected.y), wallLength: Math.sqrt(squared) };
}
function nearestWallProjection(point: Point, points: Point[]) {
  return points.reduce((best, _, index) => { const candidate = projectOnSegment(point, points, index); return !best || candidate.distance < best.distance ? candidate : best; }, null as ReturnType<typeof projectOnSegment> | null);
}

function polylineLength(points: Point[]) {
  return points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}
function polylineMidpoint(points: Point[]) {
  if (!points.length) return { x: 0, y: 0 };
  const total = polylineLength(points); if (total < 0.001) return { ...points[0] };
  const target = total / 2; let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]; const current = points[index]; const length = Math.hypot(current.x - previous.x, current.y - previous.y);
    if (travelled + length >= target) { const ratio = (target - travelled) / Math.max(length, 0.001); return { x: previous.x + (current.x - previous.x) * ratio, y: previous.y + (current.y - previous.y) * ratio }; }
    travelled += length;
  }
  return { ...points.at(-1)! };
}
function measurementSummary(points: Point[]) {
  if (points.length < 2) return "Point de départ";
  const total = Math.round(polylineLength(points));
  if (points.length === 2) return `${total} cm · X ${Math.round(Math.abs(points[1].x - points[0].x))} · Y ${Math.round(Math.abs(points[1].y - points[0].y))}`;
  return `Total ${total} cm · ${points.length - 1} segments`;
}
function dimensionBoxesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  const gap = 5;
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap;
}
function wallDimensionPlacements(points: Point[], side: "inside" | "outside", occupied: { x: number; y: number; width: number; height: number }[]) {
  const orientation = signedArea(points) >= 0 ? 1 : -1;
  return points.map((_, index) => {
    const wall = segment(points, index); const dx = wall.b.x - wall.a.x; const dy = wall.b.y - wall.a.y; const length = Math.hypot(dx, dy) || 1;
    const tangent = { x: dx / length, y: dy / length }; const inward = { x: -tangent.y * orientation, y: tangent.x * orientation }; const direction = side === "inside" ? 1 : -1;
    const midpoint = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }; const text = `${Math.round(length)} cm`; const width = Math.max(46, text.length * 4.6 + 14);
    let placement: DimensionLabelPlacement = { ...midpoint, width };
    const candidates = [20, 34, 48].flatMap((offset) => [0, 18, -18, 36, -36].map((shift) => ({ x: midpoint.x + inward.x * offset * direction + tangent.x * shift, y: midpoint.y + inward.y * offset * direction + tangent.y * shift, width })));
    const free = candidates.find((candidate) => !occupied.some((box) => dimensionBoxesOverlap({ ...candidate, height: 18 }, box)));
    placement = free ?? candidates.at(-1)!;
    occupied.push({ ...placement, height: 18 });
    return placement;
  });
}
function placeFloatingDimension(point: Point, width: number, occupied: { x: number; y: number; width: number; height: number }[]) {
  const candidates = [0, -22, 22, -44, 44, -66, 66].map((offset) => ({ x: point.x, y: point.y + offset, width, height: 18 }));
  const placement = candidates.find((candidate) => !occupied.some((box) => dimensionBoxesOverlap(candidate, box))) ?? candidates.at(-1)!;
  occupied.push(placement); return placement;
}

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
    const localScale = Math.max(segmentLength(points, (index - 1 + points.length) % points.length), segmentLength(points, index), 25);
    const reasonable = intersection && Math.hypot(intersection.x - point.x, intersection.y - point.y) <= localScale * 4;
    return intersection && reasonable && Number.isFinite(intersection.x) && Number.isFinite(intersection.y)
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
function fixturePosition(fixture: WallFixture, existing: Point[], lining: Point[]) { if (fixture.freePosition) return { ...fixture.freePosition }; const points = fixture.layer === "existing" ? existing : lining; return pointOnSegment(points, Math.min(fixture.wallIndex, points.length - 1), fixture.offset); }
function releaseLightFixtures(fixtures: WallFixture[], existing: Point[], lining: Point[]) { return fixtures.map((fixture) => fixture.kind === "light" && !fixture.freePosition ? { ...fixture, freePosition: fixturePosition(fixture, existing, lining) } : fixture); }
function networkName(kind: NetworkKind) { return kind === "electric" ? "Électricité" : kind === "cold" ? "Eau froide" : "Eau chaude"; }
function wallAnchor(point: Point, lining: Point[]): RoutePoint {
  const nearest = nearestWallProjection(point, lining);
  if (!nearest) return { ...point };
  return { ...nearest.point, wallIndex: nearest.wallIndex, wallOffset: nearest.wallOffset, wallLayer: "lining" };
}
function storedWallAnchor(point: RoutePoint, lining: Point[]): RoutePoint {
  if (point.wallIndex === undefined) return wallAnchor(point, lining);
  const wallIndex = Math.round(clamp(point.wallIndex, 0, Math.max(0, lining.length - 1)));
  const wallOffset = clamp(point.wallOffset ?? 0.5, 0, 1);
  return { ...pointOnSegment(lining, wallIndex, wallOffset), wallIndex, wallOffset, wallLayer: "lining" };
}
function fixtureWallAnchor(fixture: WallFixture, existing: Point[], lining: Point[]): RoutePoint {
  return wallAnchor(fixturePosition(fixture, existing, lining), lining);
}
function objectCenter(object: PlanObject) { return { x: object.x + object.w / 2, y: object.y + object.h / 2 }; }
function objectWallAnchor(object: PlanObject, lining: Point[]) { return wallAnchor(objectCenter(object), lining); }
function objectConnectionPoint(object: PlanObject, lining: Point[]): Point {
  const center = objectCenter(object); const anchor = objectWallAnchor(object, lining); const dx = anchor.x - center.x; const dy = anchor.y - center.y;
  if (Math.abs(dx) + Math.abs(dy) < 0.001) return center;
  const scaleX = Math.abs(dx) > 0.001 ? object.w / 2 / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const scaleY = Math.abs(dy) > 0.001 ? object.h / 2 / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}
function wallPathBetween(lining: Point[], from: RoutePoint, to: RoutePoint) {
  if (lining.length < 2 || from.wallIndex === undefined || to.wallIndex === undefined) return [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
  const lengths = lining.map((_, index) => segmentLength(lining, index));
  const cumulative = [0]; lengths.forEach((length) => cumulative.push(cumulative[cumulative.length - 1] + length));
  const total = cumulative[cumulative.length - 1] || 1;
  const fromDistance = cumulative[from.wallIndex] + lengths[from.wallIndex] * (from.wallOffset ?? 0.5);
  const toDistance = cumulative[to.wallIndex] + lengths[to.wallIndex] * (to.wallOffset ?? 0.5);
  const forwardDistance = (toDistance - fromDistance + total) % total;
  const backwardDistance = (fromDistance - toDistance + total) % total;
  if (Math.min(forwardDistance, backwardDistance) < 0.001) return [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
  const forward = forwardDistance <= backwardDistance;
  const destination = forward
    ? toDistance <= fromDistance ? toDistance + total : toDistance
    : toDistance >= fromDistance ? toDistance - total : toDistance;
  const vertices = lining.flatMap((point, index) => [-1, 0, 1].map((cycle) => ({ point, distance: cumulative[index] + cycle * total })))
    .filter((entry) => forward
      ? entry.distance > fromDistance + 0.001 && entry.distance < destination - 0.001
      : entry.distance < fromDistance - 0.001 && entry.distance > destination + 0.001)
    .sort((a, b) => forward ? a.distance - b.distance : b.distance - a.distance)
    .map((entry) => ({ ...entry.point }));
  return [{ x: from.x, y: from.y }, ...vertices, { x: to.x, y: to.y }];
}
function dedupePath(points: Point[]) {
  return points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 0.01);
}
function automaticRoutes(fixtures: WallFixture[], objects: PlanObject[], existing: Point[], lining: Point[]) {
  const fixtureRoutes = fixtures.flatMap((target) => {
    const kind = fixtureNetwork(target.kind); if (!kind) return [];
    const source = fixtures.find((fixture) => fixtureSource(fixture.kind) === kind); if (!source) return [];
    const start = fixtureWallAnchor(source, existing, lining); const end = fixtureWallAnchor(target, existing, lining);
    return [{ id: `auto-${kind}-${target.id}`, kind, name: `${networkName(kind)} · ${target.name}`, sourceFixtureId: source.id, targetFixtureId: target.id, points: [start, end] } as NetworkRoute];
  });
  const objectRoutes = objects.flatMap((object) => (object.connections ?? []).flatMap((kind) => {
    const source = fixtures.find((fixture) => fixtureSource(fixture.kind) === kind); if (!source) return [];
    const start = fixtureWallAnchor(source, existing, lining); const end = objectConnectionPoint(object, lining);
    return [{ id: `auto-${kind}-object-${object.id}`, kind, name: `${networkName(kind)} · ${object.name}`, sourceFixtureId: source.id, targetObjectId: object.id, points: [start, end] } as NetworkRoute];
  }));
  return [...fixtureRoutes, ...objectRoutes];
}
function mergeAutomaticRoutes(current: NetworkRoute[], generated: NetworkRoute[]) {
  const preservedManual = current.filter((route) => !route.id.startsWith("auto-"));
  return [...generated.map((route) => {
    const previous = current.find((entry) => entry.id === route.id);
    if (!previous) return route;
    const guidedPoints = previous.points.slice(1, -1).filter((point) => point.wallIndex !== undefined);
    return { ...route, name: previous.name, points: [route.points[0], ...copyPoints(guidedPoints), route.points[route.points.length - 1]] };
  }), ...preservedManual];
}
function effectiveRoutePoints(route: NetworkRoute, fixtures: WallFixture[], objects: PlanObject[], existing: Point[], lining: Point[]) {
  const source = fixtures.find((fixture) => fixture.id === route.sourceFixtureId);
  const target = fixtures.find((fixture) => fixture.id === route.targetFixtureId);
  const targetObject = objects.find((object) => object.id === route.targetObjectId);
  const firstStored = route.points[0] ?? lining[0] ?? { x: 0, y: 0 };
  const lastStored = route.points[route.points.length - 1] ?? firstStored;
  const start = source ? fixtureWallAnchor(source, existing, lining) : storedWallAnchor(firstStored, lining);
  const guides = route.points.slice(1, -1).filter((point) => point.wallIndex !== undefined).map((point) => storedWallAnchor(point, lining));
  const end = target ? fixtureWallAnchor(target, existing, lining) : targetObject ? objectWallAnchor(targetObject, lining) : storedWallAnchor(lastStored, lining);
  const anchors = [start, ...guides, end];
  const path = anchors.slice(1).reduce<Point[]>((result, anchor, index) => {
    const section = wallPathBetween(lining, anchors[index], anchor);
    return [...result, ...(result.length ? section.slice(1) : section)];
  }, []);
  if (target?.freePosition) path.push(fixturePosition(target, existing, lining));
  if (targetObject) path.push(objectConnectionPoint(targetObject, lining));
  return dedupePath(path);
}
function effectiveRouteHandles(route: NetworkRoute, fixtures: WallFixture[], objects: PlanObject[], existing: Point[], lining: Point[]) {
  const lastIndex = route.points.length - 1;
  return route.points.flatMap((stored, storedIndex) => {
    const source = storedIndex === 0 ? fixtures.find((fixture) => fixture.id === route.sourceFixtureId) : undefined;
    const target = storedIndex === lastIndex ? fixtures.find((fixture) => fixture.id === route.targetFixtureId) : undefined;
    const targetObject = storedIndex === lastIndex ? objects.find((object) => object.id === route.targetObjectId) : undefined;
    const terminal = Boolean(source || target || targetObject);
    if (!terminal && storedIndex > 0 && storedIndex < lastIndex && stored.wallIndex === undefined) return [];
    const point = source ? fixturePosition(source, existing, lining) : target ? fixturePosition(target, existing, lining) : targetObject ? objectConnectionPoint(targetObject, lining) : storedWallAnchor(stored, lining);
    return [{ point, storedIndex, terminal, wallWaypoint: !terminal }];
  });
}
function routeLength(route: NetworkRoute, fixtures: WallFixture[], objects: PlanObject[], existing: Point[], lining: Point[]) {
  const points = effectiveRoutePoints(route, fixtures, objects, existing, lining);
  return points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0) / 100 * 1.15;
}

function NumberInput({ label, value, unit = "cm", min = 0, max = 9999, step = 1, onChange }: { label: string; value: number; unit?: string; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="number-input"><span>{label}</span><div><input type="number" min={min} max={max} step={step} value={round(value, 2)} onChange={(event) => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next)) onChange(next); }} /><small>{unit}</small></div></label>;
}

export default function Home() {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasPanelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("plan");
  const [existing, setExisting] = useState<Point[]>(defaultExisting);
  const [build, setBuild] = useState<BuildSettings>(defaultBuild);
  const [lining, setLining] = useState<Point[]>(() => createLining(defaultExisting, defaultBuild));
  const [fixtures, setFixtures] = useState<WallFixture[]>(defaultFixtures);
  const [objects, setObjects] = useState<PlanObject[]>(defaultObjects);
  const [routes, setRoutes] = useState<NetworkRoute[]>(() => automaticRoutes(defaultFixtures, defaultObjects, defaultExisting, createLining(defaultExisting, defaultBuild)));
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [measurementDraft, setMeasurementDraft] = useState<Point[]>([]);
  const [measurementPreview, setMeasurementPreview] = useState<Point | null>(null);
  const [measureMode, setMeasureMode] = useState(false);
  const [measurementSnap, setMeasurementSnap] = useState(true);
  const [products, setProducts] = useState<Product[]>(defaultProducts);
  const [budgetChoices, setBudgetChoices] = useState<Record<string, BudgetChoice>>({});
  const [selectedWall, setSelectedWall] = useState<SelectedWall | null>({ layer: "existing", index: 0 });
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedRoutePoint, setSelectedRoutePoint] = useState<{ routeId: string; pointIndex: number } | null>(null);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [networkFilter, setNetworkFilter] = useState<NetworkKind>("electric");
  const [showAllNetworks, setShowAllNetworks] = useState(false);
  const [routeWallWaypointMode, setRouteWallWaypointMode] = useState(false);
  const [orthogonalSnap, setOrthogonalSnap] = useState(true);
  const [elementSnap, setElementSnap] = useState(true);
  const [dimensionVisibility, setDimensionVisibility] = useState<DimensionVisibility>(defaultDimensionVisibility);
  const [showPrices, setShowPrices] = useState(false);
  const [projectName, setProjectName] = useState("Projet rénovation");
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [notice, setNotice] = useState("Toutes les modifications sont enregistrées localement");
  const [hydrated, setHydrated] = useState(false);
  const [viewport, setViewport] = useState<ViewBox | null>(null);
  const [canvasAspect, setCanvasAspect] = useState(16 / 10);
  const [isPanning, setIsPanning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draggedObjectId, setDraggedObjectId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<Omit<Product, "id">>({ name: "", reference: "", category: "consommables", store: "", url: "", price: 0, coverage: 1, coverageUnit: "u", packLabel: "unité", checkedAt: new Date().toISOString().slice(0, 10) });

  const selectedFixture = fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? null;
  const selectedObject = objects.find((object) => object.id === selectedObjectId) ?? null;
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? null;
  const layerPoints = selectedWall?.layer === "lining" ? lining : existing;
  const visibleRoutes = useMemo(() => routes.filter((route) => showAllNetworks || route.kind === networkFilter), [routes, showAllNetworks, networkFilter]);
  const wallDimensionLayout = useMemo(() => {
    const occupied: { x: number; y: number; width: number; height: number }[] = [];
    return { existing: wallDimensionPlacements(existing, "outside", occupied), lining: wallDimensionPlacements(lining, "inside", occupied) };
  }, [existing, lining]);
  const networkDimensionLayout = useMemo(() => {
    const occupied: { x: number; y: number; width: number; height: number }[] = [];
    return new Map(visibleRoutes.map((route) => {
      const points = effectiveRoutePoints(route, fixtures, objects, existing, lining); const text = `${routeLength(route, fixtures, objects, existing, lining).toFixed(1)} m`; const width = Math.max(46, text.length * 4.6 + 14);
      return [route.id, { ...placeFloatingDimension(polylineMidpoint(points), width, occupied), text }] as const;
    }));
  }, [visibleRoutes, fixtures, objects, existing, lining]);
  const measurementDisplayPoints = useMemo(() => {
    if (!measurementDraft.length || !measurementPreview) return measurementDraft;
    const last = measurementDraft.at(-1)!; return Math.hypot(last.x - measurementPreview.x, last.y - measurementPreview.y) < 0.1 ? measurementDraft : [...measurementDraft, measurementPreview];
  }, [measurementDraft, measurementPreview]);
  const activeDimensionCount = Object.values(dimensionVisibility).filter(Boolean).length;

  const bounds = useMemo(() => {
    const all = [...existing, ...lining, ...fixtures.map((fixture) => fixturePosition(fixture, existing, lining)), ...objects.flatMap((object) => [{ x: object.x, y: object.y }, { x: object.x + object.w, y: object.y + object.h }]), ...routes.flatMap((route) => effectiveRoutePoints(route, fixtures, objects, existing, lining)), ...measurements.flatMap((measurement) => measurement.points)];
    const finite = all.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    const minX = Math.min(0, ...finite.map((point) => point.x)); const minY = Math.min(0, ...finite.map((point) => point.y));
    const maxX = Math.max(600, ...finite.map((point) => point.x)); const maxY = Math.max(550, ...finite.map((point) => point.y)); const padding = 120;
    return { x: minX - padding, y: minY - padding, width: Math.max(770, maxX - minX + padding * 2), height: Math.max(740, maxY - minY + padding * 2) };
  }, [existing, lining, objects, routes, fixtures, measurements]);
  const fittedBounds = useMemo(() => fitViewBoxToAspect(bounds, canvasAspect), [bounds, canvasAspect]);
  const activeView = useMemo(() => fitViewBoxToAspect(viewport ?? bounds, canvasAspect), [viewport, bounds, canvasAspect]);
  const zoomPercent = Math.round(fittedBounds.width / activeView.width * 100);
  const pointFromEvent = useCallback((event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current; const matrix = svg?.getScreenCTM(); if (!svg || !matrix) return null;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY; return point.matrixTransform(matrix.inverse());
  }, []);
  const zoomView = useCallback((factor: number, anchor?: Point) => {
    setViewport((current) => {
      const view = fitViewBoxToAspect(current ?? bounds, canvasAspect);
      const reference = fitViewBoxToAspect(bounds, canvasAspect);
      const minWidth = reference.width / 8;
      const maxWidth = reference.width * 4;
      const nextWidth = clamp(view.width * factor, minWidth, maxWidth);
      const appliedFactor = nextWidth / view.width;
      if (Math.abs(appliedFactor - 1) < 0.0001) return view;
      const focus = anchor ?? { x: view.x + view.width / 2, y: view.y + view.height / 2 };
      return {
        x: focus.x - (focus.x - view.x) * appliedFactor,
        y: focus.y - (focus.y - view.y) * appliedFactor,
        width: nextWidth,
        height: view.height * appliedFactor,
      };
    });
  }, [bounds, canvasAspect]);

  const routeTotals = useMemo(() => ({
    electric: routes.filter((route) => route.kind === "electric").reduce((sum, route) => sum + routeLength(route, fixtures, objects, existing, lining), 0),
    cold: routes.filter((route) => route.kind === "cold").reduce((sum, route) => sum + routeLength(route, fixtures, objects, existing, lining), 0),
    hot: routes.filter((route) => route.kind === "hot").reduce((sum, route) => sum + routeLength(route, fixtures, objects, existing, lining), 0),
  }), [routes, fixtures, objects, existing, lining]);

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
    const socketCount = fixtures.filter((fixture) => fixture.kind === "outlet").reduce((sum, fixture) => sum + fixture.quantity, 0) + objects.filter((object) => object.connections?.includes("electric")).length;
    return [
      { key: "per-cold", category: "plomberie", label: "Tube PER eau froide", required: routeTotals.cold, unit: "m", detail: "Tracés + 15 %" },
      { key: "per-hot", category: "plomberie", label: "Tube PER eau chaude", required: routeTotals.hot, unit: "m", detail: "Tracés + 15 %" },
      { key: "cable-15", category: "electricite", label: "Câble 1,5 mm²", required: routeTotals.electric * 0.25, unit: "m", detail: "Part éclairage estimée" },
      { key: "cable-25", category: "electricite", label: "Câble 2,5 mm²", required: routeTotals.electric * 0.75, unit: "m", detail: "Part prises estimée" },
      { key: "sockets", category: "electricite", label: "Prises / sorties complètes", required: socketCount, unit: "u", detail: "Points muraux et équipements raccordés" },
      { key: "rails", category: "ossature", label: "Rails métalliques", required: railLength, unit: "m", detail: "Sol + plafond, portes déduites" },
      { key: "studs", category: "ossature", label: "Montants métalliques", required: studCount, unit: "u", detail: `Entraxe ${build.studSpacing} cm + renforts` },
      { key: "insulation", category: "isolation", label: "Isolation", required: wallArea, unit: "m²", detail: "Murs nets avec marge" },
      { key: "ba13", category: "plaques", label: "Plaques de plâtre", required: wallArea, unit: "m²", detail: "Surface nette avec marge" },
      { key: "tiles", category: "carrelage", label: "Revêtement de sol", required: tileArea, unit: "m²", detail: `Sol + ${build.tileWaste} %` },
      { key: "tile-adhesive", category: "consommables", label: "Colle carrelage", required: tileArea, unit: "m²", detail: "Couverture à prévoir" },
    ];
  }, [metrics, routeTotals, fixtures, objects, build]);

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
        const restoredExisting = copyPoints(draft.existing);
        const restoredLining = copyPoints(draft.lining?.length >= 3 ? draft.lining : createLining(draft.existing, restoredBuild));
        const restoredFixtures = releaseLightFixtures(copyFixtures(draft.fixtures ?? []), restoredExisting, restoredLining);
        // Browser-only draft hydration intentionally restores the related state atomically here.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setExisting(restoredExisting); setLining(restoredLining);
        setFixtures(restoredFixtures); setObjects(copyObjects(draft.objects ?? [])); setRoutes(copyRoutes(draft.routes ?? [])); setMeasurements(copyMeasurements(draft.measurements ?? []));
        setBuild(restoredBuild); setBudgetChoices(draft.budgetChoices ?? {}); setProjectName(draft.projectName ?? "Projet rénovation");
        setElementSnap(draft.elementSnap ?? true); setShowPrices(draft.showPrices ?? false); setShowAllNetworks(draft.showAllNetworks ?? false); setMeasurementSnap(draft.measurementSnap ?? true); setDimensionVisibility({ ...defaultDimensionVisibility, ...(draft.dimensionVisibility ?? {}) });
      }
      const storedProducts = JSON.parse(localStorage.getItem(PRODUCTS_KEY) ?? "null"); if (Array.isArray(storedProducts)) setProducts(storedProducts);
      const saves = JSON.parse(localStorage.getItem(SAVES_KEY) ?? "[]"); if (Array.isArray(saves)) setSavedProjects(saves);
    } catch { setNotice("Le brouillon précédent était illisible ; un nouveau projet a été ouvert."); }
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem(DRAFT_KEY, JSON.stringify({ projectName, existing, lining, fixtures, objects, routes, measurements, build, budgetChoices, elementSnap, showPrices, showAllNetworks, measurementSnap, dimensionVisibility })); }, [hydrated, projectName, existing, lining, fixtures, objects, routes, measurements, build, budgetChoices, elementSnap, showPrices, showAllNetworks, measurementSnap, dimensionVisibility]);
  useEffect(() => { if (hydrated) localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products)); }, [hydrated, products]);
  useEffect(() => { if (hydrated) localStorage.setItem(SAVES_KEY, JSON.stringify(savedProjects)); }, [hydrated, savedProjects]);
  useEffect(() => {
    const root = document.documentElement; let frame = 0;
    const followPointer = (event: globalThis.PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const horizontal = event.clientX / Math.max(window.innerWidth, 1) - 0.5;
        const vertical = event.clientY / Math.max(window.innerHeight, 1) - 0.5;
        root.style.setProperty("--pointer-x", `${event.clientX}px`);
        root.style.setProperty("--pointer-y", `${event.clientY}px`);
        root.style.setProperty("--pointer-dx", `${horizontal * 34}px`);
        root.style.setProperty("--pointer-dy", `${vertical * 26}px`);
      });
    };
    window.addEventListener("pointermove", followPointer, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("pointermove", followPointer); };
  }, []);
  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === canvasPanelRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    const updateAspect = () => {
      const { width, height } = svg.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const next = width / height;
      setCanvasAspect((current) => Math.abs(current - next) < 0.001 ? current : next);
    };
    updateAspect();
    const observer = new ResizeObserver(updateAspect);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleNativeWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const anchor = pointFromEvent(event);
      zoomView(event.deltaY < 0 ? 0.88 : 1.14, anchor ?? undefined);
    };
    svg.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleNativeWheel);
  }, [pointFromEvent, zoomView]);

  function beginCanvasPan(event: ReactPointerEvent<SVGRectElement>) {
    if (event.button !== 0 || measureMode) return;
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const view = { ...activeView };
    panRef.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      origin: view,
      scaleX: Math.abs(matrix.a) || 1,
      scaleY: Math.abs(matrix.d) || Math.abs(matrix.a) || 1,
    };
    setViewport(view);
    setIsPanning(true);
    clearSelection();
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === canvasPanelRef.current) await document.exitFullscreen();
      else await canvasPanelRef.current?.requestFullscreen();
    } catch {
      setNotice("Le plein écran n’est pas disponible dans ce navigateur");
    }
  }
  function clearSelection(except?: "wall" | "fixture" | "object" | "route" | "route-point" | "measurement") {
    if (except !== "wall") setSelectedWall(null); if (except !== "fixture") setSelectedFixtureId(null); if (except !== "object") setSelectedObjectId(null); if (except !== "route" && except !== "route-point") setSelectedRouteId(null); if (except !== "route-point") setSelectedRoutePoint(null); if (except !== "measurement") setSelectedMeasurementId(null);
  }
  function setPoints(layer: Layer, updater: (points: Point[]) => Point[]) { if (layer === "existing") setExisting((current) => updater(current)); else setLining((current) => updater(current)); }
  function snapPoint(point: Point, points: Point[], index: number) {
    if (!orthogonalSnap) return { x: round(point.x), y: round(point.y) };
    const previous = points[(index - 1 + points.length) % points.length]; const next = points[(index + 1) % points.length]; let x = point.x; let y = point.y;
    if (Math.abs(x - previous.x) < 10) x = previous.x; if (Math.abs(y - previous.y) < 10) y = previous.y;
    if (Math.abs(x - next.x) < 10) x = next.x; if (Math.abs(y - next.y) < 10) y = next.y;
    return { x: round(x), y: round(y) };
  }
  function nearestGuide(value: number, candidates: number[], tolerance = 7) {
    let best = value; let bestDistance = tolerance + 1;
    candidates.forEach((candidate) => { const distance = Math.abs(candidate - value); if (distance <= tolerance && distance < bestDistance) { best = candidate; bestDistance = distance; } });
    return best;
  }
  function snapObjectPosition(object: PlanObject, current: PlanObject[], rawX: number, rawY: number) {
    if (!elementSnap) return { x: round(rawX), y: round(rawY) };
    const otherObjects = current.filter((entry) => entry.id !== object.id);
    const gridX = Math.round(rawX / 5) * 5; const gridY = Math.round(rawY / 5) * 5;
    const orientation = signedArea(lining) >= 0 ? 1 : -1; const clearance = 3;
    const wallTargets = lining.reduce((targets, _, index) => {
      const wall = segment(lining, index); const dx = wall.b.x - wall.a.x; const dy = wall.b.y - wall.a.y; const length = Math.hypot(dx, dy) || 1;
      const normal = { x: -dy / length * orientation, y: dx / length * orientation };
      if (Math.abs(dx) < Math.abs(dy) * 0.12) targets.x.push(normal.x > 0 ? wall.a.x + clearance : wall.a.x - clearance - object.w);
      if (Math.abs(dy) < Math.abs(dx) * 0.12) targets.y.push(normal.y > 0 ? wall.a.y + clearance : wall.a.y - clearance - object.h);
      return targets;
    }, { x: [] as number[], y: [] as number[] });
    const objectXGuides = otherObjects.flatMap((entry) => [entry.x, entry.x + entry.w / 2, entry.x + entry.w]);
    const objectYGuides = otherObjects.flatMap((entry) => [entry.y, entry.y + entry.h / 2, entry.y + entry.h]);
    const xCandidates = [...wallTargets.x, ...objectXGuides.flatMap((guide) => [guide, guide - object.w / 2, guide - object.w])];
    const yCandidates = [...wallTargets.y, ...objectYGuides.flatMap((guide) => [guide, guide - object.h / 2, guide - object.h])];
    return { x: round(nearestGuide(gridX, xCandidates)), y: round(nearestGuide(gridY, yCandidates)) };
  }

  function snapMeasurementPoint(raw: Point) {
    if (!measurementSnap) return { x: round(raw.x), y: round(raw.y) };
    const candidates: Point[] = [...existing, ...lining, ...fixtures.map((fixture) => fixturePosition(fixture, existing, lining)), ...routes.flatMap((route) => effectiveRoutePoints(route, fixtures, objects, existing, lining))];
    [existing, lining].forEach((points) => { const projection = nearestWallProjection(raw, points); if (projection) candidates.push(projection.point); });
    objects.forEach((object) => {
      const left = object.x; const right = object.x + object.w; const top = object.y; const bottom = object.y + object.h; const centerX = object.x + object.w / 2; const centerY = object.y + object.h / 2;
      candidates.push({ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }, { x: centerX, y: centerY }, { x: clamp(raw.x, left, right), y: top }, { x: clamp(raw.x, left, right), y: bottom }, { x: left, y: clamp(raw.y, top, bottom) }, { x: right, y: clamp(raw.y, top, bottom) });
    });
    const nearest = candidates.reduce((best, point) => { const distance = Math.hypot(raw.x - point.x, raw.y - point.y); return !best || distance < best.distance ? { point, distance } : best; }, null as { point: Point; distance: number } | null);
    if (nearest && nearest.distance <= 12) return { x: round(nearest.point.x), y: round(nearest.point.y) };
    return { x: Math.round(raw.x / 5) * 5, y: Math.round(raw.y / 5) * 5 };
  }
  function startMeasurement(point?: Point) {
    setMeasureMode(true); setMeasurementDraft(point ? [snapMeasurementPoint(point)] : []); setMeasurementPreview(null); setContextMenu(null); clearSelection(); setNotice(point ? "Point de départ placé — ajoute un ou plusieurs points, puis Entrée" : "Clique le point de départ de la mesure");
  }
  function cancelMeasurement() { setMeasureMode(false); setMeasurementDraft([]); setMeasurementPreview(null); setNotice("Mesure annulée"); }
  function finishMeasurement() {
    if (measurementDraft.length < 2) { setNotice("Place au moins deux points pour enregistrer la mesure"); return; }
    const measurement: Measurement = { id: `measure-${uid()}`, points: copyPoints(measurementDraft) };
    setMeasurements((current) => [...current, measurement]); setSelectedMeasurementId(measurement.id); setDimensionVisibility((current) => ({ ...current, measurements: true })); setMeasureMode(false); setMeasurementDraft([]); setMeasurementPreview(null); clearSelection("measurement"); setNotice(`Mesure enregistrée · ${measurementSummary(measurement.points)}`);
  }
  function deleteMeasurement(measurementId: string) { setMeasurements((current) => current.filter((measurement) => measurement.id !== measurementId)); if (selectedMeasurementId === measurementId) setSelectedMeasurementId(null); setNotice("Mesure supprimée"); }
  function handleMeasurementPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!measureMode || event.button !== 0) return;
    const pointer = pointFromEvent(event); if (!pointer) return;
    event.preventDefault(); event.stopPropagation(); const point = snapMeasurementPoint(pointer);
    setMeasurementDraft((current) => { const last = current.at(-1); return last && Math.hypot(last.x - point.x, last.y - point.y) < 0.1 ? current : [...current, point]; });
    setMeasurementPreview(point); setNotice(measurementDraft.length ? "Point ajouté — Entrée pour terminer, Échap pour annuler" : "Déplace la souris puis clique le point suivant");
  }
  function contextTargetPoint(target: ContextTarget): Point | null {
    if (target.type === "plan" || target.type === "wall") return { ...target.point };
    if (target.type === "object") { const object = objects.find((entry) => entry.id === target.id); return object ? objectCenter(object) : null; }
    if (target.type === "fixture") { const fixture = fixtures.find((entry) => entry.id === target.id); return fixture ? fixturePosition(fixture, existing, lining) : null; }
    if (target.type === "route") { const route = routes.find((entry) => entry.id === target.id); return route ? polylineMidpoint(effectiveRoutePoints(route, fixtures, objects, existing, lining)) : null; }
    if (target.type === "route-point") { const route = routes.find((entry) => entry.id === target.routeId); return route ? effectiveRouteHandles(route, fixtures, objects, existing, lining).find((handle) => handle.storedIndex === target.pointIndex)?.point ?? null : null; }
    if (target.type === "measurement") { const measurement = measurements.find((entry) => entry.id === target.id); return measurement ? polylineMidpoint(measurement.points) : null; }
    return null;
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const pan = panRef.current;
    if (pan) {
      const dx = (event.clientX - pan.startClient.x) / pan.scaleX;
      const dy = (event.clientY - pan.startClient.y) / pan.scaleY;
      setViewport({ ...pan.origin, x: pan.origin.x - dx, y: pan.origin.y - dy });
      return;
    }
    const pointer = pointFromEvent(event); if (measureMode && pointer && measurementDraft.length) setMeasurementPreview(snapMeasurementPoint(pointer)); const drag = dragRef.current; if (!pointer || !drag) return;
    if (drag.type === "wall-point") setPoints(drag.layer, (points) => points.map((point, index) => index === drag.index ? snapPoint(pointer, points, index) : point));
    if (drag.type === "fixture") setFixtures((current) => current.map((fixture) => {
      if (fixture.id !== drag.id) return fixture;
      if (fixture.kind === "light") return { ...fixture, freePosition: { x: elementSnap ? Math.round(pointer.x / 5) * 5 : round(pointer.x), y: elementSnap ? Math.round(pointer.y / 5) * 5 : round(pointer.y) } };
      const points = fixture.layer === "existing" ? existing : lining; const nearest = nearestWallProjection(pointer, points); if (!nearest) return fixture;
      let offset = nearest.wallOffset;
      if (elementSnap) offset = clamp(Math.round(offset * nearest.wallLength / 5) * 5 / nearest.wallLength, 0.02, 0.98);
      return { ...fixture, wallIndex: nearest.wallIndex, offset };
    }));
    if (drag.type === "object" || drag.type === "resize-object") setObjects((current) => current.map((object) => {
      if (object.id !== drag.id) return object; let dx = pointer.x - drag.start.x; let dy = pointer.y - drag.start.y;
      if (drag.type === "object") return { ...object, ...snapObjectPosition(object, current, drag.origin.x + dx, drag.origin.y + dy) };
      if (elementSnap) { dx = Math.round(dx / 5) * 5; dy = Math.round(dy / 5) * 5; }
      let left = drag.origin.x; let right = drag.origin.x + drag.origin.w; let top = drag.origin.y; let bottom = drag.origin.y + drag.origin.h;
      if (drag.edge.includes("e")) right = Math.max(left + 20, right + dx);
      if (drag.edge.includes("w")) left = Math.min(right - 20, left + dx);
      if (drag.edge.includes("s")) bottom = Math.max(top + 20, bottom + dy);
      if (drag.edge.includes("n")) top = Math.min(bottom - 20, top + dy);
      return { ...object, x: round(left), y: round(top), w: round(right - left), h: round(bottom - top) };
    }));
    if (drag.type === "route-point") setRoutes((current) => current.map((route) => route.id === drag.routeId ? { ...route, points: route.points.map((point, index) => {
      if (index !== drag.pointIndex) return point;
      const nearest = nearestWallProjection(pointer, lining);
      return nearest ? { x: nearest.point.x, y: nearest.point.y, wallIndex: nearest.wallIndex, wallOffset: nearest.wallOffset, wallLayer: "lining" } : point;
    }) } : route));
    if (drag.type === "measurement-point") setMeasurements((current) => current.map((measurement) => measurement.id === drag.measurementId ? { ...measurement, points: measurement.points.map((point, index) => index === drag.pointIndex ? snapMeasurementPoint(pointer) : point) } : measurement));
  }
  function endDrag() {
    if (dragRef.current) setNotice("Modification enregistrée");
    dragRef.current = null;
    panRef.current = null;
    setIsPanning(false);
  }

  function beginPointDrag(event: ReactPointerEvent<SVGCircleElement>, layer: Layer, index: number) { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { type: "wall-point", layer, index }; setSelectedWall({ layer, index: Math.max(0, index - 1) }); clearSelection("wall"); }
  function beginFixtureDrag(event: ReactPointerEvent<SVGGElement>, fixture: WallFixture) { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { type: "fixture", id: fixture.id }; setSelectedFixtureId(fixture.id); clearSelection("fixture"); }
  function beginObjectDrag(event: ReactPointerEvent<SVGGElement>, object: PlanObject) { if (event.button !== 0) return; const pointer = pointFromEvent(event); if (!pointer) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { type: "object", id: object.id, start: pointer, origin: { x: object.x, y: object.y } }; setSelectedObjectId(object.id); clearSelection("object"); }
  function beginObjectResize(event: ReactPointerEvent<SVGRectElement>, object: PlanObject, edge: ResizeEdge) { if (event.button !== 0) return; const pointer = pointFromEvent(event); if (!pointer) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { type: "resize-object", id: object.id, edge, start: pointer, origin: { x: object.x, y: object.y, w: object.w, h: object.h } }; setSelectedObjectId(object.id); clearSelection("object"); }
  function beginMeasurementPointDrag(event: ReactPointerEvent<SVGCircleElement>, measurementId: string, pointIndex: number) { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { type: "measurement-point", measurementId, pointIndex }; setSelectedMeasurementId(measurementId); clearSelection("measurement"); }

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
  function regenerateLining() { const next = createLining(existing, build); const adjustedFixtures = fixtures.map((fixture) => fixture.layer === "lining" ? { ...fixture, wallIndex: Math.min(fixture.wallIndex, next.length - 1) } : fixture); setLining(next); setFixtures(adjustedFixtures); setRoutes((current) => mergeAutomaticRoutes(current, automaticRoutes(adjustedFixtures, objects, existing, next))); setNotice(build.autoSquareLining ? `${correctedWallCount} mur${correctedWallCount > 1 ? "s" : ""} redressé${correctedWallCount > 1 ? "s" : ""} pour les rails et le BA13` : "Doublage BA13 recalculé en suivant le bâti"); }

  function addFixture(kind: FixtureKind, position?: Point) {
    const layer: Layer = kind === "door" || kind === "window" ? "existing" : "lining"; const points = layer === "existing" ? existing : lining; let wallIndex = selectedWall?.layer === layer ? selectedWall.index : 0; let offset = 0.5; let freePosition: Point | undefined;
    if (kind === "light") { const fallback = existing.reduce((sum, point) => ({ x: sum.x + point.x / existing.length, y: sum.y + point.y / existing.length }), { x: 0, y: 0 }); freePosition = position ? { ...position } : fallback; }
    else if (position) { const nearest = nearestWallProjection(position, points); if (nearest) { wallIndex = nearest.wallIndex; offset = nearest.wallOffset; } }
    const fixture: WallFixture = { id: `${kind}-${uid()}`, kind, name: fixtureMeta[kind].label, layer, wallIndex: Math.min(wallIndex, points.length - 1), offset, width: kind === "door" ? 90 : kind === "window" ? 120 : 8, height: kind === "door" ? 215 : kind === "window" ? 110 : 8, mountHeight: kind === "window" ? 90 : kind === "outlet" ? 30 : 0, quantity: 1, freePosition, unitPrice: 0, showPrice: true };
    const all = [...fixtures, fixture]; setFixtures(all); setRoutes((current) => mergeAutomaticRoutes(current, automaticRoutes(all, objects, existing, lining))); setSelectedFixtureId(fixture.id); clearSelection("fixture"); setNotice(kind === "light" ? "Point lumineux placé librement dans la pièce" : `${fixture.name} fixé au mur`);
  }
  function updateFixture(changes: Partial<WallFixture>) { if (selectedFixtureId) setFixtures((current) => current.map((fixture) => fixture.id === selectedFixtureId ? { ...fixture, ...changes } : fixture)); }
  function deleteFixtureById(fixtureId: string) { const nextFixtures = fixtures.filter((fixture) => fixture.id !== fixtureId); setFixtures(nextFixtures); setRoutes((current) => mergeAutomaticRoutes(current.filter((route) => route.sourceFixtureId !== fixtureId && route.targetFixtureId !== fixtureId), automaticRoutes(nextFixtures, objects, existing, lining))); if (selectedFixtureId === fixtureId) setSelectedFixtureId(null); }
  function deleteFixture() { if (selectedFixtureId) deleteFixtureById(selectedFixtureId); }
  function duplicateFixture(fixtureId: string) { const source = fixtures.find((fixture) => fixture.id === fixtureId); if (!source) return; const duplicate: WallFixture = { ...source, id: `${source.kind}-${uid()}`, name: `${source.name} copie`, offset: clamp(source.offset + 0.06, 0.02, 0.98), freePosition: source.freePosition ? { x: source.freePosition.x + 15, y: source.freePosition.y + 15 } : undefined }; const nextFixtures = [...fixtures, duplicate]; setFixtures(nextFixtures); setRoutes((current) => mergeAutomaticRoutes(current, automaticRoutes(nextFixtures, objects, existing, lining))); setSelectedFixtureId(duplicate.id); clearSelection("fixture"); setNotice("Élément dupliqué"); }

  function addObject(kind: ObjectKind, position?: Point) { const meta = objectMeta[kind]; const object: PlanObject = { id: `${kind}-${uid()}`, kind, name: meta.label, x: position ? position.x - meta.w / 2 : 170, y: position ? position.y - meta.h / 2 : 190, w: meta.w, h: meta.h, connections: meta.connections ? [...meta.connections] : [], unitPrice: 0, showPrice: true }; const nextObjects = [...objects, object]; setObjects(nextObjects); setRoutes((current) => mergeAutomaticRoutes(current, automaticRoutes(fixtures, nextObjects, existing, lining))); setSelectedObjectId(object.id); clearSelection("object"); }
  function updateObject(changes: Partial<PlanObject>) { if (!selectedObjectId) return; setObjects((current) => current.map((object) => object.id === selectedObjectId ? { ...object, ...changes } : object)); if (changes.name) setRoutes((current) => current.map((route) => route.targetObjectId === selectedObjectId ? { ...route, name: `${networkName(route.kind)} · ${changes.name}` } : route)); }
  function setObjectConnection(objectId: string, kind: NetworkKind, enabled: boolean) {
    const nextObjects = objects.map((object) => object.id === objectId ? { ...object, connections: enabled ? Array.from(new Set([...(object.connections ?? []), kind])) : (object.connections ?? []).filter((entry) => entry !== kind) } : object);
    setObjects(nextObjects); setRoutes((current) => mergeAutomaticRoutes(current, automaticRoutes(fixtures, nextObjects, existing, lining))); setNotice(enabled ? `${networkName(kind)} raccordée à l’équipement` : `${networkName(kind)} retirée de l’équipement`);
  }
  function deleteObject(objectId: string) { const nextObjects = objects.filter((object) => object.id !== objectId); setObjects(nextObjects); setRoutes((current) => mergeAutomaticRoutes(current.filter((route) => route.targetObjectId !== objectId), automaticRoutes(fixtures, nextObjects, existing, lining))); setSelectedObjectId(null); }
  function duplicateObject(objectId: string) { const source = objects.find((object) => object.id === objectId); if (!source) return; const duplicate: PlanObject = { ...source, id: `${source.kind}-${uid()}`, name: `${source.name} copie`, x: source.x + 15, y: source.y + 15, connections: source.connections ? [...source.connections] : [] }; const nextObjects = [...objects, duplicate]; setObjects(nextObjects); setRoutes((current) => mergeAutomaticRoutes(current, automaticRoutes(fixtures, nextObjects, existing, lining))); setSelectedObjectId(duplicate.id); clearSelection("object"); setNotice("Élément dupliqué"); }
  function rotateObject(objectId: string) { setObjects((current) => current.map((object) => object.id === objectId ? { ...object, w: object.h, h: object.w } : object)); }
  function selectObjectFromLayers(objectId: string) { setSelectedObjectId(objectId); clearSelection("object"); setNotice("Élément sélectionné — ses réglages sont ouverts ci-dessous"); }
  function moveObjectPriority(objectId: string, destination: "front" | "back") { setObjects((current) => { const object = current.find((entry) => entry.id === objectId); if (!object) return current; const rest = current.filter((entry) => entry.id !== objectId); return destination === "front" ? [...rest, object] : [object, ...rest]; }); setSelectedObjectId(objectId); setNotice(destination === "front" ? "Élément placé au premier plan" : "Élément placé à l’arrière-plan"); }
  function reorderObjectLayers(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    setObjects((current) => {
      const topFirst = [...current].reverse(); const fromIndex = topFirst.findIndex((entry) => entry.id === draggedId);
      if (fromIndex < 0 || !topFirst.some((entry) => entry.id === targetId)) return current;
      const next = [...topFirst]; const [dragged] = next.splice(fromIndex, 1); const insertIndex = next.findIndex((entry) => entry.id === targetId); next.splice(Math.max(0, insertIndex), 0, dragged); return next.reverse();
    });
    setSelectedObjectId(draggedId); setNotice("Priorité d’affichage modifiée");
  }
  function beginObjectLayerDrag(event: ReactDragEvent<HTMLDivElement>, objectId: string) { setDraggedObjectId(objectId); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", objectId); }
  function dropObjectLayer(event: ReactDragEvent<HTMLDivElement>, targetId: string) { event.preventDefault(); const draggedId = draggedObjectId ?? event.dataTransfer.getData("text/plain"); if (draggedId) reorderObjectLayers(draggedId, targetId); setDraggedObjectId(null); }
  function deleteRoute(routeId: string) { setRoutes((current) => current.filter((route) => route.id !== routeId)); if (selectedRouteId === routeId) setSelectedRouteId(null); setSelectedRoutePoint(null); setRouteWallWaypointMode(false); }
  function deleteRoutePoint(routeId: string, pointIndex: number) { const route = routes.find((entry) => entry.id === routeId); if (!route || pointIndex <= 0 || pointIndex >= route.points.length - 1) { setNotice("Ce point d’extrémité ne peut pas être supprimé seul"); return; } setRoutes((current) => current.map((entry) => entry.id === routeId ? { ...entry, points: entry.points.filter((_, index) => index !== pointIndex) } : entry)); setSelectedRoutePoint(null); setNotice("Nœud supprimé"); }
  function openContextMenu(event: ReactMouseEvent, target: ContextTarget) { event.preventDefault(); event.stopPropagation(); setContextMenu({ x: clamp(event.clientX, 12, Math.max(12, window.innerWidth - 246)), y: clamp(event.clientY, 12, Math.max(12, window.innerHeight - 430)), target }); if (target.type === "object") { setSelectedObjectId(target.id); clearSelection("object"); } if (target.type === "fixture") { setSelectedFixtureId(target.id); clearSelection("fixture"); } if (target.type === "route") { setSelectedRouteId(target.id); clearSelection("route"); } if (target.type === "route-point") { setSelectedRouteId(target.routeId); setSelectedRoutePoint({ routeId: target.routeId, pointIndex: target.pointIndex }); clearSelection("route-point"); } if (target.type === "measurement") { setSelectedMeasurementId(target.id); clearSelection("measurement"); } if (target.type === "wall") { setSelectedWall({ layer: target.layer, index: target.index }); clearSelection("wall"); } }
  function openPlanContextMenu(event: ReactMouseEvent<SVGSVGElement>) { const point = pointFromEvent(event); if (point) openContextMenu(event, { type: "plan", point }); }
  function addWallPointAt(target: Extract<ContextTarget, { type: "wall" }>) { setPoints(target.layer, (points) => { const next = copyPoints(points); next.splice(target.index + 1, 0, { ...target.point }); return next; }); setSelectedWall({ layer: target.layer, index: target.index }); setContextMenu(null); setNotice("Point ajouté à l’endroit choisi"); }
  function addRouteWaypointAt(target: Extract<ContextTarget, { type: "wall" }>) { if (!selectedRoute || target.layer !== "lining") return; const projected = projectOnSegment(target.point, lining, target.index); const waypoint: RoutePoint = { ...projected.point, wallIndex: target.index, wallOffset: projected.wallOffset, wallLayer: "lining" }; setRoutes((current) => current.map((route) => route.id === selectedRoute.id ? { ...route, points: [...route.points.slice(0, -1), waypoint, route.points.at(-1)!] } : route)); setRouteWallWaypointMode(false); setNotice(`Passage imposé sur le mur BA13 ${target.index + 1}`); }
  function runContextAction(action: () => void) { action(); setContextMenu(null); }

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null; const editing = element?.matches("input, textarea, select, [contenteditable='true']"); if (editing) return;
      if (event.key === "Escape") { setContextMenu(null); setRouteWallWaypointMode(false); setSelectedRoutePoint(null); if (measureMode) { setMeasureMode(false); setMeasurementDraft([]); setMeasurementPreview(null); setNotice("Mesure annulée"); } return; }
      if ((event.key === "m" || event.key === "M") && !event.ctrlKey && !event.metaKey) { event.preventDefault(); if (measureMode) { setMeasureMode(false); setMeasurementDraft([]); setMeasurementPreview(null); setNotice("Outil de mesure quitté"); } else { setMeasureMode(true); setMeasurementDraft([]); setMeasurementPreview(null); clearSelection(); setNotice("Clique le point de départ de la mesure"); } return; }
      if (event.key === "Enter" && measureMode) { event.preventDefault(); if (measurementDraft.length >= 2) { const measurement: Measurement = { id: `measure-${uid()}`, points: copyPoints(measurementDraft) }; setMeasurements((current) => [...current, measurement]); setSelectedMeasurementId(measurement.id); setDimensionVisibility((current) => ({ ...current, measurements: true })); setMeasureMode(false); setMeasurementDraft([]); setMeasurementPreview(null); clearSelection("measurement"); setNotice(`Mesure enregistrée · ${measurementSummary(measurement.points)}`); } else setNotice("Place au moins deux points pour enregistrer la mesure"); return; }
      if (event.key === "0") { event.preventDefault(); setViewport(null); return; }
      if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomView(1 / 1.2); return; }
      if (event.key === "-") { event.preventDefault(); zoomView(1.2); return; }
      if ((event.key === "r" || event.key === "R") && selectedObjectId) { event.preventDefault(); setObjects((current) => current.map((object) => object.id === selectedObjectId ? { ...object, w: object.h, h: object.w } : object)); return; }
      if ((event.ctrlKey || event.metaKey) && (event.key === "d" || event.key === "D")) {
        event.preventDefault();
        if (selectedObjectId) { const source = objects.find((object) => object.id === selectedObjectId); if (source) { const duplicate = { ...source, id: `${source.kind}-${uid()}`, name: `${source.name} copie`, x: source.x + 15, y: source.y + 15, connections: source.connections ? [...source.connections] : [] }; const next = [...objects, duplicate]; setObjects(next); setRoutes((current) => mergeAutomaticRoutes(current, automaticRoutes(fixtures, next, existing, lining))); setSelectedObjectId(duplicate.id); } }
        else if (selectedFixtureId) { const source = fixtures.find((fixture) => fixture.id === selectedFixtureId); if (source) { const duplicate = { ...source, id: `${source.kind}-${uid()}`, name: `${source.name} copie`, offset: clamp(source.offset + 0.06, 0.02, 0.98), freePosition: source.freePosition ? { x: source.freePosition.x + 15, y: source.freePosition.y + 15 } : undefined }; const next = [...fixtures, duplicate]; setFixtures(next); setRoutes((current) => mergeAutomaticRoutes(current, automaticRoutes(next, objects, existing, lining))); setSelectedFixtureId(duplicate.id); } }
        return;
      }
      if (event.key !== "Delete") return;
      event.preventDefault();
      if (selectedMeasurementId) { setMeasurements((current) => current.filter((measurement) => measurement.id !== selectedMeasurementId)); setSelectedMeasurementId(null); setNotice("Mesure supprimée"); return; }
      if (selectedRoutePoint) { const route = routes.find((entry) => entry.id === selectedRoutePoint.routeId); if (route && selectedRoutePoint.pointIndex > 0 && selectedRoutePoint.pointIndex < route.points.length - 1) { setRoutes((current) => current.map((entry) => entry.id === route.id ? { ...entry, points: entry.points.filter((_, index) => index !== selectedRoutePoint.pointIndex) } : entry)); setSelectedRoutePoint(null); } return; }
      if (selectedObjectId) { const next = objects.filter((object) => object.id !== selectedObjectId); setObjects(next); setRoutes((current) => mergeAutomaticRoutes(current.filter((route) => route.targetObjectId !== selectedObjectId), automaticRoutes(fixtures, next, existing, lining))); setSelectedObjectId(null); return; }
      if (selectedFixtureId) { const next = fixtures.filter((fixture) => fixture.id !== selectedFixtureId); setFixtures(next); setRoutes((current) => mergeAutomaticRoutes(current.filter((route) => route.sourceFixtureId !== selectedFixtureId && route.targetFixtureId !== selectedFixtureId), automaticRoutes(next, objects, existing, lining))); setSelectedFixtureId(null); return; }
      if (selectedRouteId) { setRoutes((current) => current.filter((route) => route.id !== selectedRouteId)); setSelectedRouteId(null); }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [existing, fixtures, lining, measureMode, measurementDraft, objects, routes, selectedFixtureId, selectedMeasurementId, selectedObjectId, selectedRouteId, selectedRoutePoint, zoomView]);
  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = (event: globalThis.PointerEvent) => {
      if (event.button !== 0) return;
      if (!(event.target as Element | null)?.closest?.(".context-menu")) setContextMenu(null);
    };
    const closeOnBlur = () => setContextMenu(null);
    window.addEventListener("pointerdown", closeMenu, true);
    window.addEventListener("blur", closeOnBlur);
    return () => { window.removeEventListener("pointerdown", closeMenu, true); window.removeEventListener("blur", closeOnBlur); };
  }, [contextMenu]);

  function addFreeRoute(kind: NetworkKind) { const source = fixtures.find((fixture) => fixtureSource(fixture.kind) === kind); const start = source ? fixtureWallAnchor(source, existing, lining) : storedWallAnchor({ x: 40, y: 40 }, lining); const end = storedWallAnchor({ x: 300, y: 260 }, lining); const route = { id: `route-${uid()}`, kind, name: `${networkName(kind)} vers une autre pièce`, sourceFixtureId: source?.id, points: [start, end] }; setRoutes((current) => [...current, route]); setSelectedRouteId(route.id); clearSelection("route"); setNotice("La sortie libre reste fixée au doublage BA13"); }
  function addWallWaypoint(event: ReactPointerEvent<SVGLineElement>, wallIndex: number) {
    if (!selectedRoute || !routeWallWaypointMode) return false;
    const pointer = pointFromEvent(event); if (!pointer) return false; const projected = projectOnSegment(pointer, lining, wallIndex);
    const waypoint: RoutePoint = { x: projected.point.x, y: projected.point.y, wallIndex, wallOffset: projected.wallOffset, wallLayer: "lining" };
    setRoutes((current) => current.map((route) => {
      if (route.id !== selectedRoute.id) return route;
      const insertAt = Math.max(1, route.points.length - 1);
      return { ...route, points: [...route.points.slice(0, insertAt), waypoint, ...route.points.slice(insertAt)] };
    }));
    setRouteWallWaypointMode(false); setNotice(`Point de passage ajouté sur le mur BA13 ${wallIndex + 1}`); return true;
  }
  function removeLastWallWaypoint() {
    if (!selectedRoute) return;
    const lastIndex = selectedRoute.points.reduce((found, point, index) => point.wallIndex !== undefined && index > 0 && index < selectedRoute.points.length - 1 ? index : found, -1);
    if (lastIndex < 0) { setNotice("Ce tracé n’a pas encore de passage mural"); return; }
    setRoutes((current) => current.map((route) => {
      if (route.id !== selectedRoute.id) return route;
      return { ...route, points: route.points.filter((_, index) => index !== lastIndex) };
    }));
    setNotice("Dernier point de passage retiré");
  }

  function resetPlan() {
    if (!window.confirm("Créer un nouveau plan ? Le brouillon actuel sera remplacé, mais tes configurations sauvegardées et ta bibliothèque de produits resteront disponibles.")) return;
    const nextExisting = copyPoints(defaultExisting); const nextBuild = { ...defaultBuild }; const nextLining = createLining(nextExisting, nextBuild); const nextFixtures = copyFixtures(defaultFixtures);
    const nextObjects = copyObjects(defaultObjects); setProjectName("Nouveau projet"); setExisting(nextExisting); setBuild(nextBuild); setLining(nextLining); setFixtures(nextFixtures); setObjects(nextObjects); setRoutes(automaticRoutes(nextFixtures, nextObjects, nextExisting, nextLining)); setMeasurements([]); setBudgetChoices({});
    setElementSnap(true); setShowPrices(false); setShowAllNetworks(false); setMeasurementSnap(true); setDimensionVisibility(defaultDimensionVisibility); setViewport(null); setMode("plan"); setSelectedWall({ layer: "existing", index: 0 }); setSelectedFixtureId(null); setSelectedObjectId(null); setSelectedRouteId(null); setSelectedMeasurementId(null); setMeasurementDraft([]); setMeasurementPreview(null); setMeasureMode(false); setRouteWallWaypointMode(false); setNotice("Nouveau plan créé — les sauvegardes et produits sont conservés");
  }
  function saveProject() { const name = projectName.trim() || "Projet sans nom"; const saved: SavedProject = { id: uid(), name, updatedAt: new Date().toISOString(), existing: copyPoints(existing), lining: copyPoints(lining), fixtures: copyFixtures(fixtures), objects: copyObjects(objects), routes: copyRoutes(routes), measurements: copyMeasurements(measurements), build: { ...build }, budgetChoices: { ...budgetChoices }, dimensionVisibility: { ...dimensionVisibility }, measurementSnap, elementSnap, showPrices, showAllNetworks }; setSavedProjects((current) => [saved, ...current]); setNotice(`« ${name} » sauvegardé`); }
  function loadProject(project: SavedProject) { const nextExisting = copyPoints(project.existing); const nextLining = copyPoints(project.lining); const nextFixtures = releaseLightFixtures(copyFixtures(project.fixtures), nextExisting, nextLining); const nextObjects = copyObjects(project.objects); setProjectName(project.name); setExisting(nextExisting); setLining(nextLining); setFixtures(nextFixtures); setObjects(nextObjects); setRoutes(mergeAutomaticRoutes(copyRoutes(project.routes), automaticRoutes(nextFixtures, nextObjects, nextExisting, nextLining))); setMeasurements(copyMeasurements(project.measurements ?? [])); setBuild({ ...defaultBuild, ...project.build }); setBudgetChoices({ ...project.budgetChoices }); setDimensionVisibility({ ...defaultDimensionVisibility, ...(project.dimensionVisibility ?? {}) }); setMeasurementSnap(project.measurementSnap ?? true); setElementSnap(project.elementSnap ?? true); setShowPrices(project.showPrices ?? false); setShowAllNetworks(project.showAllNetworks ?? false); setViewport(null); setSelectedMeasurementId(null); setMeasurementDraft([]); setMeasurementPreview(null); setMeasureMode(false); setRouteWallWaypointMode(false); setNotice(`« ${project.name} » chargé`); }

  function addProduct() { if (!newProduct.name.trim()) return; setProducts((current) => [{ ...newProduct, id: uid() }, ...current]); setNewProduct((current) => ({ ...current, name: "", reference: "", price: 0 })); setNotice("Produit ajouté à la bibliothèque"); }
  function updateProduct(id: string, changes: Partial<Product>) { setProducts((current) => current.map((product) => product.id === id ? { ...product, ...changes } : product)); }
  function importProducts(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const text = String(reader.result ?? ""); const lines = text.split(/\r?\n/).filter(Boolean); const delimiter = lines[0]?.includes(";") ? ";" : ","; const imported = lines.slice(1).map((line) => { const [name, reference, category, store, price, coverage, unit, packLabel, url] = line.split(delimiter).map((value) => value.trim()); if (!name) return null; return { id: uid(), name, reference: reference ?? "", category: (category as ProductCategory) || "consommables", store: store ?? "", price: Number(String(price).replace(",", ".")) || 0, coverage: Number(String(coverage).replace(",", ".")) || 1, coverageUnit: unit || "u", packLabel: packLabel || "unité", url: url ?? "", checkedAt: new Date().toISOString().slice(0, 10) } as Product; }).filter(Boolean) as Product[]; setProducts((current) => [...imported, ...current]); setNotice(`${imported.length} produits importés`); } catch { setNotice("Import impossible : vérifie le format CSV"); } }; reader.readAsText(file); event.target.value = ""; }

  const wallPath = (points: Point[]) => points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ") + " Z";
  const routePath = (route: NetworkRoute) => effectiveRoutePoints(route, fixtures, objects, existing, lining).map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const euros = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
  const contextMeasurePoint = contextMenu ? contextTargetPoint(contextMenu.target) : null;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand"><div className="brand-mark">AR</div><div><strong>Atelier Rénovation</strong><span>Plan · réseaux · matériaux</span></div></div>
        <nav className="mode-nav" aria-label="Modes de travail">{([["plan", "Plan"], ["layout", "Aménagement"], ["networks", "Réseaux"], ["budget", "Budget"], ["products", "Produits"]] as [Mode, string][]).map(([value, label]) => <button type="button" key={value} className={mode === value ? "active" : ""} onClick={() => { setMode(value); setRouteWallWaypointMode(false); clearSelection(); }}>{label}</button>)}</nav>
        <div className="project-actions"><input value={projectName} aria-label="Nom du projet" onChange={(event) => setProjectName(event.target.value)} /><button type="button" className="new-plan-button" onClick={resetPlan}>Nouveau plan</button><button type="button" className="save-button" onClick={saveProject}>Sauvegarder</button><details className="project-menu"><summary aria-label="Projets sauvegardés">{savedProjects.length}</summary><div><strong>Projets sauvegardés</strong>{savedProjects.length ? savedProjects.map((project) => <button type="button" key={project.id} onClick={() => loadProject(project)}><span>{project.name}</span><small>{new Date(project.updatedAt).toLocaleDateString("fr-FR")}</small></button>) : <p>Aucun projet nommé</p>}</div></details></div>
      </header>

      <section className="context-bar"><div><span className={`mode-dot mode-dot-${mode}`} /> <strong>{mode === "plan" ? "Structure du bâti" : mode === "layout" ? "Volumes et aménagement" : mode === "networks" ? showAllNetworks ? "Vue globale des réseaux" : `${networkName(networkFilter)} uniquement` : mode === "budget" ? "Métré et achats" : "Bibliothèque de produits"}</strong><small>{notice}</small></div><div className="quick-metrics"><span><b>{metrics.floor.toFixed(1)}</b> m² au sol</span><span><b>{metrics.wallNet.toFixed(1)}</b> m² de murs nets</span><span><b>{euros(renovationTotal)}</b> estimés</span></div></section>

      <section className={`main-workspace mode-${mode}`}>
        <div ref={canvasPanelRef} className="canvas-panel">
          <div className="canvas-toolbar">
            <div className="layer-legend"><span><i className="legend-existing" />Mur existant</span><span><i className="legend-lining" />Doublage BA13</span>{mode === "networks" && (showAllNetworks ? (["electric", "cold", "hot"] as NetworkKind[]).map((kind) => <span key={kind}><i className={`legend-${kind}`} />{networkName(kind)}</span>) : <span><i className={`legend-${networkFilter}`} />{networkName(networkFilter)}</span>)}</div>
            <div className="canvas-tools">
              <details className="dimension-menu">
                <summary>⌖ Cotes <b>{activeDimensionCount}</b></summary>
                <div>
                  {([['existing', 'Murs existants'], ['lining', 'Doublage BA13'], ['layout', 'Aménagement'], ['networks', 'Réseaux'], ['measurements', 'Mesures libres']] as [keyof DimensionVisibility, string][]).map(([key, label]) => <label key={key}><input type="checkbox" checked={dimensionVisibility[key]} onChange={(event) => { const checked = event.currentTarget.checked; setDimensionVisibility((current) => ({ ...current, [key]: checked })); }} /><span>{label}</span></label>)}
                  <button type="button" onClick={() => setDimensionVisibility({ existing: false, lining: false, layout: false, networks: false, measurements: false })}>Tout masquer</button>
                </div>
              </details>
              <button type="button" className={`measure-tool-button ${measureMode ? "active" : ""}`} onClick={() => measureMode ? cancelMeasurement() : startMeasurement()}>{measureMode ? "× Quitter mesure" : "⌁ Mesurer"}<kbd>M</kbd></button>
              {measureMode && <><label className="measurement-snap-toggle"><input type="checkbox" checked={measurementSnap} onChange={(event) => setMeasurementSnap(event.currentTarget.checked)} /> Aimant mesure</label><button type="button" className="finish-measure-button" disabled={measurementDraft.length < 2} onClick={finishMeasurement}>Terminer <kbd>Entrée</kbd></button></>}
              <label><input type="checkbox" checked={showPrices} onChange={(event) => setShowPrices(event.target.checked)} /> Prix</label>
              {mode === "plan" ? <label><input type="checkbox" checked={orthogonalSnap} onChange={(event) => setOrthogonalSnap(event.target.checked)} /> Aimant murs 90°</label> : <label><input type="checkbox" checked={elementSnap} onChange={(event) => setElementSnap(event.target.checked)} /> Aimant éléments 5 cm</label>}
              <button type="button" onClick={() => window.print()}>Imprimer</button><span className="editor-shortcuts">M · Entrée · Échap · Clic droit · Suppr</span>
            </div>
            <div className="canvas-navigation" aria-label="Navigation du plan">
              <button type="button" className="zoom-button" aria-label="Dézoomer" title="Dézoomer" onClick={() => zoomView(1.2)}>−</button>
              <output aria-label="Niveau de zoom">{zoomPercent}%</output>
              <button type="button" className="zoom-button" aria-label="Zoomer" title="Zoomer" onClick={() => zoomView(1 / 1.2)}>＋</button>
              <button type="button" className="fit-button" aria-label="Centrer et afficher toute la pièce" title="Centrer et afficher toute la pièce (0)" onClick={() => setViewport(null)}>▣</button>
              <button type="button" className="fullscreen-button" title={isFullscreen ? "Quitter le plein écran" : "Afficher le plan en plein écran"} onClick={toggleFullscreen}>{isFullscreen ? "Retour" : "Plein écran"}</button>
            </div>
          </div>

          <div className="drawing-stage">
            <svg ref={svgRef} className={`${routeWallWaypointMode ? "waypoint-mode" : ""} ${isPanning ? "is-panning" : ""} ${measureMode ? "measure-mode" : ""}`} viewBox={`${activeView.x} ${activeView.y} ${activeView.width} ${activeView.height}`} role="img" aria-label="Plan interactif de rénovation. Utilisez la molette pour zoomer et faites glisser le fond pour vous déplacer." onContextMenu={openPlanContextMenu} onPointerDownCapture={handleMeasurementPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag} onPointerCancel={endDrag}>
              <defs>
                <pattern id="cad-grid-minor" width="10" height="10" patternUnits="userSpaceOnUse"><path className="cad-grid-minor" d="M10 0H0V10" fill="none" /></pattern>
                <pattern id="cad-grid" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="url(#cad-grid-minor)" /><path className="cad-grid-major" d="M50 0H0V50" fill="none" /></pattern>
                <filter id="soft-shadow"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity=".16" /></filter>
              </defs>
              <rect x={activeView.x} y={activeView.y} width={activeView.width} height={activeView.height} className="canvas-bg" onPointerDown={beginCanvasPan} />
              <rect x={activeView.x} y={activeView.y} width={activeView.width} height={activeView.height} fill="url(#cad-grid)" pointerEvents="none" />
              <path d={wallPath(existing)} className="room-fill" pointerEvents="none" />

              {existing.map((_, index) => { const wall = segment(existing, index); const selected = selectedWall?.layer === "existing" && selectedWall.index === index; const label = wallDimensionLayout.existing[index]; return <g key={`existing-${index}`}><line className="wall-hit" x1={wall.a.x} y1={wall.a.y} x2={wall.b.x} y2={wall.b.y} onContextMenu={(event) => { const point = pointFromEvent(event); if (point) openContextMenu(event, { type: "wall", layer: "existing", index, point: projectOnSegment(point, existing, index).point }); }} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); setSelectedWall({ layer: "existing", index }); clearSelection("wall"); }} /><line className={`wall-line existing-wall ${selected ? "selected" : ""}`} x1={wall.a.x} y1={wall.a.y} x2={wall.b.x} y2={wall.b.y} pointerEvents="none" />{dimensionVisibility.existing && <g className="wall-dimension dimension-existing" transform={`translate(${label.x},${label.y})`}><rect x={-label.width / 2} y="-9" width={label.width} height="18" rx="8" /><text textAnchor="middle" dominantBaseline="middle">{Math.round(segmentLength(existing, index))} cm</text></g>}</g>; })}
              {lining.map((_, index) => { const wall = segment(lining, index); const selected = selectedWall?.layer === "lining" && selectedWall.index === index; const label = wallDimensionLayout.lining[index]; return <g key={`lining-${index}`}><line className={`wall-hit ${routeWallWaypointMode ? "waypoint-target" : ""}`} x1={wall.a.x} y1={wall.a.y} x2={wall.b.x} y2={wall.b.y} onContextMenu={(event) => { const point = pointFromEvent(event); if (point) openContextMenu(event, { type: "wall", layer: "lining", index, point: projectOnSegment(point, lining, index).point }); }} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); if (mode === "networks" && addWallWaypoint(event, index)) return; setSelectedWall({ layer: "lining", index }); clearSelection("wall"); }} /><line className={`wall-line lining-wall ${selected ? "selected" : ""} ${routeWallWaypointMode ? "waypoint-ready" : ""}`} x1={wall.a.x} y1={wall.a.y} x2={wall.b.x} y2={wall.b.y} pointerEvents="none" />{dimensionVisibility.lining && <g className="wall-dimension dimension-lining" transform={`translate(${label.x},${label.y})`}><rect x={-label.width / 2} y="-9" width={label.width} height="18" rx="8" /><text textAnchor="middle" dominantBaseline="middle">{Math.round(segmentLength(lining, index))} cm</text></g>}</g>; })}

              {mode === "plan" && (selectedWall?.layer === "existing" ? existing : lining).map((point, index) => <circle key={`vertex-${index}`} className={`wall-vertex ${selectedWall?.layer === "lining" ? "lining-vertex" : ""}`} cx={point.x} cy={point.y} r="6" onPointerDown={(event) => beginPointDrag(event, selectedWall?.layer ?? "existing", index)} />)}

              {fixtures.filter((fixture) => mode === "plan" ? fixtureMeta[fixture.kind].opening : mode === "networks" ? showAllNetworks ? Boolean(fixtureNetwork(fixture.kind) || fixtureSource(fixture.kind)) : fixtureNetwork(fixture.kind) === networkFilter || fixtureSource(fixture.kind) === networkFilter : mode === "layout" ? fixtureMeta[fixture.kind].opening : true).map((fixture) => {
                const points = fixture.layer === "existing" ? existing : lining; const wall = segment(points, Math.min(fixture.wallIndex, points.length - 1)); const position = fixturePosition(fixture, existing, lining); const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1; const tx = (wall.b.x - wall.a.x) / length; const ty = (wall.b.y - wall.a.y) / length; const orientation = signedArea(points) >= 0 ? 1 : -1; const labelNormal = { x: -ty * orientation, y: tx * orientation }; const half = fixture.width / 2; const opening = fixtureMeta[fixture.kind].opening; const selected = selectedFixtureId === fixture.id;
                return <g key={fixture.id} className={`wall-fixture ${opening ? "opening-fixture" : "technical-fixture"} ${fixture.freePosition ? "free-fixture" : ""} ${selected ? "selected" : ""}`} role="button" tabIndex={0} aria-label={fixture.name} onContextMenu={(event) => openContextMenu(event, { type: "fixture", id: fixture.id })} onPointerDown={(event) => beginFixtureDrag(event, fixture)}>{opening ? <><line x1={position.x - tx * half} y1={position.y - ty * half} x2={position.x + tx * half} y2={position.y + ty * half} stroke={fixtureMeta[fixture.kind].color} /><text x={position.x + labelNormal.x * 17} y={position.y + labelNormal.y * 17} textAnchor="middle" dominantBaseline="middle">{fixture.name}</text></> : <><circle cx={position.x} cy={position.y} r="9" fill={fixtureMeta[fixture.kind].color} /><text x={position.x} y={position.y} textAnchor="middle" dominantBaseline="middle">{fixtureMeta[fixture.kind].short}</text>{fixture.quantity > 1 && <text className="fixture-quantity" x={position.x + 9} y={position.y - 9}>{fixture.quantity}</text>}</>}{showPrices && fixture.showPrice !== false && (fixture.unitPrice ?? 0) > 0 && <g className="price-tag" transform={`translate(${position.x},${position.y + 20})`}><rect x="-27" y="-8" width="54" height="16" rx="7" /><text textAnchor="middle" dominantBaseline="middle">{euros((fixture.unitPrice ?? 0) * fixture.quantity)}</text></g>}</g>;
              })}

              {mode !== "plan" && objects.map((object) => { const selected = selectedObjectId === object.id; const connectedKinds = object.connections ?? []; const visibleConnections = showAllNetworks ? connectedKinds : connectedKinds.includes(networkFilter) ? [networkFilter] : []; const connected = visibleConnections.length > 0; const port = objectConnectionPoint(object, lining); return <g key={object.id} className={`plan-object ${mode === "networks" && !connected ? "ghost" : ""} ${mode === "networks" && connected ? "network-connected" : ""} ${selected ? "selected" : ""}`} role="button" tabIndex={0} aria-label={object.name} onContextMenu={(event) => openContextMenu(event, { type: "object", id: object.id })} onPointerDown={(event) => { if (mode !== "networks") { beginObjectDrag(event, object); return; } if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); setSelectedObjectId(object.id); clearSelection("object"); }}><rect x={object.x} y={object.y} width={object.w} height={object.h} rx="3" fill={objectMeta[object.kind].color} /><text x={object.x + object.w / 2} y={object.y + object.h / 2} textAnchor="middle" dominantBaseline="middle">{object.name}</text>{dimensionVisibility.layout && <text className="object-size" x={object.x + object.w / 2} y={object.y + object.h / 2 + 14} textAnchor="middle">{Math.round(object.w)} × {Math.round(object.h)} cm</text>}{mode === "networks" && visibleConnections.map((kind, index) => { const shift = (index - (visibleConnections.length - 1) / 2) * 14; return <g key={kind} className={`object-network-port port-${kind}`}><circle cx={port.x + shift} cy={port.y} r="8" /><text x={port.x + shift} y={port.y} textAnchor="middle" dominantBaseline="middle">{kind === "electric" ? "E" : kind === "cold" ? "F" : "C"}</text></g>; })}{showPrices && object.showPrice !== false && (object.unitPrice ?? 0) > 0 && <g className="price-tag" transform={`translate(${object.x + object.w / 2},${object.y + object.h + 12})`}><rect x="-27" y="-8" width="54" height="16" rx="7" /><text textAnchor="middle" dominantBaseline="middle">{euros(object.unitPrice ?? 0)}</text></g>}{mode === "layout" && <ObjectResizeZones object={object} onStart={beginObjectResize} />}</g>; })}

              {mode === "networks" && visibleRoutes.map((route) => {
                const freeTerminal = !route.targetFixtureId && !route.targetObjectId
                  ? effectiveRoutePoints(route, fixtures, objects, existing, lining).at(-1)
                  : undefined;
                const networkLabel = networkDimensionLayout.get(route.id);
                return <g key={route.id} className={`network-route route-${route.kind} ${selectedRouteId === route.id ? "selected" : ""}`}>
                  <path className="route-hit" d={routePath(route)} onContextMenu={(event) => openContextMenu(event, { type: "route", id: route.id })} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); setSelectedRouteId(route.id); setRouteWallWaypointMode(false); clearSelection("route"); }} />
                  <path d={routePath(route)} pointerEvents="none" />
                  {dimensionVisibility.networks && networkLabel && <g className="network-dimension" transform={`translate(${networkLabel.x},${networkLabel.y})`}><rect x={-networkLabel.width / 2} y="-9" width={networkLabel.width} height="18" rx="8" /><text textAnchor="middle" dominantBaseline="middle">{networkLabel.text}</text></g>}
                  {freeTerminal && <g className="route-exit-marker" transform={`translate(${freeTerminal.x},${freeTerminal.y})`} role="button" tabIndex={0} aria-label={`${route.name}, sortie vers une autre pièce`} onContextMenu={(event) => openContextMenu(event, { type: "route", id: route.id })} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); setSelectedRouteId(route.id); setRouteWallWaypointMode(false); clearSelection("route"); }}>
                    <title>{route.name}</title><circle r="9" /><text className="route-exit-symbol" textAnchor="middle" dominantBaseline="middle">↗</text><text className="route-exit-label" x="13" y="-12">Vers autre pièce</text>
                  </g>}
                </g>;
              })}
              {mode === "networks" && selectedRoute && (showAllNetworks || selectedRoute.kind === networkFilter) && <g className={`route-handles handles-${selectedRoute.kind}`}>{effectiveRouteHandles(selectedRoute, fixtures, objects, existing, lining).map(({ point, storedIndex, terminal, wallWaypoint }) => <circle key={storedIndex} cx={point.x} cy={point.y} r={terminal ? 4 : wallWaypoint ? 8 : 7} className={`${terminal ? "anchored" : wallWaypoint ? "wall-waypoint" : "movable"} ${selectedRoutePoint?.routeId === selectedRoute.id && selectedRoutePoint.pointIndex === storedIndex ? "selected" : ""}`} onContextMenu={(event) => openContextMenu(event, { type: "route-point", routeId: selectedRoute.id, pointIndex: storedIndex })} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); setSelectedRoutePoint({ routeId: selectedRoute.id, pointIndex: storedIndex }); if (terminal) return; const start = pointFromEvent(event); if (!start) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { type: "route-point", routeId: selectedRoute.id, pointIndex: storedIndex, start, origin: point }; }} />)}</g>}
              {dimensionVisibility.measurements && measurements.map((measurement) => { const summary = measurementSummary(measurement.points); const midpoint = polylineMidpoint(measurement.points); const width = Math.max(58, summary.length * 4.35 + 16); const selected = selectedMeasurementId === measurement.id; const polyline = measurement.points.map((point) => `${point.x},${point.y}`).join(" "); return <g key={measurement.id} className={`manual-measurement ${selected ? "selected" : ""}`}>
                <polyline className="measurement-hit" points={polyline} onContextMenu={(event) => openContextMenu(event, { type: "measurement", id: measurement.id })} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); setSelectedMeasurementId(measurement.id); clearSelection("measurement"); }} />
                <polyline className="measurement-line" points={polyline} pointerEvents="none" />
                <g className="measurement-badge" transform={`translate(${midpoint.x},${midpoint.y - 14})`} pointerEvents="none"><rect x={-width / 2} y="-9" width={width} height="18" rx="8" /><text textAnchor="middle" dominantBaseline="middle">{summary}</text></g>
                {selected && measurement.points.map((point, index) => <circle key={index} className="measurement-handle" cx={point.x} cy={point.y} r="6" onContextMenu={(event) => openContextMenu(event, { type: "measurement", id: measurement.id })} onPointerDown={(event) => beginMeasurementPointDrag(event, measurement.id, index)} />)}
              </g>; })}
              {measureMode && measurementDisplayPoints.length > 0 && (() => { const summary = measurementSummary(measurementDisplayPoints); const midpoint = polylineMidpoint(measurementDisplayPoints); const width = Math.max(58, summary.length * 4.35 + 16); const polyline = measurementDisplayPoints.map((point) => `${point.x},${point.y}`).join(" "); return <g className="manual-measurement measurement-draft" pointerEvents="none"><polyline className="measurement-line" points={polyline} />{measurementDisplayPoints.map((point, index) => <circle key={index} className="measurement-draft-point" cx={point.x} cy={point.y} r={index === measurementDisplayPoints.length - 1 ? 5 : 3.5} />)}<g className="measurement-badge" transform={`translate(${midpoint.x},${midpoint.y - 14})`}><rect x={-width / 2} y="-9" width={width} height="18" rx="8" /><text textAnchor="middle" dominantBaseline="middle">{summary}</text></g></g>; })()}
            </svg>
          </div>
          <div className="canvas-footer"><span><b>{existing.length}</b> angles du bâti</span><span><b>{metrics.existingPerimeter.toFixed(1)} m</b> de murs existants</span><span><b>{metrics.liningPerimeter.toFixed(1)} m</b> de doublage</span><span><b>{metrics.openingArea.toFixed(1)} m²</b> d’ouvertures déduites</span></div>
        </div>

        <aside className="inspector-panel">
          {mode === "plan" && (
            <div className="inspector-content">
              <div className="panel-title"><span>01 · Structure</span><h2>Murs et doublages</h2><p>Dessine la forme réelle, y compris les biais et les décrochements.</p></div>
              <div className="layer-switch"><button type="button" className={selectedWall?.layer !== "lining" ? "active" : ""} onClick={() => { setSelectedWall({ layer: "existing", index: 0 }); clearSelection("wall"); }}>Murs existants</button><button type="button" className={selectedWall?.layer === "lining" ? "active" : ""} onClick={() => { setSelectedWall({ layer: "lining", index: 0 }); clearSelection("wall"); }}>Doublage BA13</button></div>
              {selectedWall ? <><div className="selection-card"><span className="selection-label">{selectedWall.layer === "existing" ? "Mur existant" : "Doublage BA13"} · segment {selectedWall.index + 1}</span><div className="field-grid"><NumberInput label="Longueur" value={segmentLength(layerPoints, selectedWall.index)} min={10} onChange={updateSelectedWallLength} /><NumberInput label="Angle" value={segmentAngle(layerPoints, selectedWall.index)} unit="°" min={-180} max={180} onChange={updateSelectedWallAngle} /></div><div className="tool-grid"><button type="button" onClick={() => alignWall("horizontal")}>Aligner horizontal</button><button type="button" onClick={() => alignWall("vertical")}>Aligner vertical</button><button type="button" onClick={addWallPoint}>＋ Point intermédiaire</button><button type="button" onClick={addRecess}>＋ Décroché</button><button type="button" className="danger" disabled={layerPoints.length <= 3} onClick={deleteWallPoint}>Supprimer le point suivant</button></div></div>
              {selectedWall.layer === "existing" && <div className="lining-card"><div><span>Retrait du doublage</span><strong>{build.liningDepth} cm</strong></div><input type="range" min="3" max="30" value={build.liningDepth} onChange={(event) => { const liningDepth = Number(event.currentTarget.value); setBuild((current) => ({ ...current, liningDepth })); }} /><label className="lining-toggle"><input type="checkbox" checked={build.autoSquareLining} onChange={(event) => { const autoSquareLining = event.currentTarget.checked; setBuild((current) => ({ ...current, autoSquareLining })); }} /><span>Redresser les petits écarts pour les rails</span></label><NumberInput label="Tolérance angulaire" value={build.rightAngleTolerance} unit="°" min={0} max={30} onChange={(rightAngleTolerance) => setBuild((current) => ({ ...current, rightAngleTolerance }))} /><div className="lining-result"><span>Correction détectée</span><strong>{build.autoSquareLining ? `${correctedWallCount} mur${correctedWallCount > 1 ? "s" : ""}` : "désactivée"}</strong></div><button type="button" onClick={regenerateLining}>Recalculer les rails + le BA13</button><p>Écart inférieur ou égal à {build.rightAngleTolerance}° : le doublage est remis à l’équerre. Au-delà, il suit le biais réel du mur existant.</p></div>}</> : <div className="empty-selection"><span>↖</span><strong>Sélectionne un mur</strong><p>Les cotes se modifient directement dans ce panneau.</p></div>}
              <div className="fixture-tools"><div><span>Éléments intégrés aux murs</span><small>Ils glissent sur n’importe quel mur compatible.</small></div><button type="button" onClick={() => addFixture("door")}>＋ Porte</button><button type="button" onClick={() => addFixture("window")}>＋ Fenêtre</button></div>
              {selectedFixture && fixtureMeta[selectedFixture.kind].opening && <FixtureInspector fixture={selectedFixture} onChange={updateFixture} onDelete={deleteFixture} />}
            </div>
          )}

          {mode === "layout" && <div className="inspector-content">
            <div className="panel-title"><span>02 · Aménagement</span><h2>Volumes dans la pièce</h2><p>Ajoute les meubles et équipements, puis organise leur ordre d’affichage.</p></div>
            <div className="object-catalog">{(Object.keys(objectMeta) as ObjectKind[]).map((kind) => <button type="button" key={kind} onClick={() => addObject(kind)}><i style={{ background: objectMeta[kind].color }} /><span>{objectMeta[kind].label}</span><b>＋</b></button>)}</div>
            <div className="object-layers-card">
              <div className="object-layers-head"><div><span>Calques d’aménagement</span><small>Le premier élément passe devant les autres.</small></div><b>{objects.length}</b></div>
              <div className="object-layer-list">{[...objects].reverse().map((object, index) => <div key={object.id} draggable className={`object-layer-row ${selectedObjectId === object.id ? "selected" : ""} ${draggedObjectId === object.id ? "dragging" : ""}`} role="button" tabIndex={0} onClick={() => selectObjectFromLayers(object.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectObjectFromLayers(object.id); } }} onDragStart={(event) => beginObjectLayerDrag(event, object.id)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => dropObjectLayer(event, object.id)} onDragEnd={() => setDraggedObjectId(null)}>
                <span className="layer-drag-handle" title="Glisser pour changer la priorité">⠿</span><i className="layer-color" style={{ background: objectMeta[object.kind].color }} /><span className="layer-name"><strong>{object.name}</strong><small>{index === 0 ? "Premier plan" : `Niveau ${index + 1}`} · {Math.round(object.w)} × {Math.round(object.h)} cm</small></span><button type="button" onClick={(event) => { event.stopPropagation(); selectObjectFromLayers(object.id); }}>Modifier</button>
              </div>)}</div>
            </div>
            {selectedObject ? <div className="selection-card"><span className="selection-label">Objet sélectionné</span><input className="name-field" value={selectedObject.name} onChange={(event) => updateObject({ name: event.target.value })} /><div className="field-grid"><NumberInput label="Position X" value={selectedObject.x} min={-9999} onChange={(x) => updateObject({ x })} /><NumberInput label="Position Y" value={selectedObject.y} min={-9999} onChange={(y) => updateObject({ y })} /><NumberInput label="Largeur" value={selectedObject.w} min={20} onChange={(w) => updateObject({ w })} /><NumberInput label="Profondeur" value={selectedObject.h} min={20} onChange={(h) => updateObject({ h })} /><NumberInput label="Prix de l’élément" value={selectedObject.unitPrice ?? 0} unit="€" step={0.1} onChange={(unitPrice) => updateObject({ unitPrice })} /></div><ObjectConnections object={selectedObject} onToggle={(kind, enabled) => setObjectConnection(selectedObject.id, kind, enabled)} /><label className="display-price-toggle"><input type="checkbox" checked={selectedObject.showPrice !== false} onChange={(event) => updateObject({ showPrice: event.target.checked })} /> Afficher ce prix sur le plan</label><div className="tool-grid"><button type="button" onClick={() => updateObject({ w: selectedObject.h, h: selectedObject.w })}>Pivoter 90°</button><button type="button" onClick={() => moveObjectPriority(selectedObject.id, "front")}>Premier plan</button><button type="button" onClick={() => moveObjectPriority(selectedObject.id, "back")}>Arrière-plan</button><button type="button" className="danger" onClick={() => deleteObject(selectedObject.id)}>Supprimer</button></div></div> : <div className="empty-selection compact"><span>↖</span><strong>Choisis ou sélectionne un volume</strong></div>}
          </div>}

          {mode === "networks" && (
            <div className="inspector-content">
              <div className="panel-title"><span>03 · Technique</span><h2>Routage le long du BA13</h2><p>Chaque câble et tuyau suit automatiquement les murs. Un nœud sert uniquement à imposer un mur de passage.</p></div>
              <div className="network-switch"><button type="button" className={`all-networks-button ${showAllNetworks ? "active" : ""}`} onClick={() => { setShowAllNetworks(true); setSelectedRouteId(null); setRouteWallWaypointMode(false); }}>Tous les réseaux<strong>{(routeTotals.electric + routeTotals.cold + routeTotals.hot).toFixed(1)} m</strong></button>{(["electric", "cold", "hot"] as NetworkKind[]).map((kind) => <button type="button" key={kind} className={!showAllNetworks && networkFilter === kind ? "active" : ""} onClick={() => { setShowAllNetworks(false); setNetworkFilter(kind); setSelectedRouteId(null); setRouteWallWaypointMode(false); }}>{networkName(kind)}<strong>{routeTotals[kind].toFixed(1)} m</strong></button>)}</div>
              {showAllNetworks ? <div className="all-networks-hint"><span>Vue globale</span><p>Les câbles et tuyaux sont affichés ensemble. Choisis un réseau ci-dessus pour ajouter de nouveaux points.</p></div> : <div className="network-actions">{networkFilter === "electric" ? <><button type="button" onClick={() => addFixture("source-electric")}>＋ Tableau</button><button type="button" onClick={() => addFixture("outlet")}>＋ Prise</button><button type="button" onClick={() => addFixture("switch")}>＋ Interrupteur</button><button type="button" onClick={() => addFixture("light")}>＋ Éclairage</button></> : networkFilter === "cold" ? <><button type="button" onClick={() => addFixture("source-cold")}>＋ Arrivée EF</button><button type="button" onClick={() => addFixture("water-cold")}>＋ Sortie EF</button></> : <><button type="button" onClick={() => addFixture("source-hot")}>＋ Départ EC</button><button type="button" onClick={() => addFixture("water-hot")}>＋ Sortie EC</button></>}<button type="button" className="wide" onClick={() => addFreeRoute(networkFilter)}>＋ Tracé libre vers une autre pièce</button></div>}
              {selectedFixture && !fixtureMeta[selectedFixture.kind].opening && <><div className="fixture-move-hint">{selectedFixture.freePosition ? "Place librement ce point lumineux dans la pièce : le câble rejoint automatiquement le BA13 le plus proche." : "Glisse ce point vers le mur BA13 de ton choix : il changera automatiquement de paroi."}</div><FixtureInspector fixture={selectedFixture} onChange={updateFixture} onDelete={deleteFixture} /></>}
              {selectedObject && <div className="selection-card equipment-network-card"><span className="selection-label">Équipement sélectionné</span><strong>{selectedObject.name}</strong><p>Active les réseaux nécessaires. Le trajet rejoint le BA13 au point le plus proche, puis suit les murs jusqu’à la source.</p><ObjectConnections object={selectedObject} onToggle={(kind, enabled) => setObjectConnection(selectedObject.id, kind, enabled)} /></div>}
              {selectedRoute && <div className="selection-card route-card"><span className="selection-label">Tracé sélectionné</span><input className="name-field" value={selectedRoute.name} onChange={(event) => { const name = event.currentTarget.value; setRoutes((current) => current.map((route) => route.id === selectedRoute.id ? { ...route, name } : route)); }} /><p><strong>{routeLength(selectedRoute, fixtures, objects, existing, lining).toFixed(2)} m</strong> avec marge de 15 % · {selectedRoute.points.slice(1, -1).filter((point) => point.wallIndex !== undefined).length} mur(s) imposé(s)</p><div className="tool-grid route-tools"><button type="button" className={routeWallWaypointMode ? "active" : ""} onClick={() => { setRouteWallWaypointMode((current) => !current); setNotice(routeWallWaypointMode ? "Ajout de nœud annulé" : "Clique maintenant sur le mur BA13 à emprunter"); }}>＋ Imposer un mur</button><button type="button" onClick={removeLastWallWaypoint}>Retirer le dernier nœud</button><button type="button" className="danger" onClick={() => { setRoutes((current) => current.filter((route) => route.id !== selectedRoute.id)); setSelectedRouteId(null); setRouteWallWaypointMode(false); }}>Supprimer le tracé</button></div>{routeWallWaypointMode && <div className="route-map-hint"><span>1</span><div><strong>Choisis le mur à emprunter</strong><small>Le nœud restera aimanté au BA13 et pourra ensuite glisser sur les murs.</small></div></div>}</div>}
              <div className="route-list">{routes.filter((route) => showAllNetworks || route.kind === networkFilter).map((route) => <button type="button" key={route.id} className={`${selectedRouteId === route.id ? "active" : ""} route-list-${route.kind}`} onClick={() => { setSelectedRouteId(route.id); setRouteWallWaypointMode(false); clearSelection("route"); }}><i /><span>{route.name}</span><strong>{routeLength(route, fixtures, objects, existing, lining).toFixed(1)} m</strong></button>)}</div>
            </div>
          )}

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

          {mode === "products" && (
            <div className="inspector-content product-content">
              <div className="panel-title"><span>05 · Bibliothèque</span><h2>Produits & conditionnements</h2><p>Catalogue personnel réutilisable dans tous les projets. Les prix restent datés et modifiables.</p></div>
              <div className="import-actions"><button type="button" onClick={() => fileRef.current?.click()}>Importer un CSV</button><input ref={fileRef} hidden type="file" accept=".csv,text/csv" onChange={importProducts} /><small>Colonnes : nom; référence; catégorie; magasin; prix; couverture; unité; conditionnement; URL</small></div>
              <details className="add-product" open><summary>Ajouter un produit</summary><input placeholder="Nom du produit" value={newProduct.name} onChange={(event) => { const name = event.currentTarget.value; setNewProduct((current) => ({ ...current, name })); }} /><div className="field-grid"><label><span>Catégorie</span><select value={newProduct.category} onChange={(event) => { const category = event.currentTarget.value as ProductCategory; setNewProduct((current) => ({ ...current, category })); }}>{(["plomberie", "electricite", "ossature", "isolation", "plaques", "carrelage", "consommables"] as ProductCategory[]).map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label><span>Magasin</span><input value={newProduct.store} onChange={(event) => { const store = event.currentTarget.value; setNewProduct((current) => ({ ...current, store })); }} /></label><NumberInput label="Prix du conditionnement" value={newProduct.price} unit="€" step={0.1} onChange={(price) => setNewProduct((current) => ({ ...current, price }))} /><NumberInput label="Couverture" value={newProduct.coverage} unit={newProduct.coverageUnit} step={0.1} onChange={(coverage) => setNewProduct((current) => ({ ...current, coverage }))} /></div><input placeholder="Référence / EAN" value={newProduct.reference} onChange={(event) => { const reference = event.currentTarget.value; setNewProduct((current) => ({ ...current, reference })); }} /><input placeholder="Lien vers la fiche produit" value={newProduct.url} onChange={(event) => { const url = event.currentTarget.value; setNewProduct((current) => ({ ...current, url })); }} /><button type="button" className="primary" onClick={addProduct}>Ajouter à la bibliothèque</button></details>
              <div className="product-list">{products.map((product) => <article key={product.id}><div className="product-head"><div><span>{product.store || "Sans magasin"}</span><strong>{product.name}</strong><small>{product.reference || "Sans référence"}</small></div>{product.url && <a href={product.url} target="_blank" rel="noreferrer">Fiche ↗</a>}</div><div className="product-fields"><NumberInput label="Prix" value={product.price} unit="€" step={0.1} onChange={(price) => updateProduct(product.id, { price, checkedAt: new Date().toISOString().slice(0, 10) })} /><NumberInput label={`Couverture / ${product.packLabel}`} value={product.coverage} unit={product.coverageUnit} step={0.1} onChange={(coverage) => updateProduct(product.id, { coverage })} /></div><footer><span>{product.category}</span><small>Prix vérifié le {formatDate(product.checkedAt)}</small><button type="button" onClick={() => setProducts((current) => current.filter((entry) => entry.id !== product.id))}>Supprimer</button></footer></article>)}</div>
            </div>
          )}
        </aside>
      </section>
      {contextMenu && <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" aria-label="Actions rapides" onContextMenu={(event) => event.preventDefault()}>
        {contextMenu.target.type === "plan" && <>
          <div className="context-menu-title"><span>Plan</span><small>{Math.round(contextMenu.target.point.x)} × {Math.round(contextMenu.target.point.y)} cm</small></div>
          {mode === "layout" && <><button type="button" role="menuitem" onClick={() => runContextAction(() => addObject("cabinet", contextMenu.target.type === "plan" ? contextMenu.target.point : undefined))}><i>▣</i>Ajouter un meuble bas</button><button type="button" role="menuitem" onClick={() => runContextAction(() => addObject("worktop", contextMenu.target.type === "plan" ? contextMenu.target.point : undefined))}><i>▰</i>Ajouter un plan de travail</button><button type="button" role="menuitem" onClick={() => runContextAction(() => addObject("custom", contextMenu.target.type === "plan" ? contextMenu.target.point : undefined))}><i>◇</i>Ajouter un volume libre</button></>}
          {mode === "networks" && !showAllNetworks && networkFilter === "electric" && <><button type="button" role="menuitem" onClick={() => runContextAction(() => addFixture("light", contextMenu.target.type === "plan" ? contextMenu.target.point : undefined))}><i>✦</i>Ajouter un point lumineux</button><button type="button" role="menuitem" onClick={() => runContextAction(() => addFixture("outlet", contextMenu.target.type === "plan" ? contextMenu.target.point : undefined))}><i>⊡</i>Ajouter une prise au mur proche</button></>}
          {mode === "networks" && !showAllNetworks && networkFilter !== "electric" && <button type="button" role="menuitem" onClick={() => runContextAction(() => addFixture(networkFilter === "cold" ? "water-cold" : "water-hot", contextMenu.target.type === "plan" ? contextMenu.target.point : undefined))}><i>◉</i>Ajouter une sortie au mur proche</button>}
          {mode === "plan" && <><button type="button" role="menuitem" onClick={() => runContextAction(() => addFixture("door", contextMenu.target.type === "plan" ? contextMenu.target.point : undefined))}><i>▯</i>Ajouter une porte au mur proche</button><button type="button" role="menuitem" onClick={() => runContextAction(() => addFixture("window", contextMenu.target.type === "plan" ? contextMenu.target.point : undefined))}><i>═</i>Ajouter une fenêtre au mur proche</button></>}
          <div className="context-menu-separator" /><button type="button" role="menuitem" onClick={() => runContextAction(() => setViewport(null))}><i>▣</i>Centrer tout le plan <kbd>0</kbd></button>
        </>}
        {contextMenu.target.type === "object" && (() => { const object = objects.find((entry) => entry.id === contextMenu.target.id); if (!object) return null; const connected = object.connections?.includes(networkFilter) ?? false; return <><div className="context-menu-title"><span>{object.name}</span><small>{Math.round(object.w)} × {Math.round(object.h)} cm</small></div><button type="button" role="menuitem" onClick={() => runContextAction(() => duplicateObject(object.id))}><i>⧉</i>Dupliquer <kbd>Ctrl D</kbd></button><button type="button" role="menuitem" onClick={() => runContextAction(() => rotateObject(object.id))}><i>↻</i>Pivoter de 90° <kbd>R</kbd></button>{mode === "layout" && <><button type="button" role="menuitem" onClick={() => runContextAction(() => moveObjectPriority(object.id, "front"))}><i>↑</i>Placer au premier plan</button><button type="button" role="menuitem" onClick={() => runContextAction(() => moveObjectPriority(object.id, "back"))}><i>↓</i>Placer à l’arrière-plan</button></>}{mode === "networks" && !showAllNetworks && <button type="button" role="menuitem" onClick={() => runContextAction(() => setObjectConnection(object.id, networkFilter, !connected))}><i>{connected ? "−" : "+"}</i>{connected ? "Retirer" : "Raccorder"} · {networkName(networkFilter)}</button>}<div className="context-menu-separator" /><button type="button" role="menuitem" className="danger" onClick={() => runContextAction(() => deleteObject(object.id))}><i>×</i>Supprimer <kbd>Suppr</kbd></button></>; })()}
        {contextMenu.target.type === "fixture" && (() => { const fixture = fixtures.find((entry) => entry.id === contextMenu.target.id); if (!fixture) return null; return <><div className="context-menu-title"><span>{fixture.name}</span><small>{fixture.freePosition ? "Position libre" : `Mur ${fixture.wallIndex + 1}`}</small></div><button type="button" role="menuitem" onClick={() => runContextAction(() => duplicateFixture(fixture.id))}><i>⧉</i>Dupliquer <kbd>Ctrl D</kbd></button><div className="context-menu-separator" /><button type="button" role="menuitem" className="danger" onClick={() => runContextAction(() => deleteFixtureById(fixture.id))}><i>×</i>Supprimer <kbd>Suppr</kbd></button></>; })()}
        {contextMenu.target.type === "route" && (() => { const route = routes.find((entry) => entry.id === contextMenu.target.id); if (!route) return null; return <><div className="context-menu-title"><span>{route.name}</span><small>{routeLength(route, fixtures, objects, existing, lining).toFixed(1)} m</small></div><button type="button" role="menuitem" onClick={() => runContextAction(() => { setSelectedRouteId(route.id); setRouteWallWaypointMode(true); setNotice("Clique sur le mur BA13 à emprunter"); })}><i>＋</i>Imposer un mur</button><div className="context-menu-separator" /><button type="button" role="menuitem" className="danger" onClick={() => runContextAction(() => deleteRoute(route.id))}><i>×</i>Supprimer le tracé <kbd>Suppr</kbd></button></>; })()}
        {contextMenu.target.type === "route-point" && (() => { const route = routes.find((entry) => entry.id === contextMenu.target.routeId); const removable = !!route && contextMenu.target.pointIndex > 0 && contextMenu.target.pointIndex < route.points.length - 1; return <><div className="context-menu-title"><span>{removable ? "Nœud de passage" : "Extrémité raccordée"}</span><small>{removable ? "Aimanté au BA13" : "Liée à son élément"}</small></div><button type="button" role="menuitem" className="danger" disabled={!removable} onClick={() => runContextAction(() => deleteRoutePoint(contextMenu.target.type === "route-point" ? contextMenu.target.routeId : "", contextMenu.target.type === "route-point" ? contextMenu.target.pointIndex : -1))}><i>×</i>{removable ? "Supprimer le nœud" : "Extrémité non supprimable"}<kbd>Suppr</kbd></button></>; })()}
        {contextMenu.target.type === "measurement" && (() => { const measurement = measurements.find((entry) => entry.id === contextMenu.target.id); if (!measurement) return null; return <><div className="context-menu-title"><span>Mesure libre</span><small>{measurementSummary(measurement.points)}</small></div><button type="button" role="menuitem" className="danger" onClick={() => runContextAction(() => deleteMeasurement(measurement.id))}><i>×</i>Supprimer la mesure <kbd>Suppr</kbd></button></>; })()}
        {contextMenu.target.type === "wall" && <><div className="context-menu-title"><span>{contextMenu.target.layer === "lining" ? "Doublage BA13" : "Mur existant"}</span><small>Segment {contextMenu.target.index + 1}</small></div>{mode === "plan" && <button type="button" role="menuitem" onClick={() => runContextAction(() => addWallPointAt(contextMenu.target.type === "wall" ? contextMenu.target : { type: "wall", layer: "existing", index: 0, point: { x: 0, y: 0 } }))}><i>＋</i>Ajouter un point ici</button>}{mode === "plan" && contextMenu.target.layer === "existing" && <><button type="button" role="menuitem" onClick={() => runContextAction(() => addFixture("door", contextMenu.target.type === "wall" ? contextMenu.target.point : undefined))}><i>▯</i>Placer une porte ici</button><button type="button" role="menuitem" onClick={() => runContextAction(() => addFixture("window", contextMenu.target.type === "wall" ? contextMenu.target.point : undefined))}><i>═</i>Placer une fenêtre ici</button></>}{mode === "networks" && contextMenu.target.layer === "lining" && selectedRoute && <button type="button" role="menuitem" onClick={() => runContextAction(() => addRouteWaypointAt(contextMenu.target.type === "wall" ? contextMenu.target : { type: "wall", layer: "lining", index: 0, point: { x: 0, y: 0 } }))}><i>◎</i>Faire passer le tracé ici</button>}{mode === "networks" && !showAllNetworks && contextMenu.target.layer === "lining" && networkFilter === "electric" && <button type="button" role="menuitem" onClick={() => runContextAction(() => addFixture("outlet", contextMenu.target.type === "wall" ? contextMenu.target.point : undefined))}><i>⊡</i>Placer une prise ici</button>}{mode === "networks" && !showAllNetworks && contextMenu.target.layer === "lining" && networkFilter !== "electric" && <button type="button" role="menuitem" onClick={() => runContextAction(() => addFixture(networkFilter === "cold" ? "water-cold" : "water-hot", contextMenu.target.type === "wall" ? contextMenu.target.point : undefined))}><i>◉</i>Placer une sortie ici</button>}</>}
        {contextMenu.target.type !== "measurement" && contextMeasurePoint && <><div className="context-menu-separator" /><button type="button" role="menuitem" className="context-measure-action" onClick={() => runContextAction(() => startMeasurement(contextMeasurePoint))}><i>⌁</i>Mesurer depuis ici <kbd>M</kbd></button></>}
        <div className="context-menu-help">Clic droit : changer de cible · Clic gauche hors menu ou Échap : fermer</div>
      </div>}
    </main>
  );
}

function ObjectResizeZones({ object, onStart }: { object: PlanObject; onStart: (event: ReactPointerEvent<SVGRectElement>, object: PlanObject, edge: ResizeEdge) => void }) {
  const edge = 8; const corner = 14;
  return <g className="object-resize-zones" aria-label="Redimensionner depuis un bord ou un coin">
    <rect className="resize-zone edge-n" x={object.x + corner / 2} y={object.y - edge / 2} width={Math.max(1, object.w - corner)} height={edge} onPointerDown={(event) => onStart(event, object, "n")} />
    <rect className="resize-zone edge-s" x={object.x + corner / 2} y={object.y + object.h - edge / 2} width={Math.max(1, object.w - corner)} height={edge} onPointerDown={(event) => onStart(event, object, "s")} />
    <rect className="resize-zone edge-w" x={object.x - edge / 2} y={object.y + corner / 2} width={edge} height={Math.max(1, object.h - corner)} onPointerDown={(event) => onStart(event, object, "w")} />
    <rect className="resize-zone edge-e" x={object.x + object.w - edge / 2} y={object.y + corner / 2} width={edge} height={Math.max(1, object.h - corner)} onPointerDown={(event) => onStart(event, object, "e")} />
    {(["nw", "ne", "sw", "se"] as ResizeEdge[]).map((position) => <rect key={position} className={`resize-zone corner-${position}`} x={position.includes("w") ? object.x - corner / 2 : object.x + object.w - corner / 2} y={position.includes("n") ? object.y - corner / 2 : object.y + object.h - corner / 2} width={corner} height={corner} onPointerDown={(event) => onStart(event, object, position)} />)}
  </g>;
}

function ObjectConnections({ object, onToggle }: { object: PlanObject; onToggle: (kind: NetworkKind, enabled: boolean) => void }) {
  return <div className="connection-editor"><span>Raccordements de l’équipement</span><div>{(["electric", "cold", "hot"] as NetworkKind[]).map((kind) => { const checked = object.connections?.includes(kind) ?? false; return <label key={kind} className={`connection-chip connection-${kind} ${checked ? "active" : ""}`}><input type="checkbox" checked={checked} onChange={(event) => onToggle(kind, event.currentTarget.checked)} /><i />{networkName(kind)}</label>; })}</div><small>Les longueurs et le budget se recalculent automatiquement.</small></div>;
}

function FixtureInspector({ fixture, onChange, onDelete }: { fixture: WallFixture; onChange: (changes: Partial<WallFixture>) => void; onDelete: () => void }) {
  return <div className="selection-card fixture-card"><span className="selection-label">{fixture.freePosition ? "Point libre sélectionné" : "Élément mural sélectionné"}</span><input className="name-field" value={fixture.name} onChange={(event) => onChange({ name: event.target.value })} /><div className="field-grid">{fixture.freePosition ? <><NumberInput label="Position X" value={fixture.freePosition.x} min={-9999} onChange={(x) => onChange({ freePosition: { ...fixture.freePosition!, x } })} /><NumberInput label="Position Y" value={fixture.freePosition.y} min={-9999} onChange={(y) => onChange({ freePosition: { ...fixture.freePosition!, y } })} /></> : <NumberInput label="Distance sur le mur" value={fixture.offset * 100} unit="%" min={0} max={100} onChange={(offset) => onChange({ offset: offset / 100 })} />}<NumberInput label="Largeur" value={fixture.width} onChange={(width) => onChange({ width })} /><NumberInput label="Hauteur" value={fixture.height} onChange={(height) => onChange({ height })} /><NumberInput label="Hauteur de pose" value={fixture.mountHeight} onChange={(mountHeight) => onChange({ mountHeight })} /><NumberInput label="Quantité groupée" value={fixture.quantity} unit="u" min={1} step={1} onChange={(quantity) => onChange({ quantity: Math.max(1, Math.round(quantity)) })} /><NumberInput label="Prix unitaire" value={fixture.unitPrice ?? 0} unit="€" step={0.1} onChange={(unitPrice) => onChange({ unitPrice })} /></div><label className="display-price-toggle"><input type="checkbox" checked={fixture.showPrice !== false} onChange={(event) => onChange({ showPrice: event.target.checked })} /> Afficher ce prix sur le plan</label><button type="button" className="danger wide-danger" onClick={onDelete}>Supprimer l’élément</button></div>;
}
