const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const ID = process.env.ID;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const cleanHTML = (str) => str.replace(/[&<>]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
}[tag] || tag));

app.post('/webhook', async (req, res) => {
    try {
        const data = req.body;
        const payload = typeof data === 'string' ? JSON.parse(data) : data;

        // 1. Extracción de Datos
        const asset    = payload.asset || "Activo Desconocido";
        const action   = payload.action || "SEÑAL";
        const price    = payload.price || "N/A";
        const tf       = payload.tf || "N/A";
        const liquidez = payload.liquidez || "Analizando zonas de oferta/demanda";

        // 2. Lógica de Detección
        const isSMC = action.toUpperCase().includes("CHOCH") || action.toUpperCase().includes("BOS");
        const emojiAccion = (action.toUpperCase().includes('BUY') || action.toUpperCase().includes('LIZ') || action.toUpperCase().includes('BULL')) ? '📈' : '📉';

        // 3. Prompt Evolucionado: Solicitud de Niveles Numéricos Específicos
        // Aquí pedimos a la IA que calcule SL y TP basados en estructura real
        const promptIA = `Actúa como un Senior Quant Trader de Wall Street. 
Analiza esta operación: ${action} en ${asset} a precio ${price}. 
Temporalidad: ${tf}. Contexto de Liquidez: ${liquidez}.

TU TAREA TÉCNICA:
1. Define un valor numérico exacto para STOP LOSS. Si es SELL, úsalo sobre el Strong High o una estructura más cercana si el momentum es débil. Si es BUY, bajo el Strong Low.
2. Define un valor numérico exacto para TAKE PROFIT buscando un R:R de 1:3 hacia la liquidez.
3. Determina si es Scalping o Swing.
4. Explica brevemente por qué elegiste esos niveles específicos (ej. 'protección por encima del Weak High').

Responde en español, tono profesional, máximo 3 frases.`;

        // 4. Llamada a Groq
        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
        });

        const analisisIA = cleanHTML(completion.choices[0]?.message?.content || "Análisis no disponible.");

        // 5. Construcción del Mensaje para Telegram
        const titulo = isSMC ? "⚠️ CAMBIO DE ESTRUCTURA DETECTADO" : "🚀 ORDEN DE LA ÉLITE v7.0";

        const mensajeFinal = `<b>${titulo}</b>\n\n` +
                             `<b>Activo:</b> ${asset}\n` +
                             `<b>Acción:</b> ${action} ${emojiAccion}\n` +
                             `<b>Precio Entrada:</b> ${price}\n` +
                             `<b>Temporalidad:</b> ${tf}\n` +
                             `<b>Objetivo Liquidez:</b> ${liquidez}\n\n` +
                             `🛡️ <b>ESTRATEGIA CUÁNTICA IA</b>\n` +
                             `<i>${analisisIA}</i>`;

        // 6. Envío
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "HTML"
        });

        res.status(200).send('Señal procesada con éxito');

    } catch (error) {
        console.error("Error en el Webhook:", error.message);
        res.status(500).send('Error interno');
    }
});

app.get('/webhook', (req, res) => res.send('Servidor IA de Élite v7.0 Operativo'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Puerto ${PORT} activo`));
