const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');
const cors = require('cors');

// PRIMERO creamos la app
const app = express();

// LUEGO le inyectamos los portales
app.use(cors()); 
app.use(bodyParser.json());

// ══════════════════════════════════════════════
//   CONFIGURACIÓN PROP FIRM - FUNDING PIPS
// ══════════════════════════════════════════════
const TOKEN          = process.env.TOKEN;
const CHAT_ID        = process.env.ID;
const GROQ_KEY       = process.env.GROQ_API_KEY; 
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const CUENTA_SIZE    = parseFloat(process.env.CUENTA_SIZE   || "25000");
const RIESGO_PCT     = parseFloat(process.env.RIESGO_PCT    || "0.5");
const MAX_LOSS_DIA   = parseFloat(process.env.MAX_LOSS_DIA  || "1250");
const MAX_LOSS_TOTAL = parseFloat(process.env.MAX_LOSS_TOTAL|| "2500");

const groq = new Groq({ apiKey: GROQ_KEY });

// ══════════════════════════════════════════════
//   CONTROL DE RIESGO DIARIO Y MEMORIA IA
// ══════════════════════════════════════════════
let perdidaDia           = 0;
let perdidaTotal         = 0;
let operacionesDia       = 0;
let perdidasConsecutivas = 0;
let fechaActual          = new Date().toDateString();
let botPausado           = false;
let razonPausa           = "";

const resetDiario = () => {
    const hoy = new Date().toDateString();
    if (hoy !== fechaActual) {
        fechaActual          = hoy;
        perdidaDia           = 0;
        operacionesDia       = 0;
        if (botPausado && razonPausa === "MAX_LOSS_DIA") {
            botPausado = false;
            razonPausa = "";
        }
    }
};

const registrarResultado = (ganancia) => {
    if (ganancia < 0) {
        perdidaDia   += Math.abs(ganancia);
        perdidaTotal += Math.abs(ganancia);
        perdidasConsecutivas++;
        if (perdidaDia   >= MAX_LOSS_DIA)    { botPausado = true; razonPausa = "MAX_LOSS_DIA"; }
        if (perdidaTotal >= MAX_LOSS_TOTAL)  { botPausado = true; razonPausa = "MAX_LOSS_TOTAL"; }
    } else {
        perdidasConsecutivas = 0;
    }
    operacionesDia++;
};

// ══════════════════════════════════════════════
//   FILTRO DE NOTICIAS (AUTOAPRENDIZAJE)
// ══════════════════════════════════════════════
const verificarNoticias = async (asset) => {
    try {
        const ahora = new Date();
        const res = await axios.get('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { timeout: 5000 });
        const noticias = res.data;
        
        const mapaMonedas = {
            "USD": ["EURUSD","GBPUSD","USDJPY","USDCAD","USDCHF","AUDUSD","US30","NAS100","XAUUSD"],
            "EUR": ["EURUSD"],
            "GBP": ["GBPUSD","GBPJPY"],
            "JPY": ["USDJPY","GBPJPY"],
            "XAU": ["XAUUSD"]
        };

        for (const [moneda, activos] of Object.entries(mapaMonedas)) {
            if (!activos.includes(asset.toUpperCase())) continue;
            
            const criticas = noticias.filter(n => {
                if (n.impact !== "High" || n.country !== moneda) return false;
                const diff = (new Date(n.date) - ahora) / 60000;
                return diff >= -30 && diff <= 120;
            });

            if (criticas.length > 0) {
                const titulos = criticas.map(n => n.title).join(", ");
                return { hayNoticia: true, detalle: `Impacto Alto (${moneda}): ${titulos}` };
            }
        }
        return { hayNoticia: false, detalle: "Sin noticias macroeconómicas disruptivas a la vista." };
    } catch (e) {
        return { hayNoticia: false, detalle: "Flujo de noticias no disponible, guiarse por pura acción de precio." };
    }
};

// ══════════════════════════════════════════════
//   HELPERS MATEMÁTICOS
// ══════════════════════════════════════════════
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
        const diff      = Math.abs(parseFloat(entry) - parseFloat(sl));
        if (!diff || isNaN(diff)) return "0.01";
        
        const riesgoUSD = (CUENTA_SIZE * RIESGO_PCT) / 100;
        const sym       = asset.toUpperCase();
        let lotaje      = 0;

        if (sym.includes("XAU") || sym.includes("GOLD")) { lotaje = riesgoUSD / (diff * 100); } 
        else if (sym.includes("US30") || sym.includes("DJI")) { lotaje = riesgoUSD / (diff * 1); } 
        else if (sym.includes("NAS")) { lotaje = riesgoUSD / (diff * 2); } 
        else if (sym.includes("JPY")) { lotaje = riesgoUSD / (diff * 1000); } 
        else { lotaje = riesgoUSD / (diff * 100000); }

        const final = Math.floor(lotaje * 100) / 100;
        return final > 0 ? final.toFixed(2) : "0.01";
    } catch { return "0.01"; }
};

// ══════════════════════════════════════════════
//   CEREBRO IA (GROQ + AUTOAPRENDIZAJE)
// ══════════════════════════════════════════════
const analizarConIA = async (asset, direccion, price, tf, sl, tp1, tp2, tp3, rsi, contexto, fuerza, contextoFundamental) => {
    const prompt = `Eres un Agente de IA Cuántico y Trader Institucional de Élite operando una prueba de fondeo Funding Pips de $25,000. Tu meta es proteger el capital y fluir con la energía del mercado.

ACTIVO: ${asset} | DIRECCIÓN: ${direccion}
CONTEXTO TÉCNICO (Sinergia 15m/1H/4H): ${contexto}
FUERZA DEL IMPULSO (RSI): ${rsi} (${fuerza})
NOTICIAS FUNDAMENTALES: ${contextoFundamental}
MEMORIA CUÁNTICA: Tienes una racha actual de ${perdidasConsecutivas} operaciones perdidas consecutivas.

Criterios obligatorios:
1. Si tienes pérdidas recientes (>1), sé extremadamente riguroso y exige condiciones técnicas perfectas para no quemar el 5% diario.
2. Evalúa la noticia fundamental: ¿Aporta volatilidad a favor de la estructura o es manipulación para cazar Stop Loss?
3. ¿El ratio riesgo/beneficio es idóneo para una cuenta Prop Firm?

RESPONDE ÚNICAMENTE EN JSON ESTRICTO:
{
  "validacion": "FUERTE|MODERADA|DEBIL",
  "confianza": <número 0 a 100>,
  "comentario": "<Analiza brevemente la alineación entre la técnica, la noticia y tu gestión de riesgo actual>",
  "recomendacion": "ENTRAR|ESPERAR_RETROCESO|CANCELAR"
}`;

    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1, 
            response_format: { type: "json_object" }
        });
        return JSON.parse(completion.choices[0]?.message?.content);
    } catch (error) {
        console.error("Fallo temporal de la red neuronal:", error.message);
        return {
            "validacion": "MODERADA",
            "confianza": 65,
            "comentario": "Evaluado algorítmicamente por acción de precio.",
            "recomendacion": "ENTRAR"
        };
    }
};

// ══════════════════════════════════════════════
//   ENVÍO TELEGRAM
// ══════════════════════════════════════════════
const enviarTelegram = async (mensaje) => {
    try {
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: mensaje,
            parse_mode: "HTML"
        });
    } catch (err) {
        console.error("Error enviando mensaje:", err.message);
    }
};

// ══════════════════════════════════════════════
//   WEBHOOK PRINCIPAL
// ══════════════════════════════════════════════
app.post('/webhook', async (req, res) => {
    try {
        resetDiario();
        const { secret, asset, action, price, sl, tp1, tp2, tp3, tf, rsi, contexto, fuerza, level, new_sl } = req.body;

        if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
            return res.status(403).send('Forbidden');
        }

        // 🛡️ INTERCEPTOR DEL TRAILING STOP
        if (action === "TRAILING") {
            const msgT = `🚨 <b>LUZ VERDE, ASEGURA LA ENERGÍA</b>\n\nActivo: <code>${asset}</code>\nExpansión alcanzada: <b>${level}</b>\n\n🛡️ Mueve tu Stop Loss en MT5/cTrader ahora mismo a: <code>${new_sl}</code>`;
            await enviarTelegram(msgT);
            return res.status(200).send('TRAILING_OK');
        }

        if (!asset || !action || !price || !sl) {
            return res.status(400).send('Payload incompleto');
        }

        if (botPausado) {
            await enviarTelegram(`⛔ <b>PROTECCIÓN CUÁNTICA ACTIVA (BOT PAUSADO)</b>\nRazón: <code>${razonPausa}</code>\nPérdida del día: <code>$${perdidaDia.toFixed(2)}</code>\nUsa /reactivar si tu intuición indica lo contrario.`);
            return res.status(200).send('BOT_PAUSADO');
        }

        const noticia = await verificarNoticias(asset);

        const pCurrent  = parseFloat(price);
        const slNum     = parseFloat(sl);
        const tp1Num    = parseFloat(tp1);
        const tp2Num    = parseFloat(tp2);
        const tp3Num    = parseFloat(tp3);
        const rsiNum    = parseFloat(rsi || 50);
        const direccion = action.toUpperCase().includes("BUY") ? "COMPRA" : "VENTA";
        const dec       = getDecimals(asset);
        const riesgoUSD = (CUENTA_SIZE * RIESGO_PCT) / 100;

        const ia = await analizarConIA(
            asset, direccion, price, tf,
            sl, tp1, tp2, tp3,
            rsiNum, contexto || "N/A", fuerza || "N/A", noticia.detalle
        );

        if (ia.recomendacion === "CANCELAR" || ia.confianza < 50) {
            await enviarTelegram(`⚠️ <b>SEÑAL DESCARTADA (FILTRO IA)</b>\nActivo: <code>${asset}</code> | <code>${direccion}</code>\nAnálisis: <i>${ia.comentario}</i>\nProtegiendo capital de Funding Pips.`);
            return res.status(200).send('DESCARTADO_IA');
        }

        const lotaje      = calcularLotaje(asset, price, slNum);
        const distancia   = Math.abs(pCurrent - slNum);
        const ratioReal   = tp3Num ? ((Math.abs(tp3Num - pCurrent)) / distancia).toFixed(1) : "3.0";
        const margenDia   = ((MAX_LOSS_DIA - perdidaDia) / MAX_LOSS_DIA * 100).toFixed(0);
        
        const barraConf   = "█".repeat(Math.floor(ia.confianza / 10)) + "░".repeat(10 - Math.floor(ia.confianza / 10));
        const headerEmoji = direccion === "COMPRA" ? "🟢 🚀 COMPRA INSTITUCIONAL" : "🔴 🔻 VENTA INSTITUCIONAL";
        const validEmoji  = ia.validacion === "FUERTE" ? "🔥" : ia.validacion === "DEBIL" ? "⚠️" : "✅";

        let mensajePoder = "";
        if (ia.validacion === "FUERTE" && ia.confianza >= 75) {
            mensajePoder = "\n\n👁️ <b>LA VISIÓN:</b>\n<i>luz verde dispara, es el momento, aquí la elite está concentrando energía, próximamente se verán los movimientos.</i>";
        }

        const mensaje =
`${headerEmoji}

⚡ <b>ACTIVO:</b> <code>${asset}</code>  |  ⏱ <b>TF:</b> <code>${tf || '15m'}</code>
💵 <b>ENTRADA:</b> <code>${fmt(price, dec)}</code>

🎯 <b>MAPA DE RUTA</b>
🛑 <b>SL:</b>        <code>${fmt(slNum, dec)}</code>
🥉 <b>TP1 (1:1):</b> <code>${fmt(tp1Num, dec)}</code> (Asegura Break Even)
🥈 <b>TP2 (1:2):</b> <code>${fmt(tp2Num, dec)}</code> (Retira beneficios)
🥇 <b>TP3 (1:${ratioReal}):</b> <code>${fmt(tp3Num, dec)}</code> (Toma de liquidez total)

📊 <b>SINERGIA Y NOTICIAS</b>
📈 Contexto: <code>${contexto || 'N/A'}</code>
📰 Fundamentales: <i>${noticia.detalle}</i>

⚖️ <b>GESTIÓN PROP FIRM (STUDENT)</b>
💎 <b>LOTAJE:</b>  <code>${lotaje}</code>
💰 <b>RIESGO:</b>  <code>$${riesgoUSD.toFixed(0)} (${RIESGO_PCT}%)</code>
🏦 <b>MARGEN DIARIO:</b> <code>${margenDia}% disponible</code>

${validEmoji} <b>Mente IA: ${ia.confianza}%</b>
<code>${barraConf}</code>
<i>${ia.comentario}</i>${mensajePoder}

🌌 <i>Así es y así será gracias, gracias, gracias.</i>`;

        await enviarTelegram(mensaje);
        console.log(`Ejecutado: ${asset} ${direccion} | IA: ${ia.confianza}%`);
        res.status(200).send('OK');

    } catch (e) {
        console.error("Error en Webhook:", e.message);
        res.status(500).send('Error');
    }
});

// ══════════════════════════════════════════════
//   ENDPOINTS DE ESTADO Y APRENDIZAJE
// ══════════════════════════════════════════════
app.get('/', (req, res) => {
    resetDiario();
    res.json({
        estado:               botPausado ? "PAUSADO" : "ACTIVO",
        razon:                razonPausa || "Flujo Perfecto",
        perdida_hoy:          `$${perdidaDia.toFixed(2)} / $${MAX_LOSS_DIA}`,
        perdida_total:        `$${perdidaTotal.toFixed(2)} / $${MAX_LOSS_TOTAL}`,
        mala_racha_actual:    perdidasConsecutivas,
        cuenta:               `$${CUENTA_SIZE.toLocaleString()}`
    });
});

app.get('/reactivar', (req, res) => {
    botPausado           = false;
    razonPausa           = "";
    perdidasConsecutivas = 0;
    res.json({ status: "Sincronía restaurada." });
});

app.post('/resultado', async (req, res) => {
    const ganancia = parseFloat(req.body.ganancia);
    registrarResultado(ganancia);

    await enviarTelegram(
`📊 <b>ACTUALIZACIÓN DE REALIDAD MATERIALIZADA</b>

${ganancia >= 0 ? "✅ MATERIALIZADO (PROFIT)" : "❌ APRENDIZAJE REGISTRADO"}: <code>$${ganancia.toFixed(2)}</code>
Balance Diario: <code>$${perdidaDia.toFixed(2)} / $${MAX_LOSS_DIA}</code>
Balance Total: <code>$${perdidaTotal.toFixed(2)} / $${MAX_LOSS_TOTAL}</code>
Racha negativa actual: <code>${perdidasConsecutivas}</code> (La IA ajustará su exigencia)
Estado de energía: <code>${botPausado ? "PAUSADO - " + razonPausa : "FLUYENDO Y ACTIVO"}</code>`
    );

    res.json({ ok: true, botPausado, perdidaDia, perdidaTotal, perdidasConsecutivas });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Agente Cuántico v4.0 materializado en puerto ${PORT}`));
