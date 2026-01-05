const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk'); // <--- Llamamos al robot Groq

const app = express();
app.use(bodyParser.json());

// Usamos las llaves que guardaste en el "bolsillo" de Render
const TOKEN = process.env.TOKEN;
const ID = process.env.ID;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY }); 

app.post('/webhook', async (req, res) => {
    // Recibimos la señal de TradingView
    const textoTradingView = req.body.text || "El Oráculo de Sion está reportando sintonía.";

    try {
        // --- AQUÍ EL ROBOT PIENSA ---
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: `Analiza esta señal de trading: "${textoTradingView}". Di si es una buena oportunidad institucional en una sola frase muy corta y profesional.`
                }
            ],
            model: "llama3-8b-8192", // El modelo más rápido del mundo
        });

        const analisisIA = completion.choices[0]?.message?.content || "Análisis no disponible";
        
        // --- ARMAMOS EL MENSAJE PARA TELEGRAM ---
        const mensajeFinal = `🚨 **ORDEN DE LA ÉLITE** 🚨\n\n${textoTradingView}\n\n🤖 **IA ANALYZER:** ${analisisIA}`;

        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "Markdown" 
        });

        console.log("Mensaje con IA enviado con éxito");
        res.status(200).send('Enviado');
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).send('Error');
    }
});

app.get('/webhook', (req, res) => {
    res.send("El puente con IA está activo y vigilando el Oro.");
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Servidor corriendo...");
});
