const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const ID = process.env.ID;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Función para evitar que caracteres extraños rompan el HTML de Telegram
const cleanHTML = (str) => str.replace(/[&<>]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
}[tag] || tag));

app.post('/webhook', async (req, res) => {
    const data = req.body; 
    
    // Si TradingView envía el JSON como string, lo parseamos (seguridad extra)
    const payload = typeof data === 'string' ? JSON.parse(data) : data;

    const asset = payload.asset || "Activo Desconocido";
    const action = payload.action || "SEÑAL";
    const price = payload.price || "N/A";
    const sl = payload.sl || "Sin definir";
    const tp = payload.tp || "Sin definir";
    const tf = payload.tf || "N/A";

    try {
        const promptIA = `Analiza esta señal de trading: ${action} en ${asset}. SL: ${sl}, TP: ${tp}. Responde en una sola frase muy corta si es buena oportunidad.`;
        
        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
        });

        // Limpiamos la respuesta de la IA para que no rompa el HTML
        const analisisIA = cleanHTML(completion.choices[0]?.message?.content || "Análisis no disponible.");

        const mensajeFinal = `🚀 <b>ORDEN DE LA ÉLITE v5.0</b> 🚀\n\n` +
                             `<b>Activo:</b> ${asset}\n` +
                             `<b>Acción:</b> ${action === 'BUY' ? 'COMPRA 📈' : 'VENTA 📉'}\n` +
                             `<b>Precio Entradas:</b> ${price}\n` +
                             `<b>Temporalidad:</b> ${tf}\n\n` +
                             `🛡️ <b>ZONAS DE PROTECCIÓN</b>\n` +
                             `<b>STOP LOSS:</b> ${sl}\n` +
                             `<b>TAKE PROFIT:</b> ${tp}\n\n` +
                             `🤖 <b>IA ANALYZER:</b> <i>${analisisIA}</i>`;

        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "HTML"
        });

        res.status(200).send('Señal procesada');
    } catch (e) {
        // Log detallado para saber si el error es de Telegram o de Groq
        console.error("Error detallado:", e.response ? e.response.data : e.message);
        res.status(500).send('Error interno');
    }
});

app.get('/webhook', (req, res) => res.send('IA de Sion Operativa'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo`));
