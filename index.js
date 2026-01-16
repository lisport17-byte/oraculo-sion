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

// 1. MOTOR DE GESTIÓN DE RIESGO PROFESIONAL
const calcularLotaje = (asset, entry, sl) => {
    try {
        const risk = 25; 
        const entryNum = parseFloat(entry);
        const slNum = parseFloat(sl);
        const diff = Math.abs(entryNum - slNum);
        if (!diff || diff === 0) return "Ajustar";

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
    } catch (e) { return "N/A"; }
};

// 2. WEBHOOK PRINCIPAL (PRECISIÓN QUÁNTICA)
app.post('/webhook', async (req, res) => {
    try {
        const { asset, action, price, tf } = req.body;
        const pCurrent = parseFloat(price);

        // PROMPT DE ALTA PRECISIÓN
        const promptIA = `Actúa como Senior Scalper. Mercado: ${asset} a ${price}.
        TAREA:
        1. SL: Define el Stop Loss exacto cerca de ${price}.
        2. TP: Define el Take Profit exacto para R:R 1:3.
        REGLA: Usa solo precios actuales. No uses niveles de años pasados.
        RESPONDE SOLO ASÍ:
        SL: [valor]
        TP: [valor]
        ANALISIS: [3 frase]`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1, // Mínima creatividad, máxima precisión
        });

        const raw = completion.choices[0]?.message?.content || "";
        const numeros = raw.match(/\d+(\.\d+)?/g) || [];
        
        // FILTRO DE SEGURIDAD: Solo aceptamos precios en un rango del 2% del actual
        const preciosValidos = numeros.filter(n => {
            const v = parseFloat(n);
            return v > (pCurrent * 0.98) && v < (pCurrent * 1.02);
        });

        let sl = null;
        let tp = null;

        if (action.includes("BULLISH")) {
            sl = preciosValidos.find(n => parseFloat(n) < pCurrent);
            tp = preciosValidos.find(n => parseFloat(n) > pCurrent);
        } else {
            sl = preciosValidos.find(n => parseFloat(n) > pCurrent);
            tp = preciosValidos.find(n => parseFloat(n) < pCurrent);
        }

        const lot = sl ? calcularLotaje(asset, price, sl) : "Calculando...";
        const analisisClean = cleanHTML(raw.split("ANALISIS:")[1] || "Análisis en curso.");

        const mensajeFinal = 
`⚡ <b>ORÁCULO v9.8 SINTÉRGICO</b> ⚡

📊 <b>ACTIVO:</b> <code>${asset}</code> | <b>TF:</b> ${tf}
🎯 <b>ACCIÓN:</b> <b>${action}</b>
💵 <b>ENTRADA:</b> <code>${price}</code>

🛡️ <b>GESTIÓN DE RIESGO ($25)</b>
🛑 <b>STOP LOSS:</b> <code>${sl || 'Ajuste Manual'}</code>
🎯 <b>TAKE PROFIT:</b> <code>${tp || 'R:R 1:3'}</code>
💰 <b>LOTAJE:</b> ⚠️ <b>${lot}</b> ⚠️

🤖 <b>VISIÓN IA:</b>
<i>${analisisClean}</i>

💎 <b>Así es y así será gracias, gracias, gracias</b>
✨ <i>Libertad Financiera Manifestada</i>`;

        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID, text: mensajeFinal, parse_mode: "HTML"
        });

        res.status(200).send('OK');
    } catch (e) {
        res.status(500).send('Error');
    }
});

app.get('/', (req, res) => res.send('Oráculo v9.8 - Online y Sintérgico'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} activo`));
