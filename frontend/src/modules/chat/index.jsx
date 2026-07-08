import { useEffect, useRef, useState } from "react"
import axios from "axios"
import ReactMarkdown from "react-markdown"
import { Settings, Send, Users, Loader2, BarChart2, ChevronLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import LeftSideBar from "./components/leftSideBar"
import Header from "./components/header"
import { toast } from "@/hooks/use-toast"
import Modal from "@/components/Modal"
import { useNavigate } from "react-router-dom"
import BluePanel from "./components/BluePanel"
import { convertJsonPlotToTable } from "./groqService"

const availableDataList = [
    "Tipo de entrada do paciente",
    "Raça",
    "Sexo",
    "População privada de liberdade",
    "População em situação de rua",
    "Forma clínica da tuberculose",
    "Tuberculose extrapulmonar",
    "Território de cidadania",
    "Coinfecção com AIDS",
    "Alcoolismo",
    "Diabetes",
    "Doença mental",
    "Uso de drogas ilícitas",
    "Tabagismo",
    "Outras doenças associadas",
    "Resultado de raio-x de tórax",
    "Status HIV",
    "Uso de antirretrovirais",
    "Cultura de escarro",
    "Baciloscopia (2 e 6 meses)",
    "Situação de encerramento do caso",
    "Ano de nascimento",
    "Data da notificação",
    "Estado (UF)",
]

export default function ChatPage() {
    const baseURL = import.meta.env.VITE_API_URL
    const navigate = useNavigate()

    const [messages, setMessages] = useState([
        {
            content: `Bem-vindo ao Epi Research! 👋\n\nSou seu assistente de pesquisa epidemiológica, especializado em dados sobre tuberculose.\n\nClique no botão "Ver informações disponíveis" para ver quais informações eu tenho disponível para responder.`,
            position: "L",
            date: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
    ])
    const [inputValue, setInputValue] = useState("")
    const [loading, setLoading] = useState(false)
    const [selectedSQL, setSelectedSQL] = useState(null)
    const [isDataModalOpen, setIsDataModalOpen] = useState(false)
    const [chatId, setChatId] = useState(null)
    const [isOpen, setIsOpen] = useState(false)
    const [jsonPlot, setJsonPlot] = useState("")

    // tabela plana de dados reais convertida do json_plot — passada ao BluePanel
    const [realTableData, setRealTableData] = useState(null)

    // controla qual painel está visível: "white" ou "blue"
    const [activePanel, setActivePanel] = useState("white")

    const messagesEndRef = useRef(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(() => { getLastMessages() }, [])
    useEffect(() => { scrollToBottom() }, [messages])

    const sendMessage = async () => {
        if (!inputValue.trim()) return

        const userMessage = {
            content: inputValue,
            position: "R",
            date: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }

        setMessages((prev) => [...prev, userMessage])
        setInputValue("")
        setLoading(true)

        try {
            const response = await axios.post(`${baseURL}/chat-message`, {
                question: inputValue,
                chat_id: chatId,
            })

            const newMessage = {
                content: response.data.answer,
                position: "L",
                date: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                sql: response.data.sql && response.data.sql !== "" ? response.data.sql : null,
            }

            setMessages((prev) => [...prev, newMessage])

            const parsedPlot = JSON.parse(response.data?.json_plot)

            // para o Modal (comportamento original do Marcos)
            setJsonPlot(
                JSON.stringify({
                    visualizacoes: parsedPlot.visualizacoes?.map((v) => ({
                        ...v,
                        pergunta: inputValue,
                    })),
                })
            )

            // converte para tabela plana antes de passar ao BluePanel
            // isso garante que o Groq receba os dados em formato simples e não os distorça
            const tableData = convertJsonPlotToTable(parsedPlot)
            setRealTableData(tableData)

        } catch (e) {
            console.error("Erro ao enviar mensagem:", e)
            let errorMessage = "Ocorreu um erro inesperado. Tente novamente."
            if (axios.isAxiosError(e)) {
                errorMessage = e.response?.data?.error ?? errorMessage
            }
            toast({
                title: "Erro ao consultar o assistente",
                description: errorMessage,
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }

    const getLastMessages = async () => {
        let existingId = localStorage.getItem("chat_id")
        if (!existingId) {
            existingId = Math.floor(Math.random() * 1_000_000_000).toString()
            localStorage.setItem("chat_id", existingId)
        }
        setChatId(existingId)

        try {
            const response = await axios.get(`${baseURL}/chat-messages`, {
                params: { chat_id: existingId },
            })

            const loadedMessages = response.data.map((msg) => ({
                content: msg.content,
                position: msg.position === "R" ? "R" : "L",
                date: new Date(msg.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                sql: msg.sql ?? null,
            }))

            setMessages((prev) => [...prev, ...loadedMessages])
        } catch (error) {
            console.error("Erro ao buscar mensagens anteriores:", error)
            toast({
                title: "Erro ao carregar histórico",
                description: "Não foi possível carregar as mensagens anteriores.",
                variant: "destructive",
            })
        }
    }

    return (
        <div className="flex h-screen bg-gray-50/50 overflow-hidden">
            <Header />
            <LeftSideBar />

            <div className="flex flex-1 mt-14 md:ml-64 overflow-hidden relative">

                {/* painel branco */}
                <div
                    className="flex-1 flex flex-col overflow-hidden"
                    style={{ display: activePanel === "white" ? "flex" : "none" }}
                >
                    <div className="bg-white border-b border-gray-100 p-5 shrink-0 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-medium text-gray-800">Assistente de Pesquisa Epidemiológica</h2>
                            <p className="text-sm text-gray-500">Especializado em Tuberculose</p>
                        </div>
                        <div className="flex flex-row gap-4 items-center">
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setIsOpen(true)}>
                                Ver gráficos gerados pela última pergunta
                            </Button>
                            <Button size="sm" className="bg-gray-300 hover:bg-gray-400 text-black" onClick={() => navigate("/dashboard")}>
                                Ver dashboard
                            </Button>
                            <Button size="sm" className="bg-blue-500 hover:bg-blue-700" onClick={() => setIsDataModalOpen(true)}>
                                Ver informações disponíveis
                            </Button>
                            <button
                                onClick={() => setActivePanel("blue")}
                                title="Abrir gerador de gráficos"
                                className="w-9 h-9 rounded-full bg-[#7a9efe] hover:bg-[#5a7ede] flex items-center justify-center transition-colors shrink-0"
                            >
                                <BarChart2 className="w-4 h-4 text-white" />
                            </button>
                        </div>
                    </div>

                    <Dialog open={isDataModalOpen} onOpenChange={setIsDataModalOpen}>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>Informações disponíveis para análise</DialogTitle>
                                <DialogDescription>
                                    Estas são as informações presentes no banco de dados que você pode perguntar:
                                </DialogDescription>
                            </DialogHeader>
                            <ul className="list-disc list-inside max-h-80 overflow-auto text-sm text-gray-700">
                                {availableDataList.map((item, idx) => (
                                    <li key={idx}>{item}</li>
                                ))}
                            </ul>
                        </DialogContent>
                    </Dialog>

                    <Modal isOpen={isOpen} setIsOpen={setIsOpen} json_plot={jsonPlot ? JSON.parse(jsonPlot) : undefined} />

                    <div className="flex-1 overflow-y-auto p-5">
                        <div className="space-y-4 max-w-4xl">
                            {messages.map((msg, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-start space-x-3 ${msg.position === "R" ? "justify-end" : ""}`}
                                >
                                    {msg.position === "L" && (
                                        <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                                            <Settings className="w-3.5 h-3.5 text-white" />
                                        </div>
                                    )}
                                    <div className={`${msg.position === "R" ? "bg-blue-600 text-white" : "bg-blue-50 text-gray-800"} rounded-lg p-3 max-w-2xl`}>
                                        <div className="prose prose-sm max-w-none">
                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                                        </div>
                                        <span className={`text-xs mt-1 block ${msg.position === "R" ? "text-blue-200" : "text-gray-400"}`}>
                                            {msg.date}
                                        </span>
                                    </div>
                                    {msg.position === "R" && (
                                        <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                                            <Users className="w-3.5 h-3.5 text-gray-500" />
                                        </div>
                                    )}
                                    {msg.sql != null && msg.position === "L" && (
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    className="text-xs mt-2 text-blue-600 hover:underline p-0 h-auto"
                                                    onClick={() => setSelectedSQL(msg.sql)}
                                                >
                                                    Detalhes
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-lg">
                                                <DialogHeader>
                                                    <DialogTitle>Consulta SQL utilizada</DialogTitle>
                                                    <DialogDescription>
                                                        Para responder essa pergunta, eu executei o seguinte SQL no banco de dados:
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <pre className="text-xs bg-gray-100 p-3 rounded whitespace-pre-wrap break-words max-h-[300px] overflow-auto">
                                                    {selectedSQL}
                                                </pre>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    <div className="bg-white border-t border-gray-100 p-5 shrink-0">
                        <div className="flex items-center space-x-2">
                            <Input
                                placeholder="Digite sua pergunta ou comando..."
                                className="flex-1 text-sm"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") sendMessage() }}
                                disabled={loading}
                            />
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={sendMessage} disabled={loading}>
                                {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Send className="w-4 h-4 mr-1" />}
                                {!loading && "Enviar"}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* painel azul */}
                <div
                    className="flex-1 flex overflow-hidden"
                    style={{ display: activePanel === "blue" ? "flex" : "none" }}
                >
                    <button
                        onClick={() => setActivePanel("white")}
                        title="Voltar ao chat"
                        className="w-12 h-full bg-[#6088ee] hover:bg-[#4a72d8] flex items-center justify-center shrink-0 transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-white" />
                    </button>

                    <div className="flex-1 flex flex-col overflow-hidden bg-[#7a9efe]">
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/30 shrink-0">
                            <div className="w-9 h-9 rounded-full border-2 border-white/70 bg-white/20 flex items-center justify-center">
                                <BarChart2 className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-white font-semibold text-base">Gerador de Gráficos</span>
                        </div>

                        <div className="flex-1 overflow-hidden">
                            <BluePanel realData={realTableData} />
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}
