// =============================================
// CONFIGURAÇÃO DA API
// =============================================

const GROQ_API_KEY = import.meta.env.GROQ_KEY;
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// =============================================
// TIPOS DE GRÁFICO DISPONÍVEIS
// =============================================

export const CHART_OPTIONS = [
  { value: "line",        label: "Gráfico de Linhas" },
  { value: "bar_grouped", label: "Barras Agrupadas" },
  { value: "pie",         label: "Gráfico de Setores" },
  { value: "heatmap",     label: "Heatmap" },
  { value: "auto",        label: "Automático" },
];

// =============================================
// CHAMADA GENÉRICA À API (com retry e backoff)
// =============================================

export async function callGroqAPI(messages, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = attempt * 2000;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        max_tokens: 2048,
        temperature: 0.0,
      }),
    });

    if (response.status === 429) {
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error("Limite de requisições atingido. Aguarde um momento e tente novamente.");
      }
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS));
      return callGroqAPI(messages, attempt + 1);
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Erro da API: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Erro de conexão. Verifique sua internet e tente novamente.");
    }
    throw error;
  }
}

// =============================================
// CONVERSÃO DOS DADOS DO BACK-END
// Transforma o json_plot do Thiago em tabela plana
// =============================================

export function convertJsonPlotToTable(jsonPlot) {
  try {
    if (!jsonPlot?.visualizacoes?.length) return null;

    const best = jsonPlot.visualizacoes.reduce((a, b) =>
      b.score > a.score ? b : a
    );

    if (!best?.dados?.length) return null;

    return best.dados.map((d) => ({
      ...d.dimensoes,
      valor: d.valor,
    }));
  } catch {
    return null;
  }
}

// =============================================
// DESCRIÇÃO DOS TIPOS DE GRÁFICO PARA O PROMPT
// =============================================

const CHART_TYPE_INSTRUCTIONS = {
  line: `Gere um gráfico de LINHAS (mark: "line").
Use para mostrar evolução temporal ou tendências.
Eixo X deve ser temporal ou ordinal, eixo Y numérico.`,

  bar_grouped: `Gere um gráfico de BARRAS AGRUPADAS (mark: "bar" com dodge/facet).
Use para comparar categorias lado a lado.
Barras do mesmo grupo ficam adjacentes, separadas por cor.`,

  pie: `Gere um GRÁFICO DE SETORES / PIZZA (mark: "arc").
Use para mostrar proporções de uma variável categórica em relação ao total.
Use "theta" para o valor numérico e "color" para a categoria.
Evite usar quando houver muitas categorias (mais de 6).`,

  heatmap: `Gere um HEATMAP (mark: "rect" com cor quantitativa).
Use para mostrar intensidade entre duas dimensões categóricas.
Eixo X e Y são categorias, a cor representa o valor numérico.`,

  auto: `Analise a pergunta do usuário e os dados disponíveis e escolha automaticamente
o tipo de gráfico mais adequado entre: linhas, barras agrupadas, gráfico de setores ou heatmap.`,
};

// =============================================
// PROMPT — PRIMEIRA MENSAGEM
// =============================================

export function buildFirstPrompt(userQuestion, tableData, chartType = "auto") {
  const chartInstruction = CHART_TYPE_INSTRUCTIONS[chartType] || CHART_TYPE_INSTRUCTIONS.auto;

  const dataSection = tableData
    ? `DADOS REAIS DO DATASUS — copie-os exatamente no campo "data": {"values": [...]}, sem alterar nenhum valor:
${JSON.stringify(tableData, null, 2)}`
    : `Não há dados reais disponíveis no momento. Use seu conhecimento consolidado sobre tuberculose no Brasil
(perfil epidemiológico, dados do Ministério da Saúde, boletins oficiais) para gerar valores estimados plausíveis.
Inclua no título do gráfico o sufixo " (estimativa baseada no modelo)".`;

  return `Você é um especialista em visualização de dados epidemiológicos sobre tuberculose no Brasil.

PERGUNTA DO USUÁRIO: "${userQuestion}"

TIPO DE GRÁFICO SOLICITADO:
${chartInstruction}

${dataSection}

Sua tarefa é gerar uma especificação JSON válida no formato Vega-Lite (versão 5).

Regras obrigatórias:
- Retorne APENAS o JSON Vega-Lite. Sem texto antes ou depois, sem markdown, sem explicações.
- O JSON deve ser completo e válido, começando com { e terminando com }.
- Inclua título, labels nos eixos e tooltips.
- Use cores adequadas ao contexto científico/epidemiológico.
- O JSON deve ser autocontido (sem referências externas a URLs).
- NUNCA altere valores numéricos fornecidos nos dados reais.`;
}

// =============================================
// PROMPT — AJUSTE DO GRÁFICO
// =============================================

export function buildAdjustPrompt(userCommand, lastSpec) {
  return `Você é um especialista em visualização de dados com Vega-Lite.

Especificação JSON Vega-Lite atual do gráfico:
${JSON.stringify(lastSpec, null, 2)}

Ajuste solicitado pelo usuário: "${userCommand}"

Regras obrigatórias:
- Retorne APENAS o JSON Vega-Lite atualizado. Sem texto, sem markdown, sem explicações.
- Mantenha TODOS os dados (campo "values") exatamente como estão — não altere nenhum valor numérico.
- Aplique apenas as mudanças visuais ou estruturais solicitadas.
- O JSON deve ser completo e válido, começando com { e terminando com }.`;
}

// =============================================
// EXTRAÇÃO DO JSON DA RESPOSTA
// =============================================

export function extractJSON(raw) {
  let cleaned = raw.trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    cleaned = cleaned.slice(start, end + 1);
  }

  return JSON.parse(cleaned);
}

// =============================================
// SYSTEM PROMPT
// =============================================

export const BLUE_SYSTEM_PROMPT = {
  role: "system",
  content:
    "Você é um especialista em visualização de dados epidemiológicos. Sempre responda APENAS com JSON Vega-Lite v5 válido e completo, sem nenhum texto adicional, sem markdown, sem explicações.",
};
