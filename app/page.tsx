"use client";

import { useEffect, useMemo, useState } from "react";

type Location = "wall" | "peninsula";

type Preset = {
  name: string;
  length: number;
  depth: number;
  aisle: number;
  stools: number;
};

const presets: Preset[] = [
  { name: "Recommandée", length: 240, depth: 75, aisle: 120, stools: 3 },
  { name: "Maxi plan", length: 260, depth: 90, aisle: 115, stools: 3 },
  { name: "Compacte", length: 210, depth: 70, aisle: 110, stools: 2 },
];

const zoneColors = {
  tall: "#28433f",
  low: "#c8744f",
  peninsula: "#dfa95a",
  fixed: "#87907d",
};

function Metric({ label, value, tone = "good" }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="field-group">
      <legend>{label}</legend>
      <div className="segmented">
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            className={value === option.value ? "active" : ""}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function PlanRect({
  x,
  y,
  width,
  height,
  label,
  fill,
  compact,
  moduleId,
  selected,
  onSelect,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  fill: string;
  compact?: string;
  moduleId?: string;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const displayLabel = width >= 120 ? label : (compact ?? label);
  const interactive = Boolean(moduleId && onSelect);

  return (
    <g
      className={interactive ? "plan-module-group" : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Afficher la fiche : ${label}` : undefined}
      onClick={interactive ? () => onSelect?.(moduleId!) : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.(moduleId!);
        }
      } : undefined}
    >
      <rect className={selected ? "plan-module selected" : "plan-module"} x={x} y={y} width={width} height={height} fill={fill} fillOpacity="0.2" stroke={fill} strokeWidth="1.5" />
      <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle">
        {displayLabel}
      </text>
    </g>
  );
}

export default function Home() {
  const [length, setLength] = useState(240);
  const [depth, setDepth] = useState(75);
  const [aisle, setAisle] = useState(120);
  const [stools, setStools] = useState(3);
  const [sinkLocation, setSinkLocation] = useState<Location>("wall");
  const [hobLocation, setHobLocation] = useState<Location>("wall");
  const [showFlow, setShowFlow] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [selectedModule, setSelectedModule] = useState("prep");
  const [hydrated, setHydrated] = useState(false);

  const peninsulaX = 470 - length;
  const peninsulaY = 60 + aisle;
  const rearClearance = Math.max(0, 440 - (peninsulaY + depth) - (stools ? 45 : 0));
  const prepWidth = Math.max(60, length - (sinkLocation === "wall" ? 120 : 150));
  const workComfort = aisle >= 100 && aisle <= 130;
  const rearComfort = rearClearance >= 100;
  const equipmentComfort = !(sinkLocation === "peninsula" && hobLocation === "peninsula");

  const flowPoints = useMemo(() => {
    const sink = sinkLocation === "wall" ? [500, 105] : [440, peninsulaY + depth / 2];
    const prep = [peninsulaX + prepWidth / 2, peninsulaY + depth / 2];
    const hob = hobLocation === "wall" ? [440, 30] : [peninsulaX + prepWidth * 0.62, peninsulaY + depth / 2];
    return [[150, 72], sink, prep, hob];
  }, [sinkLocation, hobLocation, peninsulaX, peninsulaY, depth, prepWidth]);

  const moduleInfo = useMemo(() => ({
    pantry: { title: "Garde-manger", size: "60 × 60 cm", text: "Colonne de réserve pour l’épicerie et les petits appareils rarement utilisés." },
    oven: { title: "Colonne four", size: "60 × 60 cm", text: "Four à hauteur confortable, avec micro-ondes ou niche au-dessus." },
    fridge: { title: "Réfrigérateur", size: "60 × 60 cm", text: "Placée au bord de la zone de travail pour décharger directement sur la péninsule." },
    hob: { title: hobLocation === "wall" ? "Plaque murale" : "Rangement mural", size: "60 cm", text: hobLocation === "wall" ? "Hotte murale simple, cuisson éloignée des assises et appuis disponibles des deux côtés." : "La plaque passe sur la péninsule ; ce meuble devient un grand tiroir." },
    sink: { title: sinkLocation === "wall" ? "Évier sous fenêtre" : "Rangement sous fenêtre", size: "90 cm", text: sinkLocation === "wall" ? "Lumière naturelle, lave-vaisselle immédiatement à proximité et aucun équipement devant la cheminée." : "L’évier passe sur la péninsule ; ce linéaire récupère du rangement." },
    prep: { title: "Zone de préparation", size: `${prepWidth} × ${depth} cm`, text: "Surface principale entre le froid, le lavage et la cuisson. Les tiroirs accueillent ustensiles, casseroles et vaisselle quotidienne." },
    tri: { title: "Poubelles et tri", size: "60 cm", text: "Sous le plan, entre la préparation et le lave-vaisselle pour limiter les déplacements." },
    dishwasher: { title: "Lave-vaisselle", size: "60 cm", text: "Installé en bout de péninsule, au plus près de l’évier et sans couper la circulation principale." },
    peninsulaSink: { title: "Évier sur péninsule", size: "90 cm", text: "Cette option libère le mur de la fenêtre, mais réduit la surface de préparation disponible sur la péninsule." },
    fixed: { title: "Meuble coulissant prévu", size: "≈ 370 × 60 cm", text: "Rangement bas existant dans le projet, conservé accessible depuis le grand passage arrière." },
  }), [depth, hobLocation, prepWidth, sinkLocation]);

  const selectedInfo = moduleInfo[selectedModule as keyof typeof moduleInfo] ?? moduleInfo.prep;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("emmanuel-kitchen-config");
      if (saved) {
        const value = JSON.parse(saved);
        if (Number.isFinite(value.length)) setLength(value.length);
        if (Number.isFinite(value.depth)) setDepth(value.depth);
        if (Number.isFinite(value.aisle)) setAisle(value.aisle);
        if (Number.isFinite(value.stools)) setStools(value.stools);
        if (value.sinkLocation === "wall" || value.sinkLocation === "peninsula") setSinkLocation(value.sinkLocation);
        if (value.hobLocation === "wall" || value.hobLocation === "peninsula") setHobLocation(value.hobLocation);
      }
    } catch {
      // Une préférence locale invalide ne doit jamais bloquer le configurateur.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("emmanuel-kitchen-config", JSON.stringify({ length, depth, aisle, stools, sinkLocation, hobLocation }));
  }, [hydrated, length, depth, aisle, stools, sinkLocation, hobLocation]);

  function applyPreset(preset: Preset) {
    setLength(preset.length);
    setDepth(preset.depth);
    setAisle(preset.aisle);
    setStools(preset.stools);
  }

  function resetConfiguration() {
    applyPreset(presets[0]);
    setSinkLocation("wall");
    setHobLocation("wall");
    setShowFlow(true);
    setShowDimensions(true);
    setSelectedModule("prep");
  }

  const selectable = (moduleId: string) => ({
    moduleId,
    selected: selectedModule === moduleId,
    onSelect: setSelectedModule,
  });

  return (
    <main>
      <header className="site-header">
        <div>
          <p className="eyebrow">Projet cuisine · 5,30 × 5,00 m</p>
          <h1>Compose ta cuisine autour de la péninsule.</h1>
          <p className="intro">
            La cheminée reste libre. Ajuste les dimensions et les équipements : les passages se recalculent immédiatement.
          </p>
        </div>
        <div className="header-tools">
          <button type="button" className="text-action" onClick={resetConfiguration}>Réinitialiser</button>
          <button type="button" className="print-action" onClick={() => window.print()}>Imprimer le plan</button>
          <div className="header-mark" aria-hidden="true">EG</div>
        </div>
      </header>

      <section className="workspace">
        <div className="plan-shell">
          <div className="plan-toolbar">
            <div>
              <span className="section-kicker">Vue du dessus</span>
              <strong>Péninsule optimisée</strong>
            </div>
            <div className="toolbar-toggles">
              <label>
                <input type="checkbox" checked={showFlow} onChange={(event) => setShowFlow(event.target.checked)} />
                Flux
              </label>
              <label>
                <input type="checkbox" checked={showDimensions} onChange={(event) => setShowDimensions(event.target.checked)} />
                Cotes
              </label>
            </div>
          </div>

          <div className="plan-stage">
            <svg viewBox="-65 -70 650 650" role="img" aria-labelledby="plan-title plan-description">
              <title id="plan-title">Plan interactif de la cuisine avec péninsule</title>
              <desc id="plan-description">Pièce de cinq mètres trente par cinq mètres, cheminée centrale laissée libre, colonnes à gauche, lavage et cuisson à droite, péninsule réglable au centre.</desc>
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" className="grid-line" fill="none" />
                </pattern>
              </defs>

              <rect x="0" y="0" width="530" height="500" className="floor" />
              <rect x="0" y="0" width="530" height="500" fill="url(#grid)" opacity="0.55" />

              <g className="walls">
                <path d="M0 0 H200 V50 H380 V0 H530 V90" />
                <path d="M530 200 V300" />
                <path d="M530 420 V500 H160" />
                <path d="M30 500 H0 V400" />
                <path d="M0 300 V0" />
              </g>

              <g className="windows">
                <path d="M526 92 V198 M534 92 V198" />
                <path d="M-4 302 V398 M4 302 V398" />
              </g>

              <g className="opening-labels">
                <text x="544" y="150">Fenêtre haute</text>
                <text x="14" y="350">Grande fenêtre</text>
                <text x="544" y="360">Entrée</text>
                <text x="95" y="525" textAnchor="middle">Double porte salon</text>
              </g>

              <g className="chimney">
                <text x="290" y="78" textAnchor="middle">Cheminée condamnée · mur libre</text>
              </g>

              <PlanRect {...selectable("pantry")} x={0} y={0} width={60} height={60} label="Garde-manger" compact="Réserve" fill={zoneColors.tall} />
              <PlanRect {...selectable("oven")} x={60} y={0} width={60} height={60} label="Four + micro" compact="Four" fill={zoneColors.tall} />
              <PlanRect {...selectable("fridge")} x={120} y={0} width={60} height={60} label="Réfrigérateur" compact="Frigo" fill={zoneColors.tall} />

              <PlanRect x={380} y={0} width={30} height={60} label="Coulissant 30" compact="30" fill={zoneColors.low} />
              <PlanRect {...selectable("hob")} x={410} y={0} width={60} height={60} label={hobLocation === "wall" ? "Plaque + hotte" : "Tiroirs 60"} compact={hobLocation === "wall" ? "Plaque" : "T60"} fill={zoneColors.low} />
              <PlanRect x={470} y={0} width={60} height={60} label="Meuble d’angle" compact="Angle" fill={zoneColors.low} />
              <PlanRect {...selectable("sink")} x={470} y={60} width={60} height={90} label={sinkLocation === "wall" ? "Évier 90" : "Rangement 90"} compact={sinkLocation === "wall" ? "Évier" : "R90"} fill={zoneColors.low} />
              <PlanRect x={470} y={150} width={60} height={30} label="Joue 30" compact="30" fill={zoneColors.low} />

              <g className="peninsula-group">
                {sinkLocation === "wall" ? (
                  <>
                    <PlanRect {...selectable("prep")} x={peninsulaX} y={peninsulaY} width={prepWidth} height={depth} label="Grande préparation" compact="Préparation" fill={zoneColors.peninsula} />
                    <PlanRect {...selectable("tri")} x={peninsulaX + prepWidth} y={peninsulaY} width={60} height={depth} label="Poubelles / tri" compact="Tri" fill={zoneColors.peninsula} />
                    <PlanRect {...selectable("dishwasher")} x={410} y={peninsulaY} width={60} height={depth} label="Lave-vaisselle" compact="LV" fill={zoneColors.peninsula} />
                  </>
                ) : (
                  <>
                    <PlanRect {...selectable("prep")} x={peninsulaX} y={peninsulaY} width={prepWidth} height={depth} label="Préparation" compact="Prep." fill={zoneColors.peninsula} />
                    <PlanRect {...selectable("dishwasher")} x={320} y={peninsulaY} width={60} height={depth} label="Lave-vaisselle" compact="LV" fill={zoneColors.peninsula} />
                    <PlanRect {...selectable("peninsulaSink")} x={380} y={peninsulaY} width={90} height={depth} label="Évier 90" compact="Évier" fill={zoneColors.peninsula} />
                  </>
                )}
                {hobLocation === "peninsula" && (
                  <g className="hob-symbol" transform={`translate(${peninsulaX + prepWidth * 0.62} ${peninsulaY + depth / 2})`}>
                    <rect x="-30" y="-20" width="60" height="40" rx="5" />
                    <circle cx="-14" cy="-8" r="6" />
                    <circle cx="14" cy="8" r="7" />
                  </g>
                )}
              </g>

              {Array.from({ length: stools }).map((_, index) => {
                const stoolX = peninsulaX + (length * (index + 1)) / (stools + 1);
                return <circle key={index} cx={stoolX} cy={peninsulaY + depth + 22} r="12" className="stool" />;
              })}

              <PlanRect {...selectable("fixed")} x={160} y={440} width={370} height={60} label="Meuble étagère à portes coulissantes prévu" compact="Meuble coulissant" fill={zoneColors.fixed} />

              {showFlow && (
                <g className="work-flow">
                  <polyline points={flowPoints.map((point) => point.join(",")).join(" ")} />
                  {flowPoints.map((point, index) => (
                    <g key={index}>
                      <circle cx={point[0]} cy={point[1]} r="12" />
                      <text x={point[0]} y={point[1]} textAnchor="middle" dominantBaseline="middle">{index + 1}</text>
                    </g>
                  ))}
                </g>
              )}

              <path d="M530 360 C430 388 220 390 110 425 C90 445 90 470 90 490" className="main-route" />

              {showDimensions && (
                <g className="dimensions">
                  <path d={`M${peninsulaX} ${peninsulaY - 18} H470`} />
                  <text x={(peninsulaX + 470) / 2} y={peninsulaY - 28} textAnchor="middle">{length} cm</text>
                  <path d={`M${peninsulaX - 18} ${peninsulaY} V${peninsulaY + depth}`} />
                  <text x={peninsulaX - 28} y={peninsulaY + depth / 2} textAnchor="middle" transform={`rotate(-90 ${peninsulaX - 28} ${peninsulaY + depth / 2})`}>{depth} cm</text>
                  <text x="335" y={(60 + peninsulaY) / 2} textAnchor="middle">allée {aisle} cm</text>
                  <text x="345" y="375" textAnchor="middle">passage utile {rearClearance} cm</text>
                </g>
              )}
            </svg>
          </div>

          <div className="metrics-row">
            <Metric label="Allée de travail" value={`${aisle} cm`} tone={workComfort ? "good" : "warn"} />
            <Metric label="Passage arrière" value={`${rearClearance} cm`} tone={rearComfort ? "good" : "warn"} />
            <Metric label="Places" value={`${stools}`} />
          </div>
        </div>

        <aside className="control-panel">
          <div className="panel-heading">
            <span className="section-kicker">Configuration</span>
            <h2>Ajuste l’implantation</h2>
          </div>

          <div className="preset-list" aria-label="Préréglages">
            {presets.map((preset) => (
              <button key={preset.name} type="button" onClick={() => applyPreset(preset)}>{preset.name}</button>
            ))}
          </div>

          <div className="control-section">
            <label className="range-label" htmlFor="length">
              <span>Longueur péninsule</span><strong>{length} cm</strong>
            </label>
            <input id="length" type="range" min="200" max="260" step="10" value={length} onChange={(event) => setLength(Number(event.target.value))} />

            <label className="range-label" htmlFor="depth">
              <span>Profondeur</span><strong>{depth} cm</strong>
            </label>
            <input id="depth" type="range" min="70" max="100" step="5" value={depth} onChange={(event) => setDepth(Number(event.target.value))} />

            <label className="range-label" htmlFor="aisle">
              <span>Allée de travail</span><strong>{aisle} cm</strong>
            </label>
            <input id="aisle" type="range" min="100" max="150" step="5" value={aisle} onChange={(event) => setAisle(Number(event.target.value))} />

            <label className="range-label" htmlFor="stools">
              <span>Tabourets</span><strong>{stools}</strong>
            </label>
            <input id="stools" type="range" min="0" max="4" step="1" value={stools} onChange={(event) => setStools(Number(event.target.value))} />
          </div>

          <Segmented
            label="Emplacement de l’évier"
            value={sinkLocation}
            options={[{ value: "wall", label: "Sous fenêtre" }, { value: "peninsula", label: "Péninsule" }]}
            onChange={(value) => setSinkLocation(value as Location)}
          />

          <Segmented
            label="Emplacement de la plaque"
            value={hobLocation}
            options={[{ value: "wall", label: "Mur + hotte" }, { value: "peninsula", label: "Péninsule" }]}
            onChange={(value) => setHobLocation(value as Location)}
          />

          <div className="module-inspector">
            <span className="section-kicker">Module sélectionné</span>
            <div className="module-title-row">
              <h3>{selectedInfo.title}</h3>
              <strong>{selectedInfo.size}</strong>
            </div>
            <p>{selectedInfo.text}</p>
            <small>Clique sur un meuble du plan pour afficher sa fiche.</small>
          </div>

          <div className={`advice ${workComfort && rearComfort && equipmentComfort ? "advice-good" : "advice-warn"}`}>
            <span>{workComfort && rearComfort && equipmentComfort ? "Implantation confortable" : "Configuration à ajuster"}</span>
            <p>
              {!equipmentComfort
                ? "Évier et plaque sur la même péninsule laissent trop peu de préparation. Replace au moins l’un des deux sur le mur."
                : workComfort && rearComfort
                  ? "Les deux circulations principales restent au-dessus des seuils conseillés."
                  : "Essaie le préréglage Recommandée ou réduis la profondeur de la péninsule."}
            </p>
          </div>
        </aside>
      </section>

      <section className="decision-summary" aria-labelledby="summary-title">
        <div>
          <p className="section-kicker">Synthèse actuelle</p>
          <h2 id="summary-title">Une cuisine qui garde les circulations hors de la zone de travail.</h2>
        </div>
        <ul>
          <li><strong>{length} × {depth} cm</strong><span>Péninsule</span></li>
          <li><strong>{aisle} cm</strong><span>Entre cuisine et péninsule</span></li>
          <li><strong>{rearClearance} cm</strong><span>Derrière les assises</span></li>
          <li><strong>0 meuble</strong><span>Devant la cheminée</span></li>
        </ul>
      </section>
    </main>
  );
}
