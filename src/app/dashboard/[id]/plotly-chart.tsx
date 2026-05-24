"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  figureJson: string;
};

export function PlotlyChart({ figureJson }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const node = ref.current;
    if (!node) return;

    let plotted = false;

    (async () => {
      try {
        const Plotly = (await import("plotly.js-dist-min")).default;
        if (cancelled) return;

        const fig = JSON.parse(figureJson) as {
          data: Plotly.Data[];
          layout: Partial<Plotly.Layout>;
        };

        await Plotly.newPlot(node, fig.data, fig.layout, {
          responsive: true,
          displaylogo: false,
          modeBarButtonsToRemove: [
            "lasso2d",
            "select2d",
            "autoScale2d",
            "resetScale2d",
          ],
          modeBarButtonsToAdd: [
            {
              name: "Reset",
              title: "Reset",
              icon: Plotly.Icons.home,
              click: (gd) => {
                void Plotly.relayout(gd, {
                  "xaxis.autorange": true,
                  "yaxis.autorange": true,
                });
              },
            },
          ],
        });
        plotted = true;
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (plotted && node) {
        import("plotly.js-dist-min").then(({ default: Plotly }) =>
          Plotly.purge(node),
        );
      }
    };
  }, [figureJson]);

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to render chart: {error}
      </p>
    );
  }

  return <div ref={ref} className="w-full" />;
}
