const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

const app = express();
app.use(bodyParser.json());

// CONFIGURACIÓN DE VARIABLES (Asegúrate de tenerlas en tu archivo .env o configuradas)
const TOKEN = process.env.TOKEN;
const ID = process.env.ID;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Limpieza de texto para Telegram
const cleanHTML = (str) => str.replace(/[&<>]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;'
}[tag] || tag));

// 1. MOTOR DE GESTIÓN DE RIESGO PROFESIONAL ($25)
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

// 2. WEBHOOK MULTI-ESTRATEGIA (CONFLUENCIA TOTAL)
app.post('/webhook', async (req, res) => {
    try {
        const { asset, action, price, tf, strategy } = req.body;
        const pCurrent = parseFloat(price);
        const esAltaProbabilidad = (strategy === "10K_CHALLENGE");

        // PROMPT SINTÉRGICO MEJORADO
        const promptIA = `Actúa como Senior Scalper Trader profesional.
        CONTEXTO: ${asset} a ${price} en TF ${tf}. Estrategia: ${strategy || 'SMC'}.
        ACCIÓN: ${action}.
        
        TAREA:
        1. Define SL (Stop Loss) lógico y cercano.
        2. Define TP (Take Profit) manteniendo Ratio 1:3.
        REGLA DE ORO: Si es compra, SL < ${price}. Si es venta, SL > ${price}. 
        Usa solo precios coherentes con el valor ${price}.

        RESPONDE EXACTAMENTE ASÍ:
        SL: [valor]
        TP: [valor]
        ANALISIS: [1 frase corta sobre la liquidez]`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1, 
        });

        const raw = completion.choices[0]?.message?.content || "";
        const numeros = raw.match(/\d+(\.\d+)?/g) || [];
        
        // Filtro Quántico del 2% para evitar errores de la IA
        const preciosValidos = numeros.filter(n => {
            const v = parseFloat(n);
            return v > (pCurrent * 0.98) && v < (pCurrent * 1.02);
        });

        let sl = null;
        let tp = null;

        if (action.toUpperCase().includes("BUY") || action.toUpperCase().includes("BULLISH")) {
            sl = preciosValidos.find(n => parseFloat(n) < pCurrent);
            tp = preciosValidos.find(n => parseFloat(n) > pCurrent);
        } else {
            sl = preciosValidos.find(n => parseFloat(n) > pCurrent);
            tp = preciosValidos.find(n => parseFloat(n) < pCurrent);
        }

        const lot = sl ? calcularLotaje(asset, price, sl) : "Ajuste Manual";
        const badge = esAltaProbabilidad ? "💎 10K CHALLENGE - ALTA PROBABILIDAD 💎" : "⚖️ ESTRATEGIA SMC CONFIRMADA ⚖️";

        const mensajeFinal = 
`${badge}

📊 <b>ACTIVO:</b> <code>${asset}</code> | <b>TF:</b> ${tf}
🎯 <b>ACCIÓN:</b> <b>${action}</b>
💵 <b>ENTRADA:</b> <code>${price}</code>

🛡️ <b>GESTIÓN DE RIESGO ($25)</b>
🛑 <b>STOP LOSS:</b> <code>${sl || 'Calculando...'}</code>
🎯 <b>TAKE PROFIT:</b> <code>${tp || 'Target 1:3'}</code>
💰 <b>LOTAJE SUGERIDO:</b> ⚠️ <b>${lot}</b> ⚠️

🤖 <b>VISIÓN IA:</b>
<i>${cleanHTML(raw.split("ANALISIS:")[1] || "Alineado con el flujo de órdenes.")}</i>

💎 <b>Así es y así será gracias, gracias, gracias</b>
✨ <i>Libertad Financiera Manifestada</i>`;

        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "HTML"
        });

        res.status(200).send('OK');
    } catch (e) {
        console.error("Error:", e);
        res.status(500).send('Error');
    }
});

app.get('/', (req, res) => res.send('Oráculo v9.9 - Matrix Activa'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Oráculo funcionando en puerto ${PORT}`));
