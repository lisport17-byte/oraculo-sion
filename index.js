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
const RIESGO_USD = 25; // Semilla sagrada inamovible

// --- MOTOR DE CÁLCULO DE LOTAJE (PROTECCIÓN CAPITAL) ---
const calcularLotaje = (asset, entry, sl) => {
    try {
        const risk = RIESGO_USD; 
        const entryNum = parseFloat(entry);
        const slNum = parseFloat(sl);
        const diff = Math.abs(entryNum - slNum);
        
        if (!diff || diff === 0 || isNaN(diff)) return "0.01 (Wait)";

        let lotaje = 0;
        const symbol = asset.toUpperCase();

        // Ajuste fino para la volatilidad explosiva de NAS100 y GOLD
        if (symbol.includes("XAU") || symbol.includes("GOLD")) {
            lotaje = risk / (diff * 100); 
        } else if (symbol.includes("US30") || symbol.includes("NAS") || symbol.includes("NDX")) {
            lotaje = risk / diff; 
            // Reducir lotaje un 10% extra por seguridad en índices explosivos
            lotaje = lotaje * 0.9; 
        } else if (symbol.includes("JPY")) {
            lotaje = risk / (diff * 1000); 
        } else {
            lotaje = risk / (diff * 100000); 
        }

        const finalLot = Math.floor(lotaje * 100) / 100;
        return finalLot > 0.01 ? finalLot.toFixed(2) : "0.01";
    } catch (e) { return "0.01"; }
};

// --- EL CEREBRO ---
app.post('/webhook', async (req, res) => {
    try {
        const { asset, action, price, tf, strategy } = req.body;
        const pCurrent = parseFloat(price);
        const direccion = action.toUpperCase().includes("BUY") ? "COMPRA" : "VENTA";
        
        console.log(`👁️ Ojo del Oráculo: ${asset} | ${direccion} | ${price}`);

        // --- PROMPT DE ALTA JERARQUÍA (SIMULACIÓN FRACTAL) ---
        const promptIA = `Eres el Trader Principal de un Fondo de Cobertura de Wall Street.
        Estás analizando ${asset} en precio ${pCurrent}. La señal técnica es ${direccion}.
        
        TU MISIÓN CRÍTICA:
        1. Ignora el ruido de corto plazo. Piensa en la estructura macro.
        2. Dame un STOP LOSS (SL) técnico preciso.
           - Si es COMPRA: Debajo del último mínimo estructural claro (Soporte).
           - Si es VENTA: Encima del último máximo estructural claro (Resistencia).
        3. El SL debe permitir que el precio respire, NO lo pongas muy pegado porque hay volatilidad.
        
        RESPUESTA JSON OBLIGATORIA:
        {"sl": "precio_numerico", "reason": "motivo_institucional_breve"}
        `;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.2, // Baja temperatura para ser frio y calculador
            response_format: { type: "json_object" }
        });

        const iaResponse = JSON.parse(completion.choices[0]?.message?.content || "{}");
        let slIA = parseFloat(iaResponse.sl);
        const razon = iaResponse.reason || "Estructura Institucional";

        // --- MATEMÁTICA SAGRADA 1:3 & PROTECCIÓN ---
        let distancia = 0;
        let tpCalculado = 0;

        // Corrección de seguridad anti-alucinación
        if (direccion === "COMPRA") {
            if (slIA >= pCurrent) slIA = pCurrent * 0.995; 
            distancia = pCurrent - slIA;
            tpCalculado = pCurrent + (distancia * 3);
        } else { 
            if (slIA <= pCurrent) slIA = pCurrent * 1.005; 
            distancia = slIA - pCurrent;
            tpCalculado = pCurrent - (distancia * 3);
        }

        // Cálculo del Punto de Equilibrio (50% del viaje) para mover a BE
        const precioBE = ((pCurrent + tpCalculado) / 2);

        const decimales = (asset.includes("JPY") || asset.includes("US30") || asset.includes("XAU") || asset.includes("NAS")) ? 2 : 5;
        
        const slFinal = slIA.toFixed(decimales);
        const tpFinal = tpCalculado.toFixed(decimales);
        const beFinal = precioBE.toFixed(decimales);
        const lotajeFinal = calcularLotaje(asset, price, slFinal);

        // --- MENSAJE DE PODER (Telegram) ---
        // Sugerimos LIMIT para evitar entrar tarde por la explosividad
        const tipoOrden = "LIMIT ORDER (Esperar Retroceso)"; 
        const emoji = direccion === "COMPRA" ? "🟢 🐂 COMPRA FUERTE" : "🔴 🐻 VENTA FUERTE";
        
        const mensajeFinal = 
`${emoji}

⚡ <b>ACTIVO:</b> <code>${asset}</code>
📍 <b>ZONA ENTRADA:</b> <code>${price}</code>
⚠️ <b>TIPO:</b> ${tipoOrden}

🎯 <b>OBJETIVO 1:3 (LIBERTAD)</b>
🛑 <b>SL:</b> <code>${slFinal}</code>
💰 <b>TP:</b> <code>${tpFinal}</code>

🛡️ <b>Mover a BE en:</b> <code>${beFinal}</code>
<i>(Cuando toque este precio, protege tu capital)</i>

⚖️ <b>GESTIÓN ($25)</b>
💎 <b>LOTAJE:</b> <code>${lotajeFinal}</code>

🧠 <b>VISIÓN ORÁCULO:</b>
<i>"${razon}"</i>

🌌 <b>Hecho está. Gracias, gracias, gracias.</b>`;

        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "HTML"
        });

        res.status(200).send('Sincronia_V10_Completada');
    } catch (e) {
        console.error("Error Latice:", e);
        res.status(500).send('Error_Sintergico');
    }
});

app.get('/', (req, res) => res.send('Oráculo V10 - Modo Francotirador Activo'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor Listo en Puerto ${PORT}`));
