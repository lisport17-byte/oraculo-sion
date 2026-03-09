const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

const app = express();
app.use(bodyParser.json());

// ══════════════════════════════════════════════
//   CONFIGURACION PROP FIRM Y ENTORNO RENDER
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
        if (perdidaDia   >= MAX_LOSS_DIA)    { botPausado = true; razonPausa = "MAX_LOSS_DIA"; }
        if (perdidaTotal >= MAX_LOSS_TOTAL)  { botPausado = true; razonPausa = "MAX_LOSS_TOTAL"; }
        if (perdidasConsecutivas >= 3)       { botPausado = true; razonPausa = "3_PERDIDAS_SEGUIDAS"; }
    } else {
        perdidasConsecutivas = 0;
    }
    operacionesDia++;
};

// ══════════════════════════════════════════════
//   LECTURA DE NARRATIVA DE NOTICIAS (IA INPUT)
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
            
            // Buscamos noticias a 2 horas en el futuro o 30 min en el pasado
            const criticas = noticias.filter(n => {
                if (n.impact !== "High" || n.country !== moneda) return false;
                const diff = (new Date(n.date) - ahora) / 60000;
                return diff >= -30 && diff <= 120; 
            });

            if (criticas.length > 0) {
                const titulos = criticas.map(n => n.title).join(", ");
                return { hayNoticia: true, detalle: `Noticias de alto impacto detectadas (${moneda}): ${titulos}` };
            }
        }
        return { hayNoticia: false, detalle: "Flujo libre, sin noticias macroeconómicas disruptivas a la vista." };
    } catch (e) {
        return { hayNoticia: false, detalle: "No se pudo verificar el calendario. Analizar puramente por estructura técnica e inyección de volumen." };
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
//   ANALISIS IA - TERCER CEREBRO CUÁNTICO
// ══════════════════════════════════════════════
const analizarConIA = async (asset, direccion, price, tf, sl, tp1, tp2, tp3, rsi, contexto, fuerza, contextoNoticia) => {
    const prompt = `Eres la intuición y el análisis analítico combinado de un Trader Institucional de la Élite operando una cuenta Prop Firm de $25,000. Tienes visión sobre los flujos de energía monetaria y la liquidez profunda.

ACTIVO: ${asset} | DIRECCIÓN: ${direccion} | PRECIO ENTRADA: ${price}
MACROESTRUCTURA (Alineación 15m, 1h, 4h): ${contexto}
FUERZA RELATIVA (RSI): ${rsi} (${fuerza})
NARRATIVA FUNDAMENTAL (Noticias): ${contextoNoticia}

Criterios de evaluación obligatorios:
1. ¿El dinero real de la élite se está moviendo en esta dirección basándote en la alineación técnica y la noticia reportada?
2. ¿La noticia inyectará liquidez a nuestro favor o es una trampa de manipulación institucional?
3. ¿Existe el volumen necesario (liquidez profunda) en este activo para cobrar el profit limpiamente?

RESPONDE ÚNICAMENTE EN FORMATO JSON ESTRICTO, sin texto adicional:
{
  "validacion": "FUERTE|MODERADA|DEBIL",
  "confianza": <número entre 0 y 100>,
  "comentario": "<1 o 2 frases combinando el impacto de la noticia y la técnica institucional. Si es FUERTE, debes incluir tu perspectiva sobre la inyección de energía/liquidez.>",
  "recomendacion": "ENTRAR|ESPERAR_RETROCESO|CANCELAR"
}`;

    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1, // Baja temperatura para decisiones analíticas precisas
            response_format: { type: "json_object" }
        });
        return JSON.parse(completion.choices[0]?.message?.content);
    } catch (error) {
        console.error("Error en conexión con la mente maestra (Groq):", error.message);
        return {
            "validacion": "MODERADA",
            "confianza": 65,
            "comentario": "Conexión neuronal temporalmente inactiva. Evaluado por pura estructura algorítmica y fractalidad técnica.",
            "recomendacion": "ENTRAR"
        };
    }
};

// ══════════════════════════════════════════════
//   ENVIO TELEGRAM
// ══════════════════════════════════════════════
const enviarTelegram = async (mensaje) => {
    try {
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: mensaje,
            parse_mode: "HTML"
        });
    } catch (err) {
        console.error("Error enviando a Telegram:", err.message);
    }
};

// ══════════════════════════════════════════════
//   WEBHOOK PRINCIPAL
// ══════════════════════════════════════════════
app.post('/webhook', async (req, res) => {
    try {
        resetDiario();
        const { secret, asset, action, price, sl, tp1, tp2, tp3, tf, rsi, contexto, fuerza } = req.body;

        // INTERCEPTOR DEL TRAILING STOP
        if (req.body.action === "TRAILING") {
            const msgT = `🚨 <b>LUZ VERDE DISPARA, ASEGURA LA ENERGÍA</b>\n\nActivo: <code>${req.body.asset}</code>\nNivel alcanzado: <b>${req.body.level}</b>\n\n🛡️ Mueve tu Stop Loss ahora mismo a: <code>${req.body.new_sl}</code>`;
            await enviarTelegram(msgT);
            return res.status(200).send('TRAILING_OK');
        }

        if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
            return res.status(403).send('Forbidden');
        }

        if (!asset || !action || !price || !sl) {
            return res.status(400).send('Payload incompleto');
        }

        // VERIFICAR PAUSA
        if (botPausado) {
            await enviarTelegram(`⛔ <b>SISTEMA EN REPOSO - PROTECCIÓN DE CAPITAL ACTIVA</b>\nRazon: <code>${razonPausa}</code>\nUsa /reactivar si tu intuición indica lo contrario.`);
            return res.status(200).send('BOT_PAUSADO');
        }

        // LEER NOTICIAS (Ahora no bloquea, analiza)
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

        // ANALISIS IA
        const ia = await analizarConIA(
            asset, direccion, price, tf,
            sl, tp1, tp2, tp3,
            rsiNum, contexto || "N/A", fuerza || "N/A", noticia.detalle
        );

        // FILTRO DE CONFIANZA
        if (ia.recomendacion === "CANCELAR" || ia.confianza < 50) {
            await enviarTelegram(`⚠️ <b>SEÑAL DILUIDA - ENERGÍA NO ALINEADA</b>\nActivo: <code>${asset}</code> | <code>${direccion}</code>\nConfianza IA: <code>${ia.confianza}%</code>\nAnálisis: <i>${ia.comentario}</i>\nEl fractal no está maduro. Mantenemos la pólvora seca.`);
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

        // VERIFICACIÓN DEL CREADOR (FRASES DE PODER)
        let mensajePoder = "";
        if (ia.validacion === "FUERTE" && ia.confianza >= 80) {
            mensajePoder = "\n\n👁️ <b>VISIÓN DEL CREADOR:</b>\n<i>luz verde dispara, es el momento, aquí la elite está concentrando energía, próximamente se verán los movimientos.</i>";
        }

        const mensaje =
`${headerEmoji}

⚡ <b>ACTIVO:</b> <code>${asset}</code>  |  ⏱ <b>TF MICRO:</b> <code>${tf || '15m'}</code>
💵 <b>ENTRADA:</b> <code>${fmt(price, dec)}</code>

🎯 <b>MAPA DE LIQUIDEZ</b>
🛑 <b>SL:</b>        <code>${fmt(slNum, dec)}</code>
🥉 <b>TP1 (1:1):</b> <code>${fmt(tp1Num, dec)}</code> (Retira el 40% de la energía)
🥈 <b>TP2 (1:2):</b> <code>${fmt(tp2Num, dec)}</code> (Retira el 40% de la energía)
🥇 <b>TP3 (1:${ratioReal}):</b> <code>${fmt(tp3Num, dec)}</code> (Deja correr el 20%)

📊 <b>SINTONÍA FRACTAL</b>
📈 Tendencia Macro: <code>${contexto || 'N/A'}</code>
📰 Narrativa: <i>${noticia.detalle}</i>

⚖️ <b>GESTIÓN CUÁNTICA DEL RIESGO</b>
💎 <b>LOTAJE:</b>  <code>${lotaje}</code>
💰 <b>RIESGO:</b>  <code>$${riesgoUSD.toFixed(0)} (${RIESGO_PCT}%)</code>
🏦 <b>MARGEN HOY:</b> <code>${margenDia}% disponible</code>

${validEmoji} <b>CONFIANZA DEL TERCER CEREBRO: ${ia.confianza}%</b>
<code>${barraConf}</code>
<i>${ia.comentario}</i>${mensajePoder}

🎯 <b>ACCIÓN:</b> <code>${recomTexto}</code>`;

        await enviarTelegram(mensaje);
        console.log(`Enviado: ${asset} ${direccion} | Confianza: ${ia.confianza}%`);
        res.status(200).send('OK');

    } catch (e) {
        console.error("Error general webhook:", e.message);
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
    res.json({ status: "Bot reactivado manualmente. Sincronía restaurada." });
});

app.post('/resultado', async (req, res) => {
    const ganancia = parseFloat(req.body.ganancia);
    registrarResultado(ganancia);

    await enviarTelegram(
`📊 <b>ACTUALIZACIÓN DE REALIDAD MATERIALIZADA</b>

${ganancia >= 0 ? "✅ MATERIALIZADO (PROFIT)" : "❌ APRENDIZAJE REGISTRADO"}: <code>$${ganancia.toFixed(2)}</code>
Balance Diario: <code>$${perdidaDia.toFixed(2)} / $${MAX_LOSS_DIA}</code>
Estado del flujo: <code>${botPausado ? "PAUSADO - " + razonPausa : "FLUYENDO Y ACTIVO"}</code>`
    );

    res.json({ ok: true, botPausado, perdidaDia, perdidaTotal });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ojo del Creador v4.0 materializado en el puerto ${PORT}`));
