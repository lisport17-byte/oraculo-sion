// ... (mantenemos express, axios y groq)

app.post('/webhook', async (req, res) => {
    try {
        const data = req.body;
        const payload = typeof data === 'string' ? JSON.parse(data) : data;

        const asset = payload.asset || "Activo";
        const action = payload.action || "SEÑAL";
        const price = payload.price || "0";
        const tf = payload.tf || "15m";
        const liquidez = payload.liquidez || "Zonas de oferta/demanda";

        // 1. LLAMADA A LA IA CON TU PROMPT EVOLUCIONADO
        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }], // Aquí va el prompt que revisamos arriba
            model: "llama-3.3-70b-versatile",
        });

        const analisisIA = cleanHTML(completion.choices[0]?.message?.content || "");

        // 2. EXTRACCIÓN DE NIVELES (Para el cálculo de lotaje)

        // Responde de forma concisa. Primero entrega los niveles numéricos y luego la justificación técnica en menos de 30 palabras
        
        // Buscamos números en el texto de la IA para calcular el riesgo
        
        const numerosEncontrados = analisisIA.match(/\d+\.\d+/g) || [];
        const slIA = numerosEncontrados[0] || null; // Asumimos que el primer número es el SL
        
        // Calculamos lotaje con tus $25 de riesgo
        const lotajeSugerido = slIA ? calcularLotaje(asset, price, slIA) : "Pendiente";

        // 3. CONSTRUCCIÓN VISUAL ELITE (Tu diseño deseado)
        const mensajeFinal = 
`🚨 <b>ORDEN DE LA ÉLITE</b> 🚨

📊 <b>ACTIVO:</b> ${asset} (${tf})
⚡ <b>ACCIÓN:</b> ${action}
💵 <b>PRECIO ENTRADA:</b> ${price}

🛡️ <b>NIVELES SUGERIDOS</b>
🛑 <b>STOP LOSS:</b> ${slIA || 'Ver análisis'}
🎯 <b>TAKE PROFIT:</b> ${numerosEncontrados[1] || '1:3'}
💰 <b>LOTAJE ($25 RISK):</b> <code>${lotajeSugerido}</code>

🤖 <b>IA ANALYZER:</b>
<i>${analisisIA}</i>

💎 <i>Camino a la libertad financiera</i>`;

        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: ID,
            text: mensajeFinal,
            parse_mode: "HTML"
        });

        res.status(200).send('OK');
    } catch (e) {
        res.status(500).send('Error');
    }
});
