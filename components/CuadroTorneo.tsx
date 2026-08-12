"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Match,
  SingleEliminationBracket,
  SVGViewer,
  createTheme,
} from "react-tournament-brackets";
import {
  adaptarPartidosABracket,
  type PartidoParaCuadro,
} from "@/lib/adaptar-cuadro-torneo";
import { ListaPartidosMobile } from "@/components/ListaPartidosMobile";

const temaOscuro = createTheme({
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  transitionTimingFunction: "ease-in-out",
  disabledColor: "#5a5a5a",
  roundHeaders: {
    background: "#2a2a2a",
  },
  matchBackground: {
    wonColor: "#2f3a33",
    lostColor: "#2a2a2a",
  },
  border: {
    color: "#3a3a3a",
    highlightedColor: "#d9682f",
  },
  textColor: {
    highlighted: "#f5f5f5",
    main: "#f5f5f5",
    dark: "#a3a3a3",
    disabled: "#6b6b6b",
  },
  score: {
    text: {
      highlightedWonColor: "#f5f5f5",
      highlightedLostColor: "#a3a3a3",
    },
    background: {
      wonColor: "#d9682f",
      lostColor: "#3a3a3a",
    },
  },
  canvasBackground: "#1f1f1f",
});

interface CuadroTorneoProps {
  partidos: PartidoParaCuadro[];
}

export function CuadroTorneo({ partidos }: CuadroTorneoProps) {
  const [montado, setMontado] = useState(false);
  const [anchoViewport, setAnchoViewport] = useState(960);

  const matches = useMemo(
    () => adaptarPartidosABracket(partidos),
    [partidos]
  );

  useEffect(() => {
    setMontado(true);
    const actualizarAncho = () => {
      setAnchoViewport(Math.min(window.innerWidth - 48, 1100));
    };
    actualizarAncho();
    window.addEventListener("resize", actualizarAncho);
    return () => window.removeEventListener("resize", actualizarAncho);
  }, []);

  if (matches.length === 0) {
    return (
      <p className="px-6 py-10 text-center text-sm text-foreground/50">
        Todavía no hay cuadro eliminatorio para este torneo.
      </p>
    );
  }

  return (
    <>
      {/* Vista mobile: lista vertical por fase */}
      <div className="block md:hidden">
        <ListaPartidosMobile partidos={partidos} />
      </div>

      {/* Vista desktop: árbol de la librería */}
      <div className="hidden md:block">
        {!montado ? (
          <p className="px-6 py-10 text-center text-sm text-foreground/50">
            Cargando cuadro...
          </p>
        ) : (
          <div className="w-full overflow-x-auto rounded-2xl border border-border bg-surface">
            <div className="min-w-[720px] p-2 sm:p-4">
              <SingleEliminationBracket
                matches={matches}
                matchComponent={Match}
                theme={temaOscuro}
                options={{
                  style: {
                    roundHeader: {
                      backgroundColor: "#2a2a2a",
                      fontColor: "#f5f5f5",
                    },
                    connectorColor: "#3a3a3a",
                    connectorColorHighlight: "#d9682f",
                  },
                }}
                svgWrapper={({
                  bracketWidth,
                  bracketHeight,
                  startAt,
                  children,
                }) => (
                  <SVGViewer
                    width={Math.max(bracketWidth, anchoViewport)}
                    height={Math.min(bracketHeight, 640)}
                    bracketWidth={bracketWidth}
                    bracketHeight={bracketHeight}
                    startAt={startAt}
                    scaleFactor={0.9}
                    background="#1f1f1f"
                    SVGBackground="#1f1f1f"
                  >
                    {children}
                  </SVGViewer>
                )}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
