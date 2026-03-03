const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

const app = express();
app.use(bodyParser.json());

const TOKEN          = process.env.TOKEN;
const CHAT_ID        = process.env.ID;
const GROQ_KEY       = process.env.GROQ_API_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const RIESGO_USD     = 25;

const groq = new Groq({ apiKey: GROQ_KEY });

const getDecimals = (asset) => {
    const sym = asset.toUpperCase();
    if (sym.includes("JPY"))                          return 3;
    if (sym.includes("XAU") || sym.includes("GOLD"))  return 2;
    if (sym.includes("US30") || sym.includes("DJI"))  return 1;
    if (sym.includes("NAS") || sym.includes("SPX"))   return 1;
    return 5;
};

const fmt = (num, dec) => parseFloat(num).toFixed(dec);

const calcularLotaje = (asset, entry, sl) => {
    try {
        const diff = Math.abs(parseFloat(entry) - parseFloat(sl));
        if (!diff || isNaN(diff)) return "0.01";
        const sym = asset.toUpperCase();
        let lotaje = 0;
        if (sym.includes("XAU") || sym.includes("GOLD")) {
            lotaje = RIESGO_USD / (diff * 100);
        } else if (sym.includes("US30") || sym.includes("DJI")) {
            lotaje = RIESGO_USD / (diff * 1);
        } else if (sym.includes("NAS")) {
            lotaje = RIESGO_USD / (diff * 2);
        } else if (sym.includes("JPY")) {
            lotaje = RIESGO_USD / (diff * 1000);
        } else {
            lotaje = RIESGO_USD / (diff * 100000);
        }
        const final = Math.floor(lotaje * 100) / 100;
        return final > 0 ? final.toFixed(2) : "0.01";
    } catch {
        return "0.01";
    }
};

const analizarConIA = async (asset, direccion, price, tf, sl, tp3, rsi, contexto, fuerza) => {
    const prompt = `Eres un Trader Institucional de Elite. Analiza esta senal con datos REALES:
ACTIVO: ${asset}
PRECIO DE ENTRADA: ${price}
DIRECCION: ${direccion}
TIMEFRAME: ${tf}
STOP LOSS: ${sl}
TAKE PROFIT 1:3: ${tp3}
RSI actual: ${rsi}
CONTEXTO: ${contexto}
FUERZA: ${fuerza}
Valida si la senal tiene coherencia tecnica en 2 frases maximo.
RESPONDE SOLO EN JSON: {"validacion": "FUERTE|MODERADA|DEBIL", "comentario": "analisis en 2 frases"}`;

    const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        response_format: { type: "json_object" }
    });

    return JSON.parse(
        completion.choices[0]?.message?.content ||
        '{"validacion":"MODERADA","comentario":"Senal dentro de parametros normales."}'
    );
};

const enviarTelegram = async (mensaje) => {
    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: mensaje,
        parse_mode: "HTML"
    });
};

app.post('/webhook', async (req, res) => {
    try {
        const { secret, asset, action, price, sl, tp1, tp2, tp3, tf, rsi, contexto, fuerza } = req.body;

        if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
            console.warn("Webhook rechazado: secret invalido");
            return res.status(403).send('Forbidden');
        }

        if (!asset  !action  !price || !sl) {
            return res.status(400).send('Payload incompleto');
        }

        const pCurrent  = parseFloat(price);
        const slNum     = parseFloat(sl);
        const tp1Num    = parseFloat(tp1);
        const tp2Num    = parseFloat(tp2);
        const tp3Num    = parseFloat(tp3);
        const rsiNum    = parseFloat(rsi || 50);
        const direccion = action.toUpperCase().includes("BUY") ? "COMPRA" : "VENTA";
        const dec       = getDecimals(asset);
console.log(Senal recibida: ${asset} | ${direccion} | ${price} | TF: ${tf});

        const ia = await analizarConIA(
            asset, direccion, price, tf,
            sl, tp3, rsiNum,
            contexto  "N/A", fuerza  "N/A"
        );

        const lotaje    = calcularLotaje(asset, price, slNum);
        const distancia = Math.abs(pCurrent - slNum);
        const ratioReal = tp3Num ? ((Math.abs(tp3Num - pCurrent)) / distancia).toFixed(1) : "3.0";

        const validEmoji  = ia.validacion === "FUERTE" ? "🔥" : ia.validacion === "DEBIL" ? "⚠️" : "✅";
        const headerEmoji = direccion === "COMPRA" ? "🟢 🚀 COMPRA INSTITUCIONAL" : "🔴 🔻 VENTA INSTITUCIONAL";

        const mensaje = ${headerEmoji}

⚡ <b>ACTIVO:</b> <code>${asset}</code>  |  ⏱ <b>TF:</b> <code>${tf || 'N/A'}</code>
💵 <b>ENTRADA:</b> <code>${fmt(price, dec)}</code>

🎯 <b>NIVELES</b>
🛑 <b>SL:</b> <code>${fmt(slNum, dec)}</code>
🎯 <b>TP1 (1:1):</b> <code>${fmt(tp1Num, dec)}</code>
🎯 <b>TP2 (1:2):</b> <code>${fmt(tp2Num, dec)}</code>
💰 <b>TP3 (1:${ratioReal}):</b> <code>${fmt(tp3Num, dec)}</code>

📊 <b>CONTEXTO</b>
📈 Tendencia: <code>${contexto || 'N/A'}</code>  |  RSI: <code>${rsiNum.toFixed(1)}</code>

⚖️ <b>GESTION ($${RIESGO_USD} Riesgo)</b>
💎 <b>LOTAJE:</b> <code>${lotaje}</code>

${validEmoji} <b>VALIDACION IA [${ia.validacion}]:</b>
<i>${ia.comentario}</i>

🌌 <i>Opera con disciplina.</i>;

        await enviarTelegram(mensaje);
        console.log(Enviado: ${asset} ${direccion});
        res.status(200).send('OK');

    } catch (e) {
        console.error("Error:", e.message);
        res.status(500).send('Error');
    }
});

app.get('/', (req, res) => {
    res.send('Bot Senales Elite v2.0 - Activo');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(Servidor en puerto ${PORT}));
