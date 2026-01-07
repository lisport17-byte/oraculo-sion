const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

const app = express();
app.use(bodyParser.json());

// Variables de Entorno (Asegúrate de tenerlas configuradas en tu hosting/servidor)
const TOKEN = process.env.TOKEN;
const ID = process.env.ID;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Limpieza de HTML para evitar errores en Telegram
const cleanHTML = (str) => str.replace(/[&<>]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
}[tag] || tag));

app.post('/webhook', async (req, res) => {
    try {
        const data = req.body;
        // Parseo de seguridad por si TradingView envía el JSON como string
        const payload = typeof data === 'string' ? JSON.parse(data) : data;

        const asset = payload.asset || "Activo Desconocido";
        const action = payload.action || "SEÑAL";
        const price = payload.price || "N/A";
        const sl = payload.sl || "Sin definir";
        const tp = payload.tp || "Sin definir";
        const tf = payload.tf || "N/A";

        // Dentro de app.post('/webhook', ...)
const liquidez = payload.liquidez || "Analizando zonas de oferta/demanda";

// Actualiza tu Prompt para que la IA use la liquidez
const promptIA = `Actúa como un Senior Quants Trader. 
Analiza esta señal: ${action} en ${asset}.
Objetivo de Liquidez: ${liquidez}. 
${isSMC ? "ADVERTENCIA: Quiebre estructural detectado." : ""}
... (resto del prompt)`;

        // --- LÓGICA DE DETECCIÓN ESTRUCTURAL (CHoCH / BOS) ---
        const isSMC = action.toUpperCase().includes("CHOCH") || action.toUpperCase().includes("BOS");
        const emojiAccion = (action.toUpperCase().includes('BUY') || action.toUpperCase().includes('LIZ') || action.toUpperCase().includes('BULL')) ? '📈' : '📉';

        // --- NUEVO PROMPT PROFESIONAL DE LA ÉLITE ---
        const promptIA = `Actúa como un Senior Quants Trader de Wall Street. 
Analiza esta señal: ${action} en ${asset} a precio ${price}. 
${isSMC ? "ADVERTENCIA: Se ha detectado un cambio de estructura (SMC/CHoCH)." : ""}
Stop Loss: ${sl}, Take Profit: ${tp}. Temporalidad: ${tf} minutos.

Tu análisis debe:
1. Determinar si es una operación de Scalping o Swing (largo plazo).
2. Evaluar el riesgo/beneficio (R:R).
3. Dar una advertencia técnica basada en el movimiento institucional.
4. Responder en un tono serio, profesional y breve (máximo 3 frases).`;

        // --- LLAMADA A LA IA (GROQ) ---
        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
        });

        const analisisIA = cleanHTML(completion.choices[0]?.message?.content || "Análisis no disponible.");

        // --- CONSTRUCCIÓN DEL MENSAJE FINAL ---
        const titulo = isSMC ? "⚠️ CAMBIO DE ESTRUCTURA DETECTADO" : "🚀 ORDEN DE LA ÉLITE v5.0";

        const mensajeFinal = `<b>${titulo}</b>\n\n` +
                             `<b>Activo:</b> ${asset}\n` +
                             `<b>Acción:</b> ${action} ${emojiAccion}\n` +
                             `<b>Precio Entrada:</b> ${price}\n` +
                             `<b>Temporalidad:</b> ${tf}\n\n` +
                             `🛡️ <b>ZONAS DE PROTECCIÓN</b>\n` +
                             `<b>STOP LOSS:</b> ${sl}\n` +
                             `<b>TAKE PROFIT:</b> ${tp}\n\n` +
                             `🤖 <b>IA ANALYZER:</b> <i>${analisisIA}</i>`;

        // --- ENVÍO A TELEGRAM ---
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "HTML"
        });

        res.status(200).send('Señal procesada con éxito');

    } catch (error) {
        console.error("Error en el Webhook:", error.response ? error.response.data : error.message);
        res.status(500).send('Error interno en el servidor');
    }
});

app.get('/webhook', (req, res) => res.send('IA de Sion y LuxAlgo Operativa 2026'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor de la Élite activo en puerto ${PORT}`));
