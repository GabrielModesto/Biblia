import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || "" 
});

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_INSTRUCTION = `Eres un teólogo y experto en la Biblia Católica. Tu misión es responder preguntas sobre la Santa Biblia de manera precisa, respetuosa y basada en la Tradición, las Escrituras y el Magisterio de la Iglesia Católica. 
Utiliza siempre referencias bíblicas claras (Libro, Capítulo, Versículo). 
Si una pregunta no es sobre la Biblia o temas de fe católica, responde cortésmente que tu especialidad es la Biblia Sagrada.
En tus respuestas, mantén un tono pastoral, educativo y caritativo. 
Utiliza el formato Markdown para resaltar pasajes importantes y citas.
Asegúrate de diferenciar entre el Antiguo y el Nuevo Testamento cuando sea relevante.`;

export async function askBibleQuestion(query: string, history: Message[] = []) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...history.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        })),
        { role: 'user', parts: [{ text: query }] }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }],
      }
    });

    return response.text || "Lo siento, no pude procesar tu pregunta en este momento.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Ocurrió un error al intentar consultar la Biblia. Por favor, intenta de nuevo más tarde.";
  }
}
