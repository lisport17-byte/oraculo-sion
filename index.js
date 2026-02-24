// ------------------------------------------------------------------
// CODIGO PROYECTO V12.1: "EL DESPERTAR DEL ARQUITECTO" - OPTIMIZADO RENDER
// ------------------------------------------------------------------

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');
const moment = require('moment-timezone');

const app = express();
app.use(bodyParser.json());

// Configuración de API Keys y Entorno
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const RIESGO_USD = 25; 
const PORT = process.env.PORT || 10000; // Render usa el puerto 10000 por defecto

// --- MEMORIA DE ERRORES & LOGS ---
const logError = (error, contexto) => {
    console.error(`[Memoria de Errores] ${contexto}:`, error.message);
};

const calcularLotaje = (asset, entry, sl) => {
    try {
        const risk = RIESGO_USD; 
        const entryNum = parseFloat(entry);
        const slNum = parseFloat(sl);
        const diff = Math.abs(entryNum - slNum);
        if (!diff || diff === 0) return "0.01";
        
        let lotaje = 0;
        const symbol = asset.toUpperCase();

        if (symbol.includes("XAU") || symbol.includes("GOLD")) {
            lotaje = risk / (diff * 100); 
        } else if (symbol.includes("US30") || symbol.includes("NAS") || symbol.includes("NDX")) {
            lotaje = (risk / diff) * 0.9; 
        } else if (symbol.includes("JPY")) {
            lotaje = risk / (diff * 1000); 
        } else { 
            lotaje = risk / (diff * 100000); 
        }
        const finalLot = Math.floor(lotaje * 100) / 100;
        return finalLot > 0.01 ? finalLot.toFixed(2) : "0.01";
    } catch (e) { 
        logError(e, "Cálculo de Lotaje");
        return "0.01"; 
    }
};

// Ruta Raíz para evitar errores de Health Check en Render
app.get('/', (req, res) => {
    res.send('El Arquitecto está despierto y vigilando.');
});

// WEBHOOK PRINCIPAL
app.post('/webhook', async (req, res) => {
    try {
        const { asset, action, price } = req.body;
        
        // Validación de datos de entrada
        if (!asset || !action || !price) {
            return res.status(400).send('Faltan datos en el Webhook');
        }

        const nowNY = moment().tz("America/New_York");
        const hora = nowNY.hour();
        const minutos = nowNY.minute();
        const tiempoDecimal = hora + (minutos / 60);

        // --- FILTRO HORARIO: 4:00 AM a 4:00 PM NY ---
        if (tiempoDecimal < 4.0 || tiempoDecimal > 16.0) {
            console.log(`zzz El Arquitecto descansa. Hora NY: ${nowNY.format('HH:mm')}.`);
            return res.status(200).send('Fuera_de_Horario_Poder');
        }

        const pCurrent = parseFloat(price);
        const direccion = action.toUpperCase().includes("BUY") ? "COMPRA" : "VENTA";
        
        const promptIA = `
        Analiza el token/activo ${asset} al precio ${pCurrent}. Dirección: ${direccion}.
        Verifica: 1. Movimiento de dinero/liquidez. 2. Riesgo de estafa (HoneyPot/Creador). 3. Presencia de ballenas.
        Estructura de H4/H1 para SL en 15m. Ratio 1:3.
        Respuesta JSON: {"sl": "precio_numerico", "reason": "Luz verde dispara, es el momento, aquí la elite está concentrando energía, próximamente se verán los movimientos"}
        `;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const iaResponse = JSON.parse(completion.choices[0]?.message?.content || "{}");
        let slIA = parseFloat(iaResponse.sl) || (direccion === "COMPRA" ? pCurrent * 0.99 : pCurrent * 1.01);
        let razonIA = iaResponse.reason;

        let distancia = Math.abs(pCurrent - slIA);
        let tpCalculado = direccion === "COMPRA" ? pCurrent + (distancia * 3) : pCurrent - (distancia * 3);
        const beFinal = ((pCurrent + tpCalculado) / 2);

        const decimales = (asset.includes("JPY") || asset.includes("US30") || asset.includes("NAS") || asset.includes("XAU")) ? 2 : 5;
        const lotajeFinal = calcularLotaje(asset, price, slIA.toFixed(decimales));

        const mensajeFinal = 
`🦅 <b>EL DESPERTAR DEL ARQUITECTO</b>

⚡ <b>ACTIVO:</b> <code>${asset}</code>
📍 <b>ENTRADA:</b> <code>${price}</code>
⏳ <b>SESIÓN:</b> LONDRES/NY (Activa)

🛑 <b>SL:</b> <code>${slIA.toFixed(decimales)}</code>
💰 <b>TP:</b> <code>${tpCalculado.toFixed(decimales)}</code>
🛡️ <b>BE:</b> <code>${beFinal.toFixed(decimales)}</code>

💎 <b>LOTAJE:</b> <code>${lotajeFinal}</code>

👁️ <b>GUÍA:</b> "${razonIA}"

<b>así es y así será gracias, gracias, gracias.</b>`;

        await axios.post(`https://api.telegram.org/bot${process.env.TOKEN}/sendMessage`, {
            chat_id: process.env.ID,
            text: mensajeFinal,
            parse_mode: "HTML"
        });

        res.status(200).send('V12.1_Sincronizada');
    } catch (e) {
        logError(e, "Flujo Webhook");
        res.status(500).send('Error_Interno');
    }
});

// --- INICIO DEL SERVIDOR ---
// Escuchamos en 0.0.0.0 para que Render pueda acceder externamente
app.listen(PORT, '0.0.0.0', () => {
    console.log(`///////////////////////////////////////////////////////////`);
    console.log(`Arquitecto escuchando en puerto ${PORT}`);
    console.log(`///////////////////////////////////////////////////////////`);
});
