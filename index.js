const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

app.use(bodyParser.json());

// Usamos las variables que configuraste en Render
const TOKEN = process.env.TOKEN;
const ID = process.env.ID;

app.post('/webhook', async (req, res) => {
    // Si TradingView envía un mensaje, lo capturamos. Si no, usamos uno por defecto.
    const textoParaEnviar = req.body.text || "🚀 El Oráculo de Sion está reportando sintonía.";
    
    try {
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: textoParaEnviar
        });
        console.log("Mensaje enviado con éxito");
        res.status(200).send('Enviado');
    } catch (error) {
        console.error("Error al enviar a Telegram:", error.message);
        res.status(500).send('Error');
    }
});

// Ruta simple para verificar que el servidor está vivo
app.get('/webhook', (req, res) => {
    res.send("El puente está activo. Esperando señales de TradingView vía POST.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
