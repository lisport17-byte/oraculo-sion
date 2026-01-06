const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const ID = process.env.ID;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.post('/webhook', async (req, res) => {
    // 1. Recibimos el JSON completo desde TradingView
    const data = req.body; 
    
    // Extraemos las piezas del rompecabezas
    // Si algún dato falta, usamos valores por defecto para evitar errores
    const asset = data.asset || "Activo Desconocido";
    const action = data.action || "SEÑAL";
    const price = data.price || "N/A";
    const sl = data.sl || "Sin definir";
    const tp = data.tp || "Sin definir";
    const tf = data.tf || "N/A";

    try {
        // 2. IA ANALYZER: Le enviamos contexto real a Groq
        const promptIA = `Analiza esta señal de trading: ${action} en ${asset} a precio ${price}. SL: ${sl}, TP: ${tp}. Responde en una sola frase muy corta si es buena oportunidad o qué precaución técnica tomar según la estructura.`;
        
        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
        });

        const analisisIA = completion.choices[0]?.message?.content || "Análisis no disponible en este momento.";

        // 3. DISEÑO DE MENSAJE ÉLITE (HTML)
        const mensajeFinal = `🚀 <b>ORDEN DE LA ÉLITE v5.0</b> 🚀\n\n` +
                             `<b>Activo:</b> ${asset}\n` +
                             `<b>Acción:</b> ${action === 'BUY' ? 'COMPRA 📈' : 'VENTA 📉'}\n` +
                             `<b>Precio Entradas:</b> ${price}\n` +
                             `<b>Temporalidad:</b> ${tf}\n\n` +
                             `🛡️ <b>ZONAS DE PROTECCIÓN</b>\n` +
                             `<b>STOP LOSS:</b> ${sl}\n` +
                             `<b>TAKE PROFIT:</b> ${tp}\n\n` +
                             `🤖 <b>IA ANALYZER:</b> <i>${analisisIA}</i>`;

        // 4. Envío a Telegram
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "HTML"
        });

        res.status(200).send('Señal procesada por la Élite');
    } catch (e) {
        console.error("Error en el sistema:", e.message);
        res.status(500).send('Error interno en Render');
    }
});

// Ruta de salud para Render
app.get('/webhook', (req, res) => res.send('IA de Sion Operativa - Frecuencia Morpho 548'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
