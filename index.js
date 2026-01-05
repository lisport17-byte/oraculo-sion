const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();
app.use(bodyParser.json());

const TELEGRAM_TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.ID;

app.post('/webhook', (req, res) => {
    const message = req.body.text || "Señal del Oráculo activada";
    axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: message
    });
    res.send('Enviado');
});

app.listen(3000, () => console.log('El Oráculo está escuchando...'));
