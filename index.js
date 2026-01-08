const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

// 1. PRIMERO DEFINIMOS LA APP (Esto arregla el error de tus logs)
const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const ID = process.env.ID;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const cleanHTML = (str) => str.replace(/[&<>]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;'
}[tag] || tag));

// 2. LUEGO LA FUNCIÓN DE LOTAJE
const calcularLotaje = (asset, entry, sl) => {
    const risk = 25; 
    const entryNum = parseFloat(entry);
    const slNum = parseFloat(sl);
    const pipsDiff = Math.abs(entryNum - slNum);
    if (!pipsDiff || pipsDiff === 0) return "N/A";
    let lotaje = 0;
    const symbol = asset.toUpperCase();
    if (symbol.includes("XAU") || symbol.includes("GOLD")) {
        lotaje = risk / (pipsDiff * 100);
    } else if (symbol.includes("US30")) {
        lotaje = risk / pipsDiff;
    } else {
        const pips = pipsDiff / 0.0001;
        lotaje = risk / (pips * 10);
    }
    return lotaje.toFixed(2);
};

// 3. POR ÚLTIMO LOS WEBHOOKS
app.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;
        const asset = payload.asset || "Activo";
        const action = payload.action || "SEÑAL";
        const price = payload.price || "0";
        const tf = payload.tf || "15m";
        const liquidez = payload.liquidez || "Analizando liquidez";

        const promptIA = `Actúa como Senior Quant Trader. Analiza: ${action} en ${asset} a ${price} (${tf}). Define SL y TP numéricos (R:R 1:3). Responde niveles y luego técnica breve.`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
        });

        const analisisIA = cleanHTML(completion.choices[0]?.message?.content || "");
        const numeros = analisisIA.match(/\d+(\.\d+)?/g) || [];
        const slIA = numeros[0] || null;
        const lotajeSugerido = slIA ? calcularLotaje(asset, price, slIA) : "Pendiente";

        const mensajeFinal = `🚨 <b>ORDEN DE LA ÉLITE</b> 🚨\n\n` +
            `📊 <b>ACTIVO:</b> ${asset} (${tf})\n` +
            `⚡ <b>ACCIÓN:</b> ${action}\n` +
            `💵 <b>PRECIO:</b> ${price}\n\n` +
            `🛡️ <b>NIVELES</b>\n` +
            `🛑 <b>SL:</b> ${slIA || 'Ver IA'}\n` +
            `🎯 <b>TP:</b> ${numeros[1] || '1:3'}\n` +
            `💰 <b>LOT ($25 RISK):</b> <code>${lotajeSugerido}</code>\n\n` +
            `🤖 <b>IA:</b>\n<i>${analisisIA}</i>`;

        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID, text: mensajeFinal, parse_mode: "HTML"
        });
        res.status(200).send('OK');
    } catch (e) {
        res.status(500).send('Error');
    }
});

app.get('/', (req, res) => res.send('Servidor Élite v8.0 Online'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Puerto ${PORT} activo`));
