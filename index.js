app.post('/webhook', async (req, res) => {
    try {
        const data = req.body;
        const payload = typeof data === 'string' ? JSON.parse(data) : data;

        const asset = payload.asset || "Activo";
        const action = payload.action || "SEÑAL";
        const price = payload.price || "0";
        const tf = payload.tf || "15m";
        const liquidez = payload.liquidez || "Zonas de oferta/demanda";

        // EL PROMPT DEBE IR AQUÍ PARA CAPTURAR LOS DATOS
        const promptIA = `Actúa como un Senior Quant Trader de Wall Street. 
        Analiza: ${action} en ${asset} a precio ${price}. TF: ${tf}. Liquidez: ${liquidez}.
        1. Define valor numérico exacto para STOP LOSS. 
        2. Define valor numérico exacto para TAKE PROFIT (R:R 1:3).
        3. Determina Scalping o Swing.
        4. Justifica brevemente.
        Responde conciso: primero niveles y luego técnica en menos de 30 palabras.`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptIA }],
            model: "llama-3.3-70b-versatile",
        });

        const analisisIA = cleanHTML(completion.choices[0]?.message?.content || "");

        // EXTRACCIÓN DE NIVELES
        const numerosEncontrados = analisisIA.match(/\d+(\.\d+)?/g) || [];
        const slIA = numerosEncontrados[0] || null; 
        
        const lotajeSugerido = slIA ? calcularLotaje(asset, price, slIA) : "Pendiente";

        // CONSTRUCCIÓN VISUAL ELITE
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
        console.error(e);
        res.status(500).send('Error');
    }
});
