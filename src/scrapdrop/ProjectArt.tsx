import type { Kit } from "./model";
export function Art({ kit }: { kit: Kit }) {
  const color = kit.materials[0].color,
    ribbon = kit.materials[1].color;
  return (
    <svg
      viewBox="0 0 300 220"
      role="img"
      aria-label={`${kit.template.title} illustrative preview`}
    >
      {kit.template.id === "giftbox" ? (
        <>
          <path d="M52 86 147 38 251 87 154 138Z" fill={color} />
          <path d="m52 86 102 52v68L52 153Z" fill={color} opacity=".82" />
          <path d="m154 138 97-51v68l-97 51Z" fill={color} opacity=".65" />
          <path d="m98 62 105 51v67l-25 13v-67L74 75Z" fill={ribbon} />
          <path d="m104 111 97-50 27 13-99 51v67l-25-13Z" fill={ribbon} />
          <path
            d="M151 87c-50-35-68 17-9 7m10-7c47-35 65 17 9 7"
            fill="none"
            stroke={ribbon}
            strokeWidth="7"
          />
        </>
      ) : kit.template.id === "wrap" ? (
        <>
          <path d="m80 56 126-22 24 143-126 24Z" fill="#e4dcc9" />
          <path d="m67 61 126-22 25 143-126 24Z" fill={color} />
          <path d="m67 61 16-3 25 144-16 4Z" fill={color} opacity=".55" />
          <path d="m152 46 12-2 26 143-12 2Z" fill={ribbon} />
        </>
      ) : (
        <>
          <path d="m105 45 72 8-14 145-32-24-40 16Z" fill={color} />
          <path
            d="m105 45 6-9 72 8-14 145-6 9 14-145Z"
            fill={color}
            opacity=".6"
          />
          <path
            d="M139 62c-18-60 50-53 14-16l-12 20"
            fill="none"
            stroke={ribbon}
            strokeWidth="8"
          />
        </>
      )}
    </svg>
  );
}
export function CutDiagram({ kit }: { kit: Kit }) {
  const c = kit.cut;
  return (
    <svg
      className="sd-cut"
      viewBox={`-8 -8 ${c.width + 16} ${c.height + 16}`}
      role="img"
      aria-label={`Measured cutting layout, ${c.width} by ${c.height} millimeters. Solid lines cut; dashed lines fold.`}
    >
      {c.rects.map((r, i) => (
        <g key={i}>
          <rect
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
            fill={kit.materials[0].color}
            fillOpacity=".2"
            stroke="currentColor"
            strokeWidth=".7"
          />
          <text
            x={r.x + r.width / 2}
            y={r.y + r.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={r.width < 20 ? 3 : 5}
          >
            {r.label}
          </text>
        </g>
      ))}
      {c.folds.map((l, i) => (
        <line
          key={i}
          {...l}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3 2"
        />
      ))}
      {c.holes?.map((hole, i) => (
        <circle
          key={"hole" + i}
          cx={hole.x}
          cy={hole.y}
          r={hole.radius}
          fill="none"
          stroke="currentColor"
          strokeWidth=".7"
        />
      ))}
    </svg>
  );
}
