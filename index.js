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
    '&': '&amp;', '<': '&lt;', '>': '&gt;'
}[tag] || tag));

// 1. MOTOR DE GESTIÓN DE RIESGO (Ajustado para Scalping)
const calcularLotaje = (asset, entry, sl) => {
    try {
        const risk = 25; 
        const entryNum = parseFloat(entry);
        const slNum = parseFloat(sl);
        const diff = Math.abs(entryNum - slNum);
        
        if (!diff || diff === 0) return "Check SL";

        let lotaje = 0;
        const symbol = asset.toUpperCase();

        if (symbol.includes("XAU") || symbol.includes("GOLD")) {
            lotaje = risk / (diff * 100);
        } else if (symbol.includes("US30") || symbol.includes("WS30") || symbol.includes("DJI")) {
            lotaje = risk / diff;
        } else {
            const pips = diff / 0.0001;
            lotaje = risk / (pips * 10);
        }

        const finalLot = lotaje.toFixed(2);
        return parseFloat(finalLot) > 0 ? finalLot : "0.01";
    } catch (e) {
        return "N/A";
    }
};

// 2. WEBHOOK CON LÓGICA DE SCALPING
app.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;
        const asset = payload.asset || "Activo";
        const action = payload.action || "SEÑAL";
        const price = payload.price || "0";
        const tf = payload.tf || "15m";

        // CAMBIO CRÍTICO: Prompt enfocado en Scalping y precisión quirúrgica
        const promptIA = `Actúa como Senior Scalper Trader. 
        Analiza: ${action} en ${asset} a precio ${price} (${tf}).
        
        INSTRUCCIONES DE PRECISIÓN:
        1. Define STOP LOSS AJUSTADO: Usa la mecha (wick) más cercana del CHoCH. Buscamos SCALPING, no swing.
        2. Define TAKE PROFIT con R:R 1:3 basado en liquidez inmediata.
        3. Entrega solo PRECIOS EXACTOS.
        
        Responde: Niveles primero y luego análisis de 2 frases sobre la trampa de liquidez detectada.`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
        });

        const analisisRaw = completion.choices[0]?.message?.content || "";
        const analisisIA = cleanHTML(analisisRaw);

        const numeros = analisisRaw.match(/\d+(\.\d+)?/g) || [];
        const preciosSugeridos = numeros.filter(n => {
            const val = parseFloat(n);
            const p = parseFloat(price);
            return val > (p * 0.8) && val < (p * 1.2); 
        });
        
        const slIA = preciosSugeridos[0] || null;
        const tpIA = preciosSugeridos[1] || "Target 1:3";
        const lotajeSugerido = slIA ? calcularLotaje(asset, price, slIA) : "Pendiente";

        // 3. DISEÑO VISUAL ÉLITE v9.6
        const mensajeFinal = 
`⚡ <b>SCALPER ELITE v9.6</b> ⚡

📊 <b>ACTIVO:</b> <code>${asset}</code> | <b>TF:</b> ${tf}
🎯 <b>ACCIÓN:</b> <b>${action}</b>
💵 <b>ENTRADA:</b> <code>${price}</code>

🛡️ <b>GESTIÓN DE RIESGO ($25)</b>
🛑 <b>STOP LOSS:</b> <code>${slIA || 'Manual'}</code>
🎯 <b>TAKE PROFIT:</b> <code>${tpIA}</code>
💰 <b>LOTAJE:</b> ⚠️ <b>${lotajeSugerido}</b> ⚠️

🤖 <b>ANALYSIS:</b>
<i>${analisisIA}</i>

💎 <i>Scalping Institucional - Caracas, VZLA</i>`;

        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "HTML"
        });

        res.status(200).send('OK');
    } catch (e) {
        console.error("Error en Webhook:", e.message);
        res.status(500).send('Error');
    }
});

app.get('/', (req, res) => res.send('Oráculo Scalper v9.6 Online'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Scalper Mode Activo en puerto ${PORT}`));
