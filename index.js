const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

const app = express();
app.use(bodyParser.json());

// ══════════════════════════════════════════════
//   CONFIGURACION PROP FIRM - FUNDING PIPS
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
//   CONTROL DE RIESGO DIARIO
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
        perdidasConsecutivas = 0;
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
        if (perdidaDia   >= MAX_LOSS_DIA)   { botPausado = true; razonPausa = "MAX_LOSS_DIA"; }
        if (perdidaTotal >= MAX_LOSS_TOTAL)  { botPausado = true; razonPausa = "MAX_LOSS_TOTAL"; }
        if (perdidasConsecutivas >= 3)       { botPausado = true; razonPausa = "3_PERDIDAS_SEGUIDAS"; }
    } else {
        perdidasConsecutivas = 0;
    }
    operacionesDia++;
};

// ══════════════════════════════════════════════
//   FILTRO DE NOTICIAS AUTOMATICO
// ══════════════════════════════════════════════
const verificarNoticias = async (asset) => {
    try {
        const ahora = new Date();
        const res = await axios.get('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { timeout: 3000 });
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
                return diff >= -30 && diff <= 30;
            });
            if (criticas.length > 0) return { hayNoticia: true, detalle: criticas[0].title };
        }
        return { hayNoticia: false };
    } catch (e) {
        return { hayNoticia: false };
    }
};

// ══════════════════════════════════════════════
//   HELPERS
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

        if (sym.includes("XAU") || sym.includes("GOLD")) {
            lotaje = riesgoUSD / (diff * 100);
        } else if (sym.includes("US30") || sym.includes("DJI")) {
            lotaje = riesgoUSD / (diff * 1);
        } else if (sym.includes("NAS")) {
            lotaje = riesgoUSD / (diff * 2);
        } else if (sym.includes("JPY")) {
            lotaje = riesgoUSD / (diff * 1000);
        } else {
            lotaje = riesgoUSD / (diff * 100000);
        }

        const final = Math.floor(lotaje * 100) / 100;
        return final > 0 ? final.toFixed(2) : "0.01";
    } catch { return "0.01"; }
};

// ══════════════════════════════════════════════
//   ANALISIS IA
// ══════════════════════════════════════════════
const analizarConIA = async (asset, direccion, price, tf, sl, tp1, tp2, tp3, rsi, contexto, fuerza) => {
    const prompt = `Eres un Trader Institucional de Elite operando cuenta Prop Firm de $25,000.
Analiza esta senal con criterio estricto de proteccion de capital:

ACTIVO: ${asset} | ENTRADA: ${price} | DIRECCION: ${direccion} | TF: ${tf}
SL: ${sl} | TP1: ${tp1} | TP2: ${tp2} | TP3: ${tp3}
RSI: ${rsi} | CONTEXTO: ${contexto} | FUERZA: ${fuerza}

Criterios de evaluacion:
- Ratio riesgo/beneficio es logico para prop firm?
- RSI apoya la direccion sin zona extrema?
- Contexto de tendencia coherente?
- Vale la pena arriesgar capital de prop firm en esta senal?

RESPONDE SOLO EN JSON sin texto adicional:
{"validacion":"FUERTE|MODERADA|DEBIL","confianza":85,"comentario":"maximo 2 frases","recomendacion":"ENTRAR|ESPERAR_RETROCESO|CANCELAR"}`;

    const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        response_format: { type: "json_object" }
    });

    return JSON.parse(
        completion.choices[0]?.message?.content ||
        '{"validacion":"MODERADA","confianza":60,"comentario":"Senal en parametros normales.","recomendacion":"ENTRAR"}'
    );
};

// ══════════════════════════════════════════════
//   ENVIO TELEGRAM
// ══════════════════════════════════════════════
const enviarTelegram = async (mensaje) => {
    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: mensaje,
        parse_mode: "HTML"
    });
};

// ══════════════════════════════════════════════
//   WEBHOOK PRINCIPAL
// ══════════════════════════════════════════════
app.post('/webhook', async (req, res) => {
    try {
        resetDiario();

        const { secret, asset, action, price, sl, tp1, tp2, tp3, tf, rsi, contexto, fuerza } = req.body;

        if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
            return res.status(403).send('Forbidden');
        }

        if (!asset || !action || !price || !sl) {
            return res.status(400).send('Payload incompleto');
        }

        // VERIFICAR PAUSA
        if (botPausado) {
            await enviarTelegram(
`⛔ <b>BOT PAUSADO - PROTECCION ACTIVA</b>

Razon: <code>${razonPausa}</code>
Perdida del dia: <code>$${perdidaDia.toFixed(2)}</code>
Perdida total: <code>$${perdidaTotal.toFixed(2)}</code>
Senal ignorada: <code>${asset} ${action}</code>

Usa /reactivar si deseas continuar manualmente.`
            );
            return res.status(200).send('BOT_PAUSADO');
        }

        // VERIFICAR NOTICIAS
        const noticia = await verificarNoticias(asset);
        if (noticia.hayNoticia) {
            await enviarTelegram(
`📰 <b>SENAL BLOQUEADA - NOTICIA ALTO IMPACTO</b>

Activo: <code>${asset}</code>
Noticia: <i>${noticia.detalle}</i>
Zona de peligro: 30 min antes y despues

El bot retomara cuando pase la noticia.`
            );
            return res.status(200).send('BLOQUEADO_NOTICIA');
        }

        const pCurrent  = parseFloat(price);
        const slNum     = parseFloat(sl);
        const tp1Num    = parseFloat(tp1);
        const tp2Num    = parseFloat(tp2);
        const tp3Num    = parseFloat(tp3);
        const rsiNum    = parseFloat(rsi || 50);
        const direccion = action.toUpperCase().includes("BUY") ? "COMPRA" : "VENTA";
        const dec       = getDecimals(asset);
        const riesgoUSD = (CUENTA_SIZE * RIESGO_PCT) / 100;

        // ANALISIS IA
        const ia = await analizarConIA(
            asset, direccion, price, tf,
            sl, tp1, tp2, tp3,
            rsiNum, contexto || "N/A", fuerza || "N/A"
        );

        // FILTRO DE CONFIANZA
        if (ia.recomendacion === "CANCELAR" || ia.confianza < 50) {
            await enviarTelegram(
`⚠️ <b>SENAL DESCARTADA POR IA</b>

Activo: <code>${asset}</code> | <code>${direccion}</code>
Confianza IA: <code>${ia.confianza}%</code>
Razon: <i>${ia.comentario}</i>

La senal no supero el filtro de calidad.`
            );
            return res.status(200).send('DESCARTADO_IA');
        }

        // CALCULOS
        const lotaje      = calcularLotaje(asset, price, slNum);
        const distancia   = Math.abs(pCurrent - slNum);
        const ratioReal   = tp3Num ? ((Math.abs(tp3Num - pCurrent)) / distancia).toFixed(1) : "3.0";
        const margenDia   = ((MAX_LOSS_DIA - perdidaDia) / MAX_LOSS_DIA * 100).toFixed(0);
        const barraConf   = "█".repeat(Math.floor(ia.confianza / 10)) + "░".repeat(10 - Math.floor(ia.confianza / 10));

        const headerEmoji = direccion === "COMPRA" ? "🟢 🚀 COMPRA INSTITUCIONAL" : "🔴 🔻 VENTA INSTITUCIONAL";
        const validEmoji  = ia.validacion === "FUERTE" ? "🔥" : ia.validacion === "DEBIL" ? "⚠️" : "✅";
        const recomTexto  = ia.recomendacion === "ENTRAR" ? "✅ ENTRAR AHORA" : "⏳ ESPERAR RETROCESO";

        const mensaje =
`${headerEmoji}

⚡ <b>ACTIVO:</b> <code>${asset}</code>  |  ⏱ <b>TF:</b> <code>${tf || 'N/A'}</code>
💵 <b>ENTRADA:</b> <code>${fmt(price, dec)}</code>

🎯 <b>NIVELES</b>
🛑 <b>SL:</b>        <code>${fmt(slNum, dec)}</code>
🥉 <b>TP1 (1:1):</b> <code>${fmt(tp1Num, dec)}</code> → cierra 40%
🥈 <b>TP2 (1:2):</b> <code>${fmt(tp2Num, dec)}</code> → cierra 40%
🥇 <b>TP3 (1:${ratioReal}):</b> <code>${fmt(tp3Num, dec)}</code> → cierra 20%

📊 <b>CONTEXTO</b>
📈 Tendencia: <code>${contexto || 'N/A'}</code>  |  RSI: <code>${rsiNum.toFixed(1)}</code>

⚖️ <b>GESTION PROP FIRM</b>
💎 <b>LOTAJE:</b>  <code>${lotaje}</code>
💰 <b>RIESGO:</b>  <code>$${riesgoUSD.toFixed(0)} (${RIESGO_PCT}%)</code>
🏦 <b>MARGEN HOY:</b> <code>${margenDia}% disponible</code>

${validEmoji} <b>CONFIANZA IA: ${ia.confianza}%</b>
<code>${barraConf}</code>
<i>${ia.comentario}</i>

🎯 <b>ACCION:</b> <code>${recomTexto}</code>

🌌 <i>Protege el capital. Opera con disciplina.</i>`;

        await enviarTelegram(mensaje);
        console.log(`Enviado: ${asset} ${direccion} | Confianza: ${ia.confianza}%`);
        res.status(200).send('OK');

    } catch (e) {
        console.error("Error:", e.message);
        res.status(500).send('Error');
    }
});

// ══════════════════════════════════════════════
//   ENDPOINTS DE CONTROL
// ══════════════════════════════════════════════
app.get('/', (req, res) => {
    resetDiario();
    res.json({
        status:               botPausado ? "PAUSADO" : "ACTIVO",
        razon_pausa:          razonPausa || "ninguna",
        perdida_dia:          `$${perdidaDia.toFixed(2)} / $${MAX_LOSS_DIA}`,
        perdida_total:        `$${perdidaTotal.toFixed(2)} / $${MAX_LOSS_TOTAL}`,
        operaciones_hoy:      operacionesDia,
        perdidas_consecutivas: perdidasConsecutivas,
        cuenta:               `$${CUENTA_SIZE.toLocaleString()}`,
        riesgo_por_op:        `${RIESGO_PCT}% = $${((CUENTA_SIZE * RIESGO_PCT) / 100).toFixed(0)}`
    });
});

app.get('/reactivar', (req, res) => {
    botPausado           = false;
    razonPausa           = "";
    perdidasConsecutivas = 0;
    res.json({ status: "Bot reactivado manualmente" });
});

app.post('/resultado', async (req, res) => {
    const ganancia = parseFloat(req.body.ganancia);
    registrarResultado(ganancia);

    await enviarTelegram(
`📊 <b>RESULTADO REGISTRADO</b>

${ganancia >= 0 ? "✅ GANADA" : "❌ PERDIDA"}: <code>$${ganancia.toFixed(2)}</code>
Perdida dia: <code>$${perdidaDia.toFixed(2)} / $${MAX_LOSS_DIA}</code>
Perdida total: <code>$${perdidaTotal.toFixed(2)} / $${MAX_LOSS_TOTAL}</code>
Rachas negativas: <code>${perdidasConsecutivas}</code>
Estado bot: <code>${botPausado ? "PAUSADO - " + razonPausa : "ACTIVO"}</code>`
    );

    res.json({ ok: true, botPausado, perdidaDia, perdidaTotal });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot Prop Firm Elite v3.0 activo en puerto ${PORT}`));
