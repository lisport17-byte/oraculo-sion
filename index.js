const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

const app = express();
app.use(bodyParser.json());

// --- CONFIGURACIÓN DE LA MATRIX ---
const TOKEN = process.env.TOKEN;
const ID = process.env.ID;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const RIESGO_USD = 25; // Tu semilla de abundancia

// --- LIMPIEZA DE RUIDO ---
const cleanHTML = (str) => str.replace(/[&<>]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;'
}[tag] || tag));

// --- MOTOR DE CÁLCULO CUÁNTICO (LOTAJE) ---
const calcularLotaje = (asset, entry, sl) => {
    try {
        const risk = RIESGO_USD; 
        const entryNum = parseFloat(entry);
        const slNum = parseFloat(sl);
        const diff = Math.abs(entryNum - slNum);
        
        // Si la diferencia es cero o error, protegemos capital
        if (!diff || diff === 0 || isNaN(diff)) return "0.01 (Protección)";

        let lotaje = 0;
        const symbol = asset.toUpperCase();

        // Lógica para Indices, Oros y Forex
        if (symbol.includes("XAU") || symbol.includes("GOLD")) {
            lotaje = risk / (diff * 100); // Oro
        } else if (symbol.includes("US30") || symbol.includes("WS30") || symbol.includes("NAS") || symbol.includes("DJI")) {
            lotaje = risk / diff; // Índices
        } else if (symbol.includes("JPY")) {
            lotaje = risk / (diff * 1000); // Pares con Yen
        } else {
            lotaje = risk / (diff * 100000); // Forex Estándar
        }

        // Redondeo preciso para brokers estándar
        const finalLot = Math.floor(lotaje * 100) / 100;
        return finalLot > 0 ? finalLot.toFixed(2) : "0.01";
    } catch (e) { return "0.01"; }
};

// --- WEBHOOK SINTÉRGICO (El Cerebro) ---
app.post('/webhook', async (req, res) => {
    try {
        // 1. Decodificar la Señal de la Latice
        const { asset, action, price, tf, strategy } = req.body;
        const pCurrent = parseFloat(price);
        
        // Normalizamos la acción (Todo a mayúsculas para evitar dudas)
        const direccion = action.toUpperCase().includes("BUY") ? "COMPRA" : "VENTA";
        
        console.log(`🌀 Señal Recibida: ${asset} | ${direccion} | ${price}`);

        // 2. Consulta al Oráculo (IA) solo para Estructura (SL)
        const promptIA = `Eres un Trader Institucional de Elite.
        ACTIVO: ${asset}. PRECIO ACTUAL: ${pCurrent}. TENDENCIA: ${direccion}.
        
        TU ÚNICA MISIÓN:
        Analiza la estructura técnica inmediata y dame SOLO el precio del STOP LOSS (SL) y el precio del TAKE PROFIT (TP).
        - Si es COMPRA, el SL debe estar debajo del último mínimo relevante (Soporte).
        - Si es VENTA, el SL debe estar encima del último máximo relevante (Resistencia).
        - El SL Y TP debe ser lógico, no muy lejos (Scalping/4H).
        
        RESPUESTA JSON OBLIGATORIA:
        {"sl": "precio_numerico", "reason": "3 FRASES"}
        `;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1, // Frialdad máxima para precisión
            response_format: { type: "json_object" }
        });

        // 3. Procesamiento Matemático (La Ley del 1:3)
        const iaResponse = JSON.parse(completion.choices[0]?.message?.content || "{}");
        let slIA = parseFloat(iaResponse.sl);
        const razon = iaResponse.reason || "Estructura de Mercado";

        // VERIFICACIÓN DE SEGURIDAD (Anti-Alucinación)
        // Si la IA da un SL incoherente (ej: SL arriba en una compra), lo corregimos forzosamente.
        let distancia = 0;
        let tpCalculado = 0;

        if (direccion === "COMPRA") {
            if (slIA >= pCurrent) slIA = pCurrent * 0.995; // Corrección de emergencia (0.5%)
            distancia = pCurrent - slIA;
            tpCalculado = pCurrent + (distancia * 3); // RATIO 1:3 MATEMÁTICO
        } else { // VENTA
            if (slIA <= pCurrent) slIA = pCurrent * 1.005; // Corrección de emergencia (0.5%)
            distancia = slIA - pCurrent;
            tpCalculado = pCurrent - (distancia * 3); // RATIO 1:3 MATEMÁTICO
        }

        // Formato de precios (2 decimales para índices/Yen, 5 para Forex)
        const decimales = (asset.includes("JPY") || asset.includes("US30") || asset.includes("XAU")) ? 2 : 5;

        const slFinal = slIA.toFixed(decimales);
        const tpFinal = tpCalculado.toFixed(decimales);
        const lotajeFinal = calcularLotaje(asset, price, slFinal);

        // 4. Construcción del Mensaje Sagrado
        const emoji = direccion === "COMPRA" ? "🟢 🚀 COMPRA INSTITUCIONAL" : "🔴 🔻 VENTA INSTITUCIONAL";
        
        const mensajeFinal = 
`${emoji}

⚡ <b>ACTIVO:</b> <code>${asset}</code>
precio: <code>${price}</code>

🎯 <b>PROYECCIÓN 1:3 (SINTÉRGICA)</b>
🛑 <b>SL (Estructura):</b> <code>${slFinal}</code>
💰 <b>TP (Ratio 1:3):</b> <code>${tpFinal}</code>

⚖️ <b>GESTIÓN ($25 Riesgo)</b>
💎 <b>LOTAJE:</b> <code>${lotajeFinal}</code>

🧠 <b>ANÁLISIS IA:</b>
<i>"${razon}"</i>

🌌 <b>Así es y así será gracias, gracias, gracias.</b>`;

        // 5. Envío a Telegram
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "HTML"
        });

        res.status(200).send('Sincronia_OK');
    } catch (e) {
        console.error("Error en la Matrix:", e);
        res.status(500).send('Error_Sintergico');
    }
});

app.get('/', (req, res) => res.send('Oráculo v9.9 Elite - Ratio 1:3 Activo'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor Conectado en Puerto ${PORT}`));
