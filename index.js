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
        const asset   = payload.asset || "Activo Desconocido";
        const action  = payload.action || "SEÑAL";
        const price   = payload.price || "N/A";
        const sl      = payload.sl || "Sin definir";
        const tp      = payload.tp || "Sin definir";
        const tf      = payload.tf || "N/A";
        const liquidez = payload.liquidez || "Analizando zonas de oferta/demanda";

        // 2. Lógica de Detección (Definir antes de usar)
        const isSMC = action.toUpperCase().includes("CHOCH") || action.toUpperCase().includes("BOS");
        const emojiAccion = (action.toUpperCase().includes('BUY') || action.toUpperCase().includes('LIZ') || action.toUpperCase().includes('BULL')) ? '📈' : '📉';

        // 3. Prompt Profesional Único (Mejorado con Liquidez e Instrucciones de Wall Street)
        const promptIA = `Actúa como un Senior Quants Trader de Wall Street. 
Analiza: ${action} en ${asset} a precio ${price}. 
Temporalidad: ${tf} min. SL: ${sl} | TP: ${tp}.
Objetivo de Liquidez detectado: ${liquidez}.
${isSMC ? "ADVERTENCIA: Se ha detectado un cambio de estructura (SMC/CHoCH)." : ""}

Tu análisis debe:
1. Determinar si es Scalping o Swing.
2. Evaluar el riesgo/beneficio (R:R) hacia la zona de liquidez mencionada.
3. Dar una advertencia técnica institucional breve.
Responder en tono serio y profesional (máximo 3 frases).`;

        // 4. Llamada a Groq
        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
        });

        const analisisIA = cleanHTML(completion.choices[0]?.message?.content || "Análisis no disponible.");

        // 5. Construcción del Mensaje para Telegram
        const titulo = isSMC ? "⚠️ CAMBIO DE ESTRUCTURA DETECTADO" : "🚀 ORDEN DE LA ÉLITE v6.0";

        const mensajeFinal = `<b>${titulo}</b>\n\n` +
                             `<b>Activo:</b> ${asset}\n` +
                             `<b>Acción:</b> ${action} ${emojiAccion}\n` +
                             `<b>Precio Entrada:</b> ${price}\n` +
                             `<b>Temporalidad:</b> ${tf} min\n` +
                             `<b>Objetivo Liquidez:</b> ${liquidez}\n\n` +
                             `🛡️ <b>ZONAS DE PROTECCIÓN</b>\n` +
                             `<b>STOP LOSS:</b> ${sl}\n` +
                             `<b>TAKE PROFIT:</b> ${tp}\n\n` +
                             `🤖 <b>IA ANALYZER:</b> <i>${analisisIA}</i>`;

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

app.get('/webhook', (req, res) => res.send('Servidor IA de Élite v6.0 Operativo'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Puerto ${PORT} activo`));
