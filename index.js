// ------------------------------------------------------------------
// CODIGO 548 - PROYECTO V12: "EL ARQUITECTO FRACTAL"
// Misión: Libertad, Tiempo y Espacio.
// Estrategia: Fusión 10K + LuxAlgo | Filtro Horario | Ratio 1:3
// ------------------------------------------------------------------

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');
// Importamos el reloj maestro
const moment = require('moment-timezone');

const app = express();
app.use(bodyParser.json());

// --- CONFIGURACIÓN DE LA MATRIX (Variables de Entorno) ---
const TOKEN = process.env.TOKEN;
const ID = process.env.ID;
// Clave de la Inteligencia Artificial
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- GESTIÓN DE CAPITAL ---
const RIESGO_USD = 25; // Tu escudo inamovible

// --- MOTOR DE CÁLCULO DE LOTAJE ---
const calcularLotaje = (asset, entry, sl) => {
    try {
        const risk = RIESGO_USD; 
        const entryNum = parseFloat(entry);
        const slNum = parseFloat(sl);
        // Distancia absoluta entre entrada y stop loss
        const diff = Math.abs(entryNum - slNum);
        
        if (!diff || diff === 0) return "0.01";

        let lotaje = 0;
        const symbol = asset.toUpperCase();

        // AJUSTE 1: ORO (XAU/GOLD) - Volatilidad Media/Alta
        if (symbol.includes("XAU") || symbol.includes("GOLD")) {
            lotaje = risk / (diff * 100); 
        } 
        // AJUSTE 2: INDICES (US30, NAS100) - Alta Volatilidad
        else if (symbol.includes("US30") || symbol.includes("NAS") || symbol.includes("NDX")) {
            // Reducimos un 10% el lotaje por seguridad en los latigazos
            lotaje = (risk / diff) * 0.9; 
        } 
        // AJUSTE 3: PARES CON YEN (JPY)
        else if (symbol.includes("JPY")) {
            lotaje = risk / (diff * 1000); 
        } 
        // AJUSTE 4: FOREX STANDARD (EURUSD, GBPUSD, ETC)
        else { 
            lotaje = risk / (diff * 100000); 
        }

        // Redondeo a 2 decimales y mínimo 0.01
        const finalLot = Math.floor(lotaje * 100) / 100;
        return finalLot > 0.01 ? finalLot.toFixed(2) : "0.01";
    } catch (e) { return "0.01"; }
};

// --- EL CEREBRO DEL ORÁCULO ---
app.post('/webhook', async (req, res) => {
    try {
        const { asset, action, price } = req.body;

        // ---------------------------------------------------------
        // FILTRO 1: EL GUARDIÁN DEL TIEMPO (HORARIO NUEVA YORK)
        // ---------------------------------------------------------
        // Obtenemos la hora exacta en Nueva York ahora mismo
        const nowNY = moment().tz("America/New_York");
        const hora = nowNY.hour();   // Hora (0-23)
        const minutos = nowNY.minute();
        // Convertimos a decimal (ej: 8:30 = 8.5)
        const tiempoDecimal = hora + (minutos / 60);

        // REGLA: Solo operar de 8:30 AM (8.5) a 2:00 PM (14.0)
        // Fuera de esto, el bot duerme para respetar tu descanso.
        if (tiempoDecimal < 8.5 || tiempoDecimal > 14.0) {
            console.log(`zzz El mercado duerme. Hora NY: ${nowNY.format('HH:mm')}. Señal ignorada.`);
            return res.status(200).send('Fuera_de_Horario_Elite');
        }

        // ---------------------------------------------------------
        // FILTRO 2: LISTA NEGRA DE ACTIVOS LENTOS
        // ---------------------------------------------------------
        if (asset.includes("USDCAD") || asset.includes("CHF")) {
             console.log(`🚫 Activo Lento (${asset}) detectado e ignorado.`);
             return res.status(200).send('Activo_Lento_Ignorado');
        }

        const pCurrent = parseFloat(price);
        const direccion = action.toUpperCase().includes("BUY") ? "COMPRA" : "VENTA";
        
        console.log(`⚡ V12 PROCESANDO: ${asset} | ${direccion} | ${price}`);

        // ---------------------------------------------------------
        // FILTRO 3: INTELIGENCIA FRACTAL (H4 en 15m)
        // ---------------------------------------------------------
        const promptIA = `
        Actúa como un Trader Institucional Senior.
        Estás recibiendo una alerta de entrada en ${asset} al precio ${pCurrent}. Dirección: ${direccion}.
        
        TU MISIÓN:
        Aunque la alerta viene de un gráfico de 15 minutos, TU ANÁLISIS debe buscar la estructura MACRO (H1 o H4).
        Necesitamos un STOP LOSS (SL) que esté protegido por una zona de liquidez fuerte, no por ruido.
        
        REGLAS:
        1. Si es COMPRA: SL debajo del último mínimo fuerte estructural.
        2. Si es VENTA: SL encima del último máximo fuerte estructural.
        3. El objetivo es capturar un RATIO 1:3.
        
        RESPUESTA OBLIGATORIA JSON:
        {"sl": "precio_numerico", "reason": "Luz verde dispara, [explicacion_corta]"}
        `;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1, // Frialdad máxima
            response_format: { type: "json_object" }
        });

        const iaResponse = JSON.parse(completion.choices[0]?.message?.content || "{}");
        let slIA = parseFloat(iaResponse.sl);
        let razon = iaResponse.reason || "Estructura alineada con H4";

        // Anclaje Psicológico: Aseguramos la frase de poder
        if (!razon.includes("Luz verde")) razon = "Luz verde dispara, es el momento.";

        // ---------------------------------------------------------
        // MATEMÁTICA SAGRADA: CÁLCULO 1:3 & PROTECCIÓN
        // ---------------------------------------------------------
        let distancia = 0;
        let tpCalculado = 0;

        // Cálculo de TP basado en Riesgo 1 : Beneficio 3
        if (direccion === "COMPRA") {
            // Seguridad: Si la IA alucina un SL por encima del precio, lo corregimos
            if (slIA >= pCurrent) slIA = pCurrent * 0.995; 
            distancia = pCurrent - slIA;
            tpCalculado = pCurrent + (distancia * 3); 
        } else { 
            // Seguridad: Si la IA alucina un SL por debajo del precio, lo corregimos
            if (slIA <= pCurrent) slIA = pCurrent * 1.005; 
            distancia = slIA - pCurrent;
            tpCalculado = pCurrent - (distancia * 3); 
        }

        // Breakeven al 50% del camino
        const precioBE = ((pCurrent + tpCalculado) / 2);

        // Formato de decimales según el activo
        const decimales = (asset.includes("JPY") || asset.includes("US30") || asset.includes("NAS") || asset.includes("XAU")) ? 2 : 5;
        
        const slFinal = slIA.toFixed(decimales);
        const tpFinal = tpCalculado.toFixed(decimales);
        const beFinal = precioBE.toFixed(decimales);
        
        // Recalculamos lotaje final con el SL exacto
        const lotajeFinal = calcularLotaje(asset, price, slFinal);

        // ---------------------------------------------------------
        // MENSAJE DE PODER A TELEGRAM
        // ---------------------------------------------------------
        const emoji = direccion === "COMPRA" ? "🟢 🐂 FUERZA H4" : "🔴 🐻 FUERZA H4";
        
        const mensajeFinal = 
`${emoji}

⚡ <b>ACTIVO:</b> <code>${asset}</code>
📍 <b>ENTRADA:</b> <code>${price}</code>
⏳ <b>SESIÓN:</b> NUEVA YORK (Activa)

🎯 <b>PROFIT 1:3 (INSTITUCIONAL)</b>
🛑 <b>SL:</b> <code>${slFinal}</code>
💰 <b>TP:</b> <code>${tpFinal}</code>

🛡️ <b>Mover a BE:</b> <code>${beFinal}</code>
<i>(Al 50% del recorrido, protege tu paz)</i>

⚖️ <b>RIESGO:</b> $25 USD
💎 <b>LOTAJE:</b> <code>${lotajeFinal}</code>

👁️ <b>GUÍA SINTÉRGICA:</b>
<i>"${razon}"</i>

🌌 <b>Aquí la elite está concentrando energía. Próximamente se verán los movimientos.</b>`;

        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "HTML"
        });

        res.status(200).send('V12_Sincronizada');
    } catch (e) {
        console.error("Error en la Latice:", e);
        res.status(500).send('Error_Interno');
    }
});

app.get('/', (req, res) => res.send('Oráculo V12 - Arquitecto Fractal :: ACTIVO'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR V12 INICIADO EN PUERTO ${PORT}`));
