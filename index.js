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

// 1. MOTOR DE GESTIÓN DE RIESGO
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
            // Forex estándar
            const pips = diff / 0.0001;
            lotaje = risk / (pips * 10);
        }

        const finalLot = lotaje.toFixed(2);
        return parseFloat(finalLot) > 0 ? finalLot : "0.01";
    } catch (e) {
        return "N/A";
    }
};

// 2. WEBHOOK PRINCIPAL
app.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;
        const asset = payload.asset || "Activo";
        const action = payload.action || "SEÑAL";
        const price = payload.price || "0";
        const tf = payload.tf || "15m";

        const promptIA = `Actúa como Senior Quant Trader de Wall Street. 
        Analiza: ${action} en ${asset} a precio ${price} (${tf}).
        
        TAREA TÉCNICA:
        1. Define STOP LOSS como PRECIO EXACTO (Ej: 44450.2). NUNCA uses puntos o pips.
        2. Define TAKE PROFIT como PRECIO EXACTO siguiendo un R:R de 1:3.
        3. Justifica brevemente la zona de liquidez.
        
        Responde: Niveles numéricos primero y luego análisis en 2 frases.`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
        });

        // CORRECCIÓN DE VARIABLES: Usamos 'analisisRaw' en todo el bloque
        const analisisRaw = completion.choices[0]?.message?.content || "";
        const analisisIA = cleanHTML(analisisRaw);

        // BUSCADOR DE NÚMEROS MEJORADO
        const numeros = analisisRaw.match(/\d+(\.\d+)?/g) || [];
        
        // Filtramos para obtener precios que tengan sentido según el activo
        const preciosSugeridos = numeros.filter(n => {
            const val = parseFloat(n);
            const p = parseFloat(price);
            return val > (p * 0.5) && val < (p * 1.5); // Filtro de cercanía al precio
        });
        
        const slIA = preciosSugeridos[0] || null;
        const tpIA = preciosSugeridos[1] || "Target 1:3";
        const lotajeSugerido = slIA ? calcularLotaje(asset, price, slIA) : "Pendiente";

        // 3. DISEÑO VISUAL ÉLITE (Compacto)
        const mensajeFinal = 
`🚨 <b>ORDEN DE LA ÉLITE v9.2</b> 🚨

📊 <b>ACTIVO:</b> <code>${asset}</code> | <b>TF:</b> ${tf}
⚡ <b>ACCIÓN:</b> <b>${action}</b>
💵 <b>ENTRADA:</b> <code>${price}</code>

🛡️ <b>GESTIÓN ($25 RISK)</b>
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

        res.status(200).send('OK');
    } catch (e) {
        console.error("Error en Webhook:", e.message);
        res.status(500).send('Error');
    }
});

app.get('/', (req, res) => res.send('Oráculo Online v9.2 - Corregido'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} activo`));
