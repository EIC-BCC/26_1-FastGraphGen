import { useState, useRef, useEffect } from "react";
import { BarChart2, Trash2 } from "lucide-react";
import {
  callGroqAPI,
  BLUE_SYSTEM_PROMPT,
  CHART_OPTIONS,
  buildFirstPrompt,
  buildAdjustPrompt,
  extractJSON,
} from "../groqService";
import VegaChart from "./VegaChart";

// =============================================
// SUBCOMPONENTE — SELETOR DE TIPO DE GRÁFICO (horizontal)
// =============================================

function ChartTypeSelector({ selected, onChange, disabled }) {
  return (
    <div className="mx-3 mt-3 px-3 py-2 bg-white/15 rounded-lg">
      <p className="text-white text-xs font-semibold mb-2">Tipo de gráfico:</p>
      <div className="flex flex-row flex-wrap gap-x-4 gap-y-1">
        {CHART_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex items-center gap-1.5 cursor-pointer py-1 transition-colors ${
              selected === option.value
                ? "text-white font-semibold"
                : "text-white/70 hover:text-white"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <input
              type="radio"
              name="chartType"
              value={option.value}
              checked={selected === option.value}
              onChange={() => !disabled && onChange(option.value)}
              disabled={disabled}
              className="accent-white"
            />
            <span className="text-xs whitespace-nowrap">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// =============================================
// SUBCOMPONENTE — MENSAGEM DE TEXTO
// =============================================

function TextMessage({ sender, content }) {
  const isUser = sender === "user";
  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`px-3 py-2 rounded-lg text-sm max-w-[85%] leading-relaxed ${
          isUser
            ? "bg-white/25 text-white"
            : "bg-white/15 text-white italic text-xs"
        }`}
      >
        {content}
      </div>
    </div>
  );
}

// =============================================
// COMPONENTE PRINCIPAL
// =============================================

export default function BluePanel({ realData }) {
  const [entries, setEntries] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [lastSpec, setLastSpec] = useState(null);
  const [chartType, setChartType] = useState("auto");
  const bottomRef = useRef(null);

  // reset manual — chamado pelo botão de limpar
  function resetChat() {
    setEntries([]);
    setIsFirstMessage(true);
    setLastSpec(null);
    setChartType("auto");
    setInput("");
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  function addEntry(entry) {
    setEntries((prev) => [...prev, entry]);
  }

  function removeLastSistema() {
    setEntries((prev) =>
      prev.filter(
        (e, i) =>
          !(i === prev.length - 1 && e.type === "text" && e.sender === "sistema")
      )
    );
  }

  async function sendMessage() {
    const userText = input.trim();
    if (!userText || loading) return;

    setInput("");
    setLoading(true);

    addEntry({ type: "text", sender: "user", content: userText });
    addEntry({
      type: "text",
      sender: "sistema",
      content: isFirstMessage
        ? "⏳ Gerando gráfico... aguarde."
        : "⏳ Aplicando ajuste... aguarde.",
    });

    try {
      const promptText = isFirstMessage
        ? buildFirstPrompt(userText, realData, chartType)
        : buildAdjustPrompt(userText, lastSpec);

      const rawResponse = await callGroqAPI([
        BLUE_SYSTEM_PROMPT,
        { role: "user", content: promptText },
      ]);

      const spec = extractJSON(rawResponse);

      removeLastSistema();
      setLastSpec(spec);
      setIsFirstMessage(false);

      if (!realData) {
        addEntry({
          type: "text",
          sender: "sistema",
          content: "⚠️ Dados do DATASUS não disponíveis. Gráfico baseado no conhecimento do modelo — faça uma pergunta no chat principal para usar dados reais.",
        });
      }

      addEntry({ type: "chart", spec });
    } catch (error) {
      removeLastSistema();
      const msg =
        error instanceof SyntaxError
          ? "❌ A IA retornou um formato inválido. Tente reformular a pergunta."
          : `❌ ${error.message}`;
      addEntry({ type: "text", sender: "sistema", content: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* indicador de dados + botão limpar */}
      <div className="flex items-center justify-between mx-3 mt-3 gap-2">
        {realData ? (
          <div className="flex-1 px-3 py-2 bg-white/20 rounded-lg text-white text-xs">
            ✅ {realData.length} registros do DATASUS disponíveis.
          </div>
        ) : (
          <div className="flex-1 px-3 py-2 bg-white/10 rounded-lg text-white/70 text-xs">
            ℹ️ Sem dados do DATASUS. Faça uma pergunta no chat principal primeiro.
          </div>
        )}
        {/* botão limpar — sempre visível, desabilitado quando não há mensagens */}
        <button
          onClick={resetChat}
          disabled={loading || entries.length === 0}
          title="Limpar conversa"
          className="shrink-0 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3 h-3" />
          Limpar
        </button>
      </div>

      {/* seletor de tipo de gráfico — horizontal */}
      <ChartTypeSelector
        selected={chartType}
        onChange={setChartType}
        disabled={loading || !isFirstMessage}
      />

      {/* histórico */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {entries.map((entry, i) =>
          entry.type === "chart" ? (
            <VegaChart key={i} spec={entry.spec} />
          ) : (
            <TextMessage key={i} sender={entry.sender} content={entry.content} />
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="shrink-0 h-[60px] flex items-center px-4 gap-3 border-t border-white/30 bg-white/15">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder={isFirstMessage ? "Faça uma pergunta para gerar um gráfico..." : "Peça um ajuste no gráfico..."}
          disabled={loading}
          className="flex-1 h-10 rounded-md px-3 text-sm bg-white/90 border-none outline-none text-gray-800 placeholder:text-gray-400 disabled:opacity-60"
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          className="w-10 h-10 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 flex items-center justify-center text-white shrink-0 transition-colors"
        >
          <BarChart2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
