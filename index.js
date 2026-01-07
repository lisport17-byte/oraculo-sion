// Nueva lógica para detectar CHoCH o BOS
    const isSMC = action.includes("CHOCH") || action.includes("BOS");
    
    // Ajustamos el Prompt para que la IA entienda el CHoCH
    const promptIA = `Actúa como un Senior Quants Trader. 
    Analiza esta señal: ${action} en ${asset} a precio ${price}. 
    ${isSMC ? "ADVERTENCIA: Se ha detectado un cambio de estructura (SMC)." : ""}
    Stop Loss: ${sl}, Take Profit: ${tp}. Temporalidad: ${tf} min.

    Tu análisis debe:
    1. Si es ${action} tipo CHOCH, explicar si es un cambio de tendencia inminente.
    2. Evaluar el riesgo/beneficio (R:R).
    3. Responder con máxima autoridad financiera en 3 frases.`;

    // Ajuste en el diseño del mensaje para Telegram
    const emojiAccion = action.includes('BUY') || action.includes('Bullish') ? '📈' : '📉';
    const titulo = isSMC ? "⚠️ CAMBIO DE ESTRUCTURA DETECTADO" : "🚀 ORDEN DE LA ÉLITE v5.0";

    const mensajeFinal = `<b>${titulo}</b>\n\n` +
                         `<b>Activo:</b> ${asset}\n` +
                         `<b>Evento:</b> ${action} ${emojiAccion}\n` +
                         `<b>Precio:</b> ${price}\n` +
                         `<b>Temporalidad:</b> ${tf}\n\n` +
                         `🛡️ <b>ZONAS DE PROTECCIÓN</b>\n` +
                         `<b>SL:</b> ${sl}\n` +
                         `<b>TP:</b> ${tp}\n\n` +
                         `🤖 <b>IA ANALYZER:</b> <i>${analisisIA}</i>`;
