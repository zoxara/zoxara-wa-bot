const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
app.use(express.json());

let waSock = null;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    waSock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    waSock.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('لطفاً මෙම QR කෝඩ් එක ඔබේ WhatsApp එකෙන් ස්කෑන් කරන්න:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('සම්බන්ධතාව විසඳුණි. නැවත සම්බන්ධ වෙමින් පවතී...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp Bot එක සාර්ථකව සම්බන්ධ විය!');
            
            // බොට් කනෙක්ට් වුණු ගමන් ඔයාගේ ගෲප්ස් වල JID ටික මෙතනින් බලාගන්න පුළුවන්
            try {
                const groups = await waSock.groupFetchAllParticipating();
                console.log('--- ඔබේ WhatsApp ගෲප්ස් ලැයිස්තුව සහ JID ---');
                for (let groupId in groups) {
                    console.log(`ගෲප් නම: ${groups[groupId].subject} --> JID එක: ${groupId}`);
                }
                console.log('---------------------------------------------');
            } catch (error) {
                console.log('ගෲප්ස් ලබාගැනීමේ දෝෂයක්:', error);
            }
        }
    });

    waSock.ev.on('creds.update', saveCreds);
}

// වෙබ් අඩවියෙන් ඇණවුම් ලබා ගන්නා API Endpoint එක
app.post('/api/send-order', async (req, res) => {
    try {
        const orderData = req.body;
        
        let message = `*New Order Received!*%0A%0A` +
                      `📦 *Product:* ${orderData.productName}%0A` +
                      `🔢 *Quantity:* ${orderData.quantity}%0A` +
                      `💰 *Total Price:* ${orderData.totalPrice}%0A` +
                      `👤 *Name:* ${orderData.customerName}%0A` +
                      `📞 *Phone:* ${orderData.customerPhone}%0A` +
                      `📍 *Address:* ${orderData.customerAddress}%0A` +
                      `📝 *Note:* ${orderData.customerNote || 'None'}`;

        // මෙතැනට ඔයාට බලාගන්න ලැබෙන "Office zoxara" ගෲප් එකේ JID එක දාන්න පුළුවන්
        const TARGET_GROUP_JID = orderData.groupId || "YOUR_GROUP_JID_HERE";

        if (waSock) {
            await waSock.sendMessage(TARGET_GROUP_JID, { text: decodeURIComponent(message) });
            return res.status(200).json({ success: true, message: "Order sent to WhatsApp group!" });
        } else {
            return res.status(500).json({ success: false, message: "WhatsApp bot not connected yet." });
        }
    } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startBot();
});
        
