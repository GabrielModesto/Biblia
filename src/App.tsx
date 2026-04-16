import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, BookOpen, Search, User, Sparkles, MoveRight, HelpCircle, History, Mic, MicOff, Volume2, X, RefreshCw } from 'lucide-react';
import { askBibleQuestion, type Message, ai } from './lib/gemini';
import { cn } from './lib/utils';
import { AudioRecorder, AudioPlayer } from './lib/audio-utils';
import { Modality, LiveServerMessage } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SUGGESTED_QUESTIONS = [
  "¿Cuál es el mandamiento más importante?",
  "¿Qué dice la Biblia sobre la esperanza?",
  "Explícame la parábola del hijo pródigo",
  "¿Cómo se originó la Eucaristía?",
  "¿Cuál es el significado del Salmo 23?"
];

const SYSTEM_INSTRUCTION = `Eres un teólogo y experto en la Biblia Católica. Tu misión es responder preguntas sobre la Santa Biblia de manera precisa, respetuosa y basada en la Tradición y el Magisterio de la Iglesia Católica. 
Utiliza siempre referencias bíblicas claras (Libro, Capítulo, Versículo). 
En tus respuestas, mantén un tono pastoral y educativo. 
Sé conciso en el modo de voz. Habla directamente al usuario.`;

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const liveSessionRef = useRef<any>(null);

  // Auto-scroll logic
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isLoading, liveTranscription, isVoiceMode]);

  const stopLiveSession = useCallback(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.close();
      liveSessionRef.current = null;
    }
    audioRecorderRef.current?.stop();
    audioPlayerRef.current?.stop();
    setIsLiveActive(false);
    setIsVoiceMode(false);
    setLiveTranscription('');
    setIsLoading(false);
  }, []);

  const startLiveSession = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);
      
      if (!audioPlayerRef.current) audioPlayerRef.current = new AudioPlayer();
      
      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: () => {
            setIsLiveActive(true);
            setIsLoading(false);
            if (audioRecorderRef.current) {
              audioRecorderRef.current.start().catch(err => {
                console.error("Mic access denied or error:", err);
                setError("No se pudo acceder al micrófono. Por favor verifica los permisos.");
                stopLiveSession();
              });
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle audio output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              audioPlayerRef.current?.playChunk(base64Audio);
            }

            // Handle transcriptions
            const modelTranscription = message.serverContent?.modelTurn?.parts?.[0]?.text;
            const inputTranscription = (message as any).serverContent?.inputAudioTranscription?.text;

            if (modelTranscription) setLiveTranscription(modelTranscription);
            if (inputTranscription) setLiveTranscription(inputTranscription);

            // Handle interruption
            if (message.serverContent?.interrupted) {
              audioPlayerRef.current?.stop();
            }
          },
          onclose: () => {
            stopLiveSession();
          },
          onerror: (err) => {
            console.error("Live Session Error:", err);
            setError("Error en la conexión de voz. Reintentando...");
            stopLiveSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: SYSTEM_INSTRUCTION,
          inputAudioTranscription: {},
        },
      });

      liveSessionRef.current = await sessionPromise;
      
      audioRecorderRef.current = new AudioRecorder((base64Data) => {
        if (liveSessionRef.current) {
          liveSessionRef.current.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      });

    } catch (error) {
      console.error("Failed to start Live session:", error);
      setError("No se pudo iniciar la sesión de voz.");
      setIsLoading(false);
      setIsVoiceMode(false);
    }
  }, [stopLiveSession]);

  const toggleVoiceMode = () => {
    if (isVoiceMode) {
      stopLiveSession();
    } else {
      setIsVoiceMode(true);
      startLiveSession();
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const query = input.trim();
    const userMessage: Message = { role: 'user', content: query };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await askBibleQuestion(query, messages);
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (err) {
      setError("Ocurrió un error al procesar tu pregunta.");
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-parchment overflow-hidden font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 md:px-[60px] py-4 md:py-8 border-b border-black/5 bg-parchment/90 backdrop-blur-md z-20 shrink-0">
        <div className="flex items-center gap-4">
          <BookOpen className="w-6 h-6 text-gold-default" />
          <h1 className="font-serif text-2xl font-bold italic text-ink tracking-tight select-none">
            Verbum Domini
          </h1>
        </div>
        
        <div className="flex items-center gap-4 md:gap-8">
          <nav className="hidden md:flex items-center gap-8">
            <button className="text-[12px] uppercase tracking-widest font-bold text-ink/60 hover:text-gold-default transition-colors">Evangelio</button>
            <button className="text-[12px] uppercase tracking-widest font-bold text-ink/60 hover:text-gold-default transition-colors">Catecismo</button>
          </nav>
          
          <div className="h-6 w-px bg-black/5 hidden md:block" />
          
          <button 
            onClick={toggleVoiceMode}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] uppercase tracking-widest font-bold transition-all shadow-sm",
              isVoiceMode 
                ? "bg-red-50 border-red-200 text-red-600 animate-pulse shadow-red-100" 
                : "bg-white border-black/10 text-ink hover:border-gold-default hover:text-gold-default"
            )}
          >
            {isVoiceMode ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
            {isVoiceMode ? "Parar" : "Voz"}
          </button>
        </div>
      </header>

      {/* Error Alert */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-[100px] left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl shadow-red-500/20"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="text-sm font-medium">{error}</span>
            <button onClick={() => setError(null)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden px-4 md:px-[60px] relative">
        {/* Chat / Content Area */}
        <div className="flex-1 flex flex-col min-w-0 h-full">
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto pt-8 pb-32 space-y-10 scroll-smooth pr-4 scroll-hide"
          >
            {messages.length === 0 && !isVoiceMode && !isLoading ? (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-2xl mx-auto pt-10"
              >
                <div className="mb-10 text-center">
                  <span className="inline-block px-3 py-1 bg-gold-400/10 text-gold-default text-[10px] font-bold uppercase tracking-[4px] rounded-full mb-6">
                    Sapientia Christiana
                  </span>
                  <h2 className="font-serif text-[40px] md:text-5xl leading-tight text-ink font-normal italic">
                    Busca la Verdad en las Sagradas Escrituras
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <motion.button
                      key={q}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.1 }}
                      onClick={() => { setInput(q); }}
                      className="group flex items-center justify-between p-6 bg-white/50 border border-black/5 rounded-2xl hover:bg-white hover:border-gold-default/30 transition-all hover:shadow-xl hover:shadow-gold-default/5 text-left"
                    >
                      <span className="text-base text-ink/70 group-hover:text-ink transition-colors leading-relaxed">{q}</span>
                      <MoveRight className="w-5 h-5 text-ink/10 group-hover:text-gold-default group-hover:translate-x-1 transition-all" />
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="max-w-3xl mx-auto w-full space-y-12">
                <AnimatePresence initial={false}>
                  {messages.map((m, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex flex-col group",
                        m.role === 'user' ? "items-end" : "items-start"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-3 opacity-30 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] uppercase font-black tracking-widest text-ink">
                          {m.role === 'user' ? 'Inquisitor' : 'Magister'}
                        </span>
                      </div>
                      <div className={cn(
                        "max-w-[85%] p-6 rounded-3xl",
                        m.role === 'user' 
                          ? "bg-ink text-parchment rounded-tr-none shadow-xl shadow-ink/10 font-sans" 
                          : "bg-white text-ink border border-black/5 rounded-tl-none shadow-sm font-serif text-lg leading-relaxed"
                      )}>
                        {m.role === 'assistant' ? (
                          <div className="markdown-body prose prose-stone max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {m.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  
                  {isVoiceMode && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center justify-center py-20 px-10 bg-white border border-gold-default/20 rounded-[40px] shadow-2xl shadow-gold-default/5 relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gold-50/10 pointer-events-none" />
                      <div className="relative z-10 flex flex-col items-center italic">
                        <div className="relative mb-12">
                          <motion.div 
                            animate={{ scale: [1, 1.2, 1] }} 
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="absolute inset-0 bg-gold-default/20 rounded-full blur-2xl" 
                          />
                          <div className="relative w-24 h-24 bg-gold-default rounded-full flex items-center justify-center text-white shadow-2xl shadow-gold-default/40">
                            {isLiveActive ? <Volume2 className="w-10 h-10 animate-pulse" /> : <RefreshCw className="w-10 h-10 animate-spin" />}
                          </div>
                        </div>
                        
                        <h3 className="font-serif text-3xl text-ink mb-2">
                          {isLiveActive ? "Escuchando..." : "Iniciando..."}
                        </h3>
                        <p className="text-[10px] uppercase font-black tracking-[4px] text-gold-default/60 mb-8">Conversación Sacra</p>
                        
                        <AnimatePresence mode="wait">
                          {liveTranscription ? (
                            <motion.p 
                              key={liveTranscription}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="text-center text-ink/70 font-serif text-2xl italic leading-relaxed max-w-md"
                            >
                              "{liveTranscription}"
                            </motion.p>
                          ) : (
                            <p className="text-center text-ink/30 font-serif text-xl italic leading-relaxed max-w-md">
                              Di algo como: "¿Qué dice el Génesis sobre la creación?"
                            </p>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}

                  {isLoading && !isLiveActive && (
                    <div className="flex items-center gap-4 px-2">
                      <div className="flex gap-1.5">
                        <div className="w-1.5 h-1.5 bg-gold-default rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-gold-default rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-gold-default rounded-full animate-bounce" />
                      </div>
                      <span className="text-[10px] uppercase tracking-[3px] font-black text-gold-default">Scriptorium...</span>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 bg-gradient-to-t from-parchment via-parchment to-transparent z-10">
            {!isVoiceMode ? (
              <div className="max-w-3xl mx-auto">
                <form 
                  onSubmit={handleSubmit} 
                  className="relative flex items-end gap-4 p-2 pl-6 bg-white border border-black/5 rounded-[32px] shadow-2xl shadow-black/5 focus-within:border-gold-default/40 focus-within:shadow-gold-default/5 transition-all group"
                >
                  <div className="flex-1 py-4">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit();
                        }
                      }}
                      placeholder="Consultar las Escrituras..."
                      className="w-full bg-transparent border-none outline-none font-sans text-lg placeholder:text-ink/20 resize-none max-h-32 text-ink scroll-hide"
                      rows={1}
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-2 pr-2">
                    <button 
                      type="button" 
                      onClick={toggleVoiceMode}
                      className="p-3 text-ink/20 hover:text-gold-default hover:bg-gold-50 rounded-full transition-all"
                    >
                      <Mic className="w-6 h-6" />
                    </button>
                    <button 
                      type="submit"
                      disabled={isLoading || !input.trim()}
                      className="p-3 bg-ink text-parchment rounded-full hover:bg-gold-default disabled:opacity-20 disabled:grayscale transition-all shadow-lg"
                    >
                      <Send className="w-6 h-6" />
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="flex justify-center">
                <button 
                  onClick={stopLiveSession}
                  className="px-8 py-4 bg-ink text-parchment rounded-full font-bold uppercase tracking-widest text-xs hover:bg-red-600 transition-all shadow-2xl"
                >
                  Finalizar Sesión de Voz
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - Desktop Only */}
        <aside className="hidden xl:flex flex-col w-[350px] shrink-0 border-l border-black/5 py-10 pl-10 h-full overflow-y-auto scroll-hide">
          <div className="space-y-12 pb-20">
            {/* Daily Verse */}
            <div className="bg-deep-blue text-white p-8 rounded-[32px] shadow-2xl shadow-deep-blue/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-700" />
              <div className="relative z-10">
                <Sparkles className="w-5 h-5 text-gold-default mb-6" />
                <p className="font-serif text-xl italic leading-relaxed mb-6">
                  "Tu palabra es una lámpara para mis pasos, y una luz en mi camino."
                </p>
                <div className="flex items-center justify-between border-t border-white/10 pt-4">
                  <span className="text-[10px] uppercase tracking-widest font-black opacity-50">Salmo 119:105</span>
                  <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><RefreshCw className="w-3 h-3" /></button>
                </div>
              </div>
            </div>

            {/* Categories */}
            <div>
              <h3 className="text-[10px] uppercase tracking-[3px] font-black text-gold-default mb-6">Explorar Corpus</h3>
              <div className="space-y-2">
                {[
                  { name: "Libros Históricos", tag: "Tradición" },
                  { name: "Profetas Mayores", tag: "Profecía" },
                  { name: "Nuevo Testamento", tag: "Gracia" },
                  { name: "Epístolas", tag: "Misión" }
                ].map((cat) => (
                  <button key={cat.name} className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-white border border-transparent hover:border-black/5 transition-all text-left font-sans group">
                    <span className="text-sm font-semibold text-ink/70 group-hover:text-ink">{cat.name}</span>
                    <span className="text-[9px] uppercase font-black px-2 py-1 bg-black/5 rounded text-ink/30 group-hover:text-gold-default group-hover:bg-gold-50">{cat.tag}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-6 border-t border-black/5">
              <div className="flex flex-col gap-3">
                <button onClick={clearChat} className="flex items-center gap-3 text-[11px] uppercase tracking-widest font-bold text-ink/40 hover:text-red-500 transition-colors p-2">
                  <History className="w-4 h-4" /> Borrar Historial
                </button>
                <button className="flex items-center gap-3 text-[11px] uppercase tracking-widest font-bold text-ink/40 hover:text-gold-default transition-colors p-2">
                  <HelpCircle className="w-4 h-4" /> Ayuda Teológica
                </button>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Footer / Status Bar */}
      <footer className="px-6 md:px-[60px] py-4 bg-parchment border-t border-black/5 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2 text-[10px] text-ink/30 uppercase tracking-widest font-black">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-sm shadow-green-500/50" />
          <span>Fides et Ratio — Online</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-[10px] text-ink/30 font-serif italic">© 2024 Biblioteca de Teología y Ciencias Sagradas</span>
        </div>
      </footer>
    </div>
  );
}
