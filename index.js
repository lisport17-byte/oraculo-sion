const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const ID = process.env.ID;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY }); 

app.post('/webhook', async (req, res) => {
    // 1. Capturamos el texto. Si viene de TradingView, suele estar en req.body (depende de cómo envíes el JSON)
    // Asegúrate de que en TradingView el Webhook envíe: {"text": "{{strategy.order.alert_message}}"}
    const textoTradingView = req.body.text || "Señal activa";

    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: `Analiza esta señal de trading: ${textoTradingView}. Responde en una sola frase muy corta si es una buena oportunidad o qué precaución tomar.` }],
            model: "llama-3.3-70b-versatile",
        });

        const analisisIA = completion.choices[0]?.message?.content || "IA analizando...";

        // 2. Construimos el mensaje usando etiquetas HTML (<b> para negrita)
        // Esto evita que los puntos decimales rompan el mensaje
        const mensajeFinal = `🚨 <b>ORDEN DE LA ÉLITE</b> 🚨\n\n${textoTradingView}\n\n🤖 <b>IA ANALYZER:</b> ${analisisIA}`;

        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "HTML" // <-- CAMBIO CLAVE: De Markdown a HTML
        });
        
        res.status(200).send('OK');
    } catch (e) {
        console.log("Error detectado en el vuelo:", e.message);
        res.status(500).send('Error en el servidor');
    }
});

app.get('/webhook', (req, res) => res.send("IA de Sion Operativa - Frecuencia Morpho 548"));
app.listen(process.env.PORT || 3000);
