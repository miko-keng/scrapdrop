import { RecipeDiagram } from "./manufacturing/RecipeGuide";
import { useId } from "react";
import type { Kit } from "./model";
export function Art({ kit, scene = false }: { kit: Kit; scene?: boolean }) {
  const textureId = useId().replace(/:/g, "");
  if (kit.manufacturing)
    return <RecipeDiagram recipe={kit.manufacturing.recipes[0]} />;
  const color = kit.materials[0].color,
    ribbon = kit.materials[1].color;
  return (
    <svg
      viewBox="0 0 300 220"
      role="img"
      aria-label={`${kit.template.title} illustrative preview`}
    >
      <defs>
        <filter id={textureId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".72"
            numOctaves="3"
            seed="8"
            result="grain"
          />
          <feComposite
            in="grain"
            in2="SourceAlpha"
            operator="in"
            result="grainClip"
          />
          <feBlend in="SourceGraphic" in2="grainClip" mode="soft-light" />
        </filter>
      </defs>
      {scene && (
        <g aria-hidden="true">
          {kit.template.id === "giftbox" ? (
            <>
              <ellipse
                cx="157"
                cy="191"
                rx="108"
                ry="13"
                fill="#713d3b"
                opacity=".12"
              />
              <path d="m25 38 26 8-9 30-26-8Z" fill="#fff4d7" />
              <circle cx="37" cy="48" r="2" fill="#c75d48" />
              <path
                d="m241 26 13 13m0-13-13 13m-220 101 12 7m216 52 18-5"
                stroke="#b4473a"
                strokeWidth="3"
              />
              <path d="m29 48-6-19" stroke={ribbon} fill="none" />
            </>
          ) : kit.template.id === "wrap" ? (
            <>
              <ellipse
                cx="158"
                cy="199"
                rx="92"
                ry="10"
                fill="#253997"
                opacity=".15"
              />
              <path d="m244 67 7-3 36 98-7 3Z" fill="#f8d87d" />
              <path d="m280 165 7-3 1 13Z" fill="#394a47" />
              <circle cx="42" cy="163" r="22" fill="#fbf3dc" />
              <circle cx="42" cy="163" r="15" fill="#b98c65" />
              <path
                d="M22 155c-20-8-18 20 1 13"
                fill="none"
                stroke="#fbf3dc"
                strokeWidth="7"
              />
            </>
          ) : (
            <>
              <path
                d="M20 78q62-30 119-12 64-17 139 7l-7 123q-70-23-132-5-60-18-113 5Z"
                fill="#eee4ce"
              />
              <path
                d="M24 73q62-30 115-12 64-17 135 7l-7 123q-70-23-128-5-60-18-109 5Z"
                fill="#fffaf0"
              />
              <path d="M139 61v125" stroke="#d9cfba" />
              <path
                d="m40 95 42-12m-40 24 39-11m-37 24 37-10m123-17 43 6m-44 7 43 6m-45 7 43 6m-44 7 43 6"
                stroke="#d8d0bd"
                strokeWidth="2"
              />
            </>
          )}
        </g>
      )}
      <g
        filter={scene ? `url(#${textureId})` : undefined}
        transform={
          scene && kit.template.id === "bookmark"
            ? "translate(33 2) rotate(13 140 110) scale(.85)"
            : undefined
        }
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
      </g>
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
