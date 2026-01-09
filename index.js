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

// 1. MOTOR DE GESTIÓN DE RIESGO OPTIMIZADO
const calcularLotaje = (asset, entry, sl) => {
    try {
        const risk = 25; // Tu riesgo por operación
        const entryNum = parseFloat(entry);
        const slNum = parseFloat(sl);
        
        // Evitamos división por cero o cálculos erróneos si la IA da números invertidos
        const diff = Math.abs(entryNum - slNum);
        if (!diff || diff === 0) return "Check SL";

        let lotaje = 0;
        const symbol = asset.toUpperCase();

        if (symbol.includes("XAU") || symbol.includes("GOLD")) {
            lotaje = risk / (diff * 100);
        } else if (symbol.includes("US30") || symbol.includes("WS30") || symbol.includes("DJI")) {
            // En US30, usualmente 1 lote = $1 por punto. Ajustamos a minilotes.
            lotaje = risk / diff;
        } else {
            // Forex estándar (EURUSD, etc)
            const pips = diff / 0.0001;
            lotaje = risk / (pips * 10);
        }

        // Limitamos a 2 decimales y nos aseguramos que no sea 0.00
        const finalLot = lotaje.toFixed(2);
        return finalLot > 0 ? finalLot : "0.01 (Min)";
    } catch (e) {
        return "N/A";
    }
};

// 2. WEBHOOK CON PROMPT DE ALTA PRECISIÓN
app.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;
        const asset = payload.asset || "Activo";
        const action = payload.action || "SEÑAL";
        const price = payload.price || "0";
        const tf = payload.tf || "15m";

        // PROMPT EVOLUCIONADO: Prohibimos términos relativos (puntos/pips)
        const promptIA = `Actúa como Senior Quant Trader de Wall Street. 
        Analiza: ${action} en ${asset} a precio ${price} (${tf}).
        
        TAREA TÉCNICA:
        1. Define STOP LOSS como PRECIO EXACTO (Ej: si entry es 44500, SL debe ser algo como 44450.2). NUNCA uses '30 puntos' o '20 pips'.
        2. Define TAKE PROFIT como PRECIO EXACTO siguiendo un R:R de 1:3.
        3. Justifica brevemente la zona de liquidez (Order Block o FVG).
        
        Responde: Niveles numéricos primero y luego análisis en 2 frases.`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
        });

        const analisisRaw = completion.choices[0]?.message?.content || "";
        const analisisIA = cleanHTML(analisRaw);

        // BUSCADOR DE NÚMEROS (Precios reales)
        // Filtramos números que se parezcan al precio de entrada para no capturar el "1:3"
        const numeros = analisRaw.match(/\d+(\.\d+)?/g) || [];
        const preciosSugeridos = numeros.filter(n => Math.abs(parseFloat(n) - parseFloat(price)) < (parseFloat(price) * 0.1));
        
        const slIA = preciosSugeridos[0] || null;
        const tpIA = preciosSugeridos[1] || "1:3 Target";
        const lotajeSugerido = slIA ? calcularLotaje(asset, price, slIA) : "Calculando...";

        // 3. DISEÑO VISUAL ÉLITE V9.0 (Compacto y Profesional)
        const mensajeFinal = 
`🚨 <b>ORDEN DE LA ÉLITE v9.0</b> 🚨

📊 <b>ACTIVO:</b> <code>${asset}</code> | <b>TF:</b> ${tf}
⚡ <b>ACCIÓN:</b> <b>${action}</b>
💵 <b>ENTRADA:</b> <code>${price}</code>

🛡️ <b>GESTIÓN DE RIESGO ($25)</b>
🛑 <b>STOP LOSS:</b> <code>${slIA || 'Manual'}</code>
🎯 <b>TAKE PROFIT:</b> <code>${tpIA}</code>
💰 <b>LOTAJE:</b> ⚠️ <b>${lotajeSugerido}</b> ⚠️

🤖 <b>IA ANALYZER:</b>
<i>${analisisIA}</i>

💎 <i>Operativa Institucional - Caracas, VZLA</i>`;

        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "HTML"
        });

        res.status(200).send('Señal enviada');
    } catch (e) {
        console.error("Error en Webhook:", e.message);
        res.status(500).send('Error');
    }
});

app.get('/', (req, res) => res.send('Oráculo de Sión v9.0 Online'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} activo y listo para el Fondeo`));
