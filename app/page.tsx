"use client";

import { useMemo, useState } from "react";

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
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  fill: string;
  compact?: string;
}) {
  const displayLabel = width >= 120 ? label : (compact ?? label);

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity="0.2" stroke={fill} strokeWidth="1.5" />
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

  const peninsulaX = 470 - length;
  const peninsulaY = 60 + aisle;
  const rearClearance = Math.max(0, 440 - (peninsulaY + depth) - (stools ? 45 : 0));
  const prepWidth = Math.max(60, length - 120);
  const workComfort = aisle >= 100 && aisle <= 130;
  const rearComfort = rearClearance >= 100;

  const flowPoints = useMemo(() => {
    const sink = sinkLocation === "wall" ? [500, 105] : [440, peninsulaY + depth / 2];
    const prep = [peninsulaX + prepWidth / 2, peninsulaY + depth / 2];
    const hob = hobLocation === "wall" ? [440, 30] : [peninsulaX + prepWidth * 0.62, peninsulaY + depth / 2];
    return [[150, 72], sink, prep, hob];
  }, [sinkLocation, hobLocation, peninsulaX, peninsulaY, depth, prepWidth]);

  function applyPreset(preset: Preset) {
    setLength(preset.length);
    setDepth(preset.depth);
    setAisle(preset.aisle);
    setStools(preset.stools);
  }

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
        <div className="header-mark" aria-hidden="true">EG</div>
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

              <PlanRect x={0} y={0} width={60} height={60} label="Garde-manger" compact="Réserve" fill={zoneColors.tall} />
              <PlanRect x={60} y={0} width={60} height={60} label="Four + micro" compact="Four" fill={zoneColors.tall} />
              <PlanRect x={120} y={0} width={60} height={60} label="Réfrigérateur" compact="Frigo" fill={zoneColors.tall} />

              <PlanRect x={380} y={0} width={30} height={60} label="Coulissant 30" compact="30" fill={zoneColors.low} />
              <PlanRect x={410} y={0} width={60} height={60} label={hobLocation === "wall" ? "Plaque + hotte" : "Tiroirs 60"} compact={hobLocation === "wall" ? "Plaque" : "T60"} fill={zoneColors.low} />
              <PlanRect x={470} y={0} width={60} height={60} label="Meuble d’angle" compact="Angle" fill={zoneColors.low} />
              <PlanRect x={470} y={60} width={60} height={90} label={sinkLocation === "wall" ? "Évier 90" : "Rangement 90"} compact={sinkLocation === "wall" ? "Évier" : "R90"} fill={zoneColors.low} />
              <PlanRect x={470} y={150} width={60} height={30} label="Joue 30" compact="30" fill={zoneColors.low} />

              <g className="peninsula-group">
                <PlanRect x={peninsulaX} y={peninsulaY} width={prepWidth} height={depth} label="Grande préparation" compact="Préparation" fill={zoneColors.peninsula} />
                <PlanRect x={peninsulaX + prepWidth} y={peninsulaY} width={60} height={depth} label="Poubelles / tri" compact="Tri" fill={zoneColors.peninsula} />
                <PlanRect x={410} y={peninsulaY} width={60} height={depth} label={sinkLocation === "peninsula" ? "Évier + lave-vaisselle" : "Lave-vaisselle"} compact={sinkLocation === "peninsula" ? "Évier + LV" : "LV"} fill={zoneColors.peninsula} />
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

              <PlanRect x={160} y={440} width={370} height={60} label="Meuble étagère à portes coulissantes prévu" compact="Meuble coulissant" fill={zoneColors.fixed} />

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

          <div className={`advice ${workComfort && rearComfort ? "advice-good" : "advice-warn"}`}>
            <span>{workComfort && rearComfort ? "Implantation confortable" : "Passages à surveiller"}</span>
            <p>
              {workComfort && rearComfort
                ? "Les deux circulations principales restent au-dessus des seuils conseillés."
                : "Essaie le préréglage Recommandée ou réduis la profondeur de la péninsule."}
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
