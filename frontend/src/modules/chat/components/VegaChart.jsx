import { useEffect, useRef } from "react";
import vegaEmbed from "vega-embed";

export default function VegaChart({ spec }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !spec) return;

    vegaEmbed(containerRef.current, spec, {
      actions: {
        export: true,
        source: false,
        compiled: false,
        editor: false,
      },
      theme: "default",
      renderer: "svg",
    }).catch((err) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = `<p class="text-red-500 text-sm p-2">❌ Erro ao renderizar: ${err.message}</p>`;
      }
    });

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [spec]);

  return (
    <div className="bg-white rounded-xl p-4 w-full shadow-md">
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
