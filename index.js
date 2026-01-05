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
    const textoTradingView = req.body.text || "Señal activa";
    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: `Analiza esta señal: ${textoTradingView}. Responde en una frase corta si es buena oportunidad.` }],
            model: "llama3-8b-8192",
        });

        const analisisIA = completion.choices[0]?.message?.content || "IA analizando...";
        const mensajeFinal = `🚨 **ORDEN DE LA ÉLITE** 🚨\n\n${textoTradingView}\n\n🤖 **IA ANALYZER:** ${analisisIA}`;

        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "Markdown" 
        });
        res.status(200).send('OK');
    } catch (e) {
        console.log("Error:", e.message);
        res.status(200).send('Error mitigado');
    }
});

app.get('/webhook', (req, res) => res.send("IA de Sion Operativa"));
app.listen(process.env.PORT || 3000);
